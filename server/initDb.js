require('dotenv').config();
const { pool } = require('./db');

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'student'
          CHECK (role IN ('student', 'teacher', 'professional')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('users table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(20) UNIQUE NOT NULL,
        title VARCHAR(150) NOT NULL,
        host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('meetings table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_files (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(100) NOT NULL,
        mime_type VARCHAR(150),
        size_bytes BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_meeting_files_meeting
      ON meeting_files (meeting_id);
    `);
    // Files shared before encryption existed stay marked as not encrypted
    await pool.query(`
      ALTER TABLE meeting_files
      ADD COLUMN IF NOT EXISTS encrypted BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log('meeting_files table ready');

    // One row for every time a person enters a meeting
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        left_at TIMESTAMPTZ
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_meeting
      ON attendance (meeting_id);
    `);
    console.log('attendance table ready');
  } catch (err) {
    console.error('Failed to create tables:', err.message);
  } finally {
    await pool.end();
  }
}

initDb();