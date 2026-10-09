const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');
const { encryptFileInPlace, decryptFileToBuffer } = require('../fileCrypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES_PER_MEETING = 50;
const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.vbs',
  '.ps1',
  '.dll',
];

// Browsers send file names as raw bytes, so restore the real characters
// and remove anything that could be used as a path
function cleanFileName(name) {
  const decoded = Buffer.from(String(name || ''), 'latin1').toString('utf8');
  const clean = path
    .basename(decoded)
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 200);
  return clean || 'file';
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  // Files are saved under a random name, never under the name the user chose
  filename: (req, file, cb) => cb(null, crypto.randomUUID()),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(cleanFileName(file.originalname)).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(extension)) {
      const err = new Error('This type of file is not allowed');
      err.code = 'BLOCKED_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

function toClient(row) {
  return {
    id: row.id,
    name: row.original_name,
    size: Number(row.size_bytes),
    type: row.mime_type,
    uploaderId: row.uploader_id,
    uploaderName: row.uploader_name,
    createdAt: row.created_at,
  };
}

// Find the meeting from the code in the address
async function loadMeeting(req, res, next) {
  const code = String(req.params.code || '').trim().toLowerCase();

  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({ message: 'That meeting code is not valid' });
  }

  try {
    const result = await pool.query(
      'SELECT id, room_code FROM meetings WHERE room_code = $1',
      [code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No meeting found with that code' });
    }
    req.meeting = result.rows[0];
    next();
  } catch (err) {
    console.error('Load meeting error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = function createFileRoutes(io) {
  const router = express.Router({ mergeParams: true });
  router.use(authMiddleware);

  // List the files shared in a meeting
  router.get('/', loadMeeting, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT f.*, u.name AS uploader_name
         FROM meeting_files f
         JOIN users u ON u.id = f.uploader_id
         WHERE f.meeting_id = $1
         ORDER BY f.id ASC`,
        [req.meeting.id]
      );
      res.json({ files: result.rows.map(toClient) });
    } catch (err) {
      console.error('List files error:', err.message);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Upload a file to a meeting
  router.post('/', loadMeeting, async (req, res) => {
    try {
      const count = await pool.query(
        'SELECT COUNT(*)::int AS total FROM meeting_files WHERE meeting_id = $1',
        [req.meeting.id]
      );
      if (count.rows[0].total >= MAX_FILES_PER_MEETING) {
        return res.status(400).json({
          message: `This meeting already has ${MAX_FILES_PER_MEETING} files`,
        });
      }
    } catch (err) {
      console.error('Count files error:', err.message);
      return res.status(500).json({ message: 'Server error' });
    }

    upload.single('file')(req, res, async (uploadError) => {
      if (uploadError) {
        if (uploadError.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: 'File is too large (maximum 25 MB)' });
        }
        if (uploadError.code === 'BLOCKED_TYPE') {
          return res.status(400).json({ message: uploadError.message });
        }
        console.error('Upload error:', uploadError.message);
        return res.status(400).json({ message: 'Upload failed' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file was uploaded' });
      }

      // Encrypt the file on disk before anything else happens to it
      try {
        await encryptFileInPlace(req.file.path);
      } catch (err) {
        console.error('Encrypt error:', err.message);
        fs.unlink(req.file.path, () => {});
        return res.status(500).json({ message: 'Could not store the file securely' });
      }

      try {
        const originalName = cleanFileName(req.file.originalname);
        const result = await pool.query(
          `INSERT INTO meeting_files
             (meeting_id, uploader_id, original_name, stored_name, mime_type, size_bytes, encrypted)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           RETURNING *`,
          [
            req.meeting.id,
            req.user.id,
            originalName,
            req.file.filename,
            String(req.file.mimetype || '').slice(0, 150),
            req.file.size,
          ]
        );

        const file = toClient({ ...result.rows[0], uploader_name: req.user.name });

        // Tell everyone in the meeting right away
        io.to(req.meeting.room_code).emit('file-shared', file);
        res.status(201).json({ file });
      } catch (err) {
        console.error('Save file error:', err.message);
        fs.unlink(req.file.path, () => {});
        res.status(500).json({ message: 'Server error' });
      }
    });
  });

  // Download a file
  router.get('/:fileId', loadMeeting, async (req, res) => {
    try {
      const fileId = Number.parseInt(req.params.fileId, 10);
      if (!Number.isInteger(fileId)) {
        return res.status(400).json({ message: 'Invalid file' });
      }

      const result = await pool.query(
        'SELECT * FROM meeting_files WHERE id = $1 AND meeting_id = $2',
        [fileId, req.meeting.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'File not found' });
      }

      const row = result.rows[0];
      const filePath = path.join(UPLOAD_DIR, row.stored_name);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // Files shared before encryption was added are sent as they are
      if (!row.encrypted) {
        return res.download(filePath, row.original_name, (err) => {
          if (err && !res.headersSent) {
            res.status(404).json({ message: 'File is no longer available' });
          }
        });
      }

      let contents;
      try {
        contents = await decryptFileToBuffer(filePath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          return res.status(404).json({ message: 'File is no longer available' });
        }
        console.error('Decrypt error:', err.message);
        return res
          .status(500)
          .json({ message: 'This file could not be opened. It may be damaged.' });
      }

      // Always sent as a download, so a file can never run inside the page
      res.attachment(row.original_name);
      res.type('application/octet-stream');
      res.send(contents);
    } catch (err) {
      console.error('Download error:', err.message);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};