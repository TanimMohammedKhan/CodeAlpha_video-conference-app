const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const LETTERS = 'abcdefghijkmnpqrstuvwxyz';

function randomPart(length) {
  return Array.from({ length }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('');
}

function generateRoomCode() {
  return `${randomPart(3)}-${randomPart(4)}-${randomPart(3)}`;
}

// Total seconds covered by a list of [start, end] times in milliseconds.
// Overlapping times (for example two open tabs) are only counted once.
function totalSeconds(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [currentStart, currentEnd] = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  total += currentEnd - currentStart;

  return Math.round(total / 1000);
}

// Create a new meeting
router.post('/', async (req, res) => {
  try {
    const title = (req.body.title || '').trim().slice(0, 150) || 'Instant meeting';

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await pool.query(
          `INSERT INTO meetings (room_code, title, host_id)
           VALUES ($1, $2, $3)
           RETURNING id, room_code, title, created_at`,
          [generateRoomCode(), title, req.user.id]
        );
        return res.status(201).json({ meeting: result.rows[0] });
      } catch (err) {
        // 23505 = duplicate room code, so try a new one
        if (err.code !== '23505') throw err;
      }
    }

    res.status(500).json({ message: 'Could not create a meeting, please try again' });
  } catch (err) {
    console.error('Create meeting error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// List the current user's most recent meetings
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, room_code, title, created_at
       FROM meetings
       WHERE host_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.user.id]
    );
    res.json({ meetings: result.rows });
  } catch (err) {
    console.error('List meetings error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Attendance report for a meeting (host only)
router.get('/:code/attendance', async (req, res) => {
  try {
    const code = req.params.code.trim().toLowerCase();

    if (!CODE_PATTERN.test(code)) {
      return res.status(400).json({ message: 'That meeting code is not valid' });
    }

    const meetingResult = await pool.query(
      `SELECT id, room_code, title, host_id, created_at
       FROM meetings
       WHERE room_code = $1`,
      [code]
    );
    if (meetingResult.rows.length === 0) {
      return res.status(404).json({ message: 'No meeting found with that code' });
    }

    const meeting = meetingResult.rows[0];
    if (meeting.host_id !== req.user.id) {
      return res.status(403).json({ message: 'Only the host can view attendance' });
    }

    const sessions = await pool.query(
      `SELECT a.user_id, a.joined_at, a.left_at, u.name, u.email, u.role
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.meeting_id = $1
       ORDER BY a.joined_at ASC`,
      [meeting.id]
    );

    const now = Date.now();
    const byUser = new Map();

    for (const row of sessions.rows) {
      const start = new Date(row.joined_at).getTime();
      const end = row.left_at ? new Date(row.left_at).getTime() : now;

      let entry = byUser.get(row.user_id);
      if (!entry) {
        entry = {
          userId: row.user_id,
          name: row.name,
          email: row.email,
          role: row.role,
          firstJoin: row.joined_at,
          lastLeave: null,
          present: false,
          sessions: 0,
          intervals: [],
        };
        byUser.set(row.user_id, entry);
      }

      entry.sessions += 1;
      entry.intervals.push([start, Math.max(start, end)]);

      if (!row.left_at) {
        entry.present = true;
      } else if (!entry.lastLeave || new Date(row.left_at) > new Date(entry.lastLeave)) {
        entry.lastLeave = row.left_at;
      }
    }

    const participants = Array.from(byUser.values()).map((entry) => ({
      userId: entry.userId,
      name: entry.name,
      email: entry.email,
      role: entry.role,
      firstJoin: entry.firstJoin,
      lastLeave: entry.present ? null : entry.lastLeave,
      present: entry.present,
      sessions: entry.sessions,
      totalSeconds: totalSeconds(entry.intervals),
    }));

    res.json({
      meeting: {
        title: meeting.title,
        roomCode: meeting.room_code,
        createdAt: meeting.created_at,
      },
      generatedAt: new Date().toISOString(),
      participants,
    });
  } catch (err) {
    console.error('Attendance error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Look up a meeting by its room code
router.get('/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toLowerCase();

    if (!CODE_PATTERN.test(code)) {
      return res.status(400).json({ message: 'That meeting code is not valid' });
    }

    const result = await pool.query(
      `SELECT m.id, m.room_code, m.title, m.created_at, m.host_id, u.name AS host_name
       FROM meetings m
       JOIN users u ON u.id = m.host_id
       WHERE m.room_code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No meeting found with that code' });
    }

    res.json({ meeting: result.rows[0] });
  } catch (err) {
    console.error('Get meeting error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;