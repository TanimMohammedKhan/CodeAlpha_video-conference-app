const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const hex = process.env.FILE_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('FILE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

// Replace a plain file on disk with an encrypted one.
// Layout of the encrypted file: [random IV][encrypted data][authentication tag]
async function encryptFileInPlace(filePath) {
  const key = getKey();
  const plain = await fs.promises.readFile(filePath);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  // The file's own name is mixed in, so an encrypted file cannot be
  // swapped with another one without the tag check failing
  cipher.setAAD(Buffer.from(path.basename(filePath)));

  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();

  const tempPath = `${filePath}.tmp`;
  try {
    await fs.promises.writeFile(tempPath, Buffer.concat([iv, encrypted, tag]));
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw err;
  }
}

// Read an encrypted file and return its original contents.
// Throws an error if the file was damaged or changed.
async function decryptFileToBuffer(filePath) {
  const key = getKey();
  const data = await fs.promises.readFile(filePath);

  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted file is damaged');
  }

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(path.basename(filePath)));
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

module.exports = { encryptFileInPlace, decryptFileToBuffer };