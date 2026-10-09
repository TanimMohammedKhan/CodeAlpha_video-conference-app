require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { pool, testConnection } = require('./db');
const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const createFileRoutes = require('./routes/files');

// Refuse to start with missing or weak secrets
function checkSecrets() {
  const problems = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be set and at least 32 characters long');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.FILE_ENCRYPTION_KEY || '')) {
    problems.push('FILE_ENCRYPTION_KEY must be set to 64 hex characters');
  }

  if (problems.length > 0) {
    console.error('Server cannot start:');
    problems.forEach((problem) => console.error(` - ${problem}`));
    process.exit(1);
  }
}
checkSecrets();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const MAX_PARTICIPANTS = 8;
const MAX_CHAT_LENGTH = 1000;
const MAX_CHAT_HISTORY = 100;

// Reactions people may send (the browser maps each one to an emoji)
const REACTIONS = ['thumbs', 'clap', 'heart', 'laugh', 'wow', 'party'];

// Poll limits
const MAX_POLL_OPTIONS = 6;
const MAX_POLL_QUESTION = 200;
const MAX_POLL_OPTION_LENGTH = 100;
const MAX_POLL_HISTORY = 20;

// Focus timer
const FOCUS_DEFAULT_MS = 25 * 60 * 1000;
const BREAK_DEFAULT_MS = 5 * 60 * 1000;
const MAX_TIMER_MINUTES = 180;

// Shared notes
const MAX_NOTES = 200;
const MAX_NOTE_LENGTH = 500;
const NOTE_KINDS = ['note', 'task'];

// Live captions and transcript
const MAX_CAPTION_LENGTH = 300;
const MAX_TRANSCRIPT_LINES = 1000;
const TRANSCRIPT_ON_JOIN = 300;

// Whiteboard limits
const WB_TOOLS = ['pen', 'eraser', 'line', 'rect', 'ellipse'];
const WB_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const WB_MAX_STROKES = 3000;
const WB_MAX_POINTS_PER_STROKE = 5000;
const WB_MAX_POINTS_PER_CHUNK = 200;
const WB_MAX_EVENTS_PER_SECOND = 100;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Check and clean a whiteboard message from a user before trusting it
function cleanStrokeChunk(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const id = String(payload.id || '').slice(0, 64);
  if (!id) return null;
  if (!WB_TOOLS.includes(payload.tool)) return null;
  if (!WB_COLOR_PATTERN.test(String(payload.color))) return null;

  const size = Number(payload.size);
  if (!Number.isFinite(size)) return null;
  if (!Array.isArray(payload.points)) return null;

  const points = [];
  for (const point of payload.points.slice(0, WB_MAX_POINTS_PER_CHUNK)) {
    if (!Array.isArray(point)) continue;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push([
      Math.round(clamp(x, 0, 1) * 10000) / 10000,
      Math.round(clamp(y, 0, 1) * 10000) / 10000,
    ]);
  }
  if (points.length === 0) return null;

  return {
    id,
    tool: payload.tool,
    color: payload.color,
    size: clamp(size, 1, 64),
    points,
  };
}

// ----- Polls and quizzes -----

// What everybody may see while a poll is open (never the correct answer)
function publicPoll(poll) {
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    isQuiz: poll.correctIndex !== null,
  };
}

function countVotes(poll) {
  const counts = poll.options.map(() => 0);
  poll.votes.forEach((index) => {
    counts[index] += 1;
  });
  return counts;
}

// Live numbers for the host while the poll is open
function hostCounts(poll) {
  return {
    id: poll.id,
    counts: countVotes(poll),
    total: poll.votes.size,
    correctIndex: poll.correctIndex,
  };
}

// The final result of a poll, as seen by one particular person
function resultOf(poll, userId) {
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    isQuiz: poll.correctIndex !== null,
    counts: countVotes(poll),
    total: poll.votes.size,
    correctIndex: poll.correctIndex,
    myVote: poll.votes.has(userId) ? poll.votes.get(userId) : null,
  };
}

function leaderboard(state) {
  return Array.from(state.scores.values())
    .sort((a, b) => b.correct - a.correct || a.answered - b.answered)
    .slice(0, 10);
}

// Record the moment a person left a meeting (used by the attendance report)
async function endSession(sessionId) {
  try {
    await pool.query(
      'UPDATE attendance SET left_at = NOW() WHERE id = $1 AND left_at IS NULL',
      [sessionId]
    );
  } catch (err) {
    console.error('Attendance error:', err.message);
  }
}

// If the server was stopped while people were in meetings, close those sessions
async function closeStaleSessions() {
  try {
    const result = await pool.query(
      'UPDATE attendance SET left_at = NOW() WHERE left_at IS NULL'
    );
    if (result.rowCount > 0) {
      console.log(`Closed ${result.rowCount} unfinished attendance sessions`);
    }
  } catch (err) {
    console.error('Attendance cleanup error:', err.message);
  }
}

// Limits on how often one address may call the API
const tooMany = (message) => ({ message });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many requests. Please slow down and try again shortly.'),
});

// Only failed logins count, so normal use is never blocked
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many failed login attempts. Please try again in 15 minutes.'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many accounts created. Please try again later.'),
});

const app = express();
app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '100kb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5,
});

app.get('/', (req, res) => {
  res.send('Video Conference Server is running');
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/meetings/:code/files', createFileRoutes(io));
app.use('/api/meetings', meetingRoutes);

// Only logged-in users may open a real-time connection
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

// Who is in each meeting right now: room code -> Map(socket id -> participant)
const rooms = new Map();
// Recent chat messages for each meeting: room code -> array of messages
const chats = new Map();
// Whiteboard for each meeting: room code -> { hostId, strokes }
const boards = new Map();
// Host settings for each meeting:
// room code -> { hostId, locked, allowRecording, removedUsers }
const roomMeta = new Map();
// Polls for each meeting: room code -> { active, history, scores }
const polls = new Map();
// Focus timer for each meeting: room code -> timer
const timers = new Map();
// Shared notes for each meeting: room code -> array of notes
const notesByRoom = new Map();
// Transcript of finished sentences for each meeting: room code -> array of lines
const transcripts = new Map();

function getPollState(code) {
  let state = polls.get(code);
  if (!state) {
    state = { active: null, history: [], scores: new Map() };
    polls.set(code, state);
  }
  return state;
}

// ----- Focus timer -----
// The server keeps the exact moment the timer ends, so everybody's countdown
// matches no matter what their own clock says.

function getTimer(code) {
  let timer = timers.get(code);
  if (!timer) {
    timer = {
      mode: 'focus',
      status: 'idle',
      durationMs: FOCUS_DEFAULT_MS,
      remainingMs: FOCUS_DEFAULT_MS,
      endsAt: null,
      handle: null,
    };
    timers.set(code, timer);
  }
  return timer;
}

function publicTimer(timer) {
  return {
    mode: timer.mode,
    status: timer.status,
    durationMs: timer.durationMs,
    remainingMs: timer.remainingMs,
    endsAt: timer.endsAt,
  };
}

function broadcastTimer(code) {
  const timer = timers.get(code);
  if (!timer) return;
  io.to(code).emit('timer-state', { timer: publicTimer(timer), serverNow: Date.now() });
}

function finishTimer(code) {
  const timer = timers.get(code);
  if (!timer || timer.status !== 'running') return;

  const finishedMode = timer.mode;
  timer.handle = null;
  timer.status = 'idle';
  timer.endsAt = null;
  // Offer the other kind of session next: a break after focus, focus after a break
  timer.mode = finishedMode === 'focus' ? 'break' : 'focus';
  timer.durationMs = timer.mode === 'break' ? BREAK_DEFAULT_MS : FOCUS_DEFAULT_MS;
  timer.remainingMs = timer.durationMs;

  io.to(code).emit('timer-finished', { mode: finishedMode });
  broadcastTimer(code);
}

function scheduleTimer(code) {
  const timer = timers.get(code);
  if (!timer) return;

  clearTimeout(timer.handle);
  const wait = Math.max(0, timer.endsAt - Date.now()) + 50;
  timer.handle = setTimeout(() => finishTimer(code), wait);
}

function stopTimer(code) {
  const timer = timers.get(code);
  if (timer) clearTimeout(timer.handle);
  timers.delete(code);
}

// Send something only to the host's connection(s)
function emitToHost(code, event, payload) {
  const meta = roomMeta.get(code);
  const room = rooms.get(code);
  if (!meta || !room) return;

  room.forEach((participant) => {
    if (participant.userId === meta.hostId) {
      io.to(participant.id).emit(event, payload);
    }
  });
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.name, socket.id);

  let roomCode = null;
  let attendanceId = null;
  let joining = false;
  const chatTimes = [];
  const strokeTimes = [];
  const reactionTimes = [];
  const noteTimes = [];
  const captionTimes = [];

  // The meeting settings, but only if this user is the host of the meeting
  const getHostMeta = () => {
    if (!roomCode) return null;
    const meta = roomMeta.get(roomCode);
    return meta && meta.hostId === socket.user.id ? meta : null;
  };

  // Allow at most 20 note actions every 10 seconds from one person
  const noteRateOk = () => {
    const now = Date.now();
    while (noteTimes.length && now - noteTimes[0] > 10000) noteTimes.shift();
    if (noteTimes.length >= 20) return false;
    noteTimes.push(now);
    return true;
  };

  const broadcastNotes = () => {
    io.to(roomCode).emit('notes-state', notesByRoom.get(roomCode) || []);
  };

  const leaveRoom = () => {
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) {
        rooms.delete(roomCode);
        chats.delete(roomCode);
        boards.delete(roomCode);
        roomMeta.delete(roomCode);
        polls.delete(roomCode);
        notesByRoom.delete(roomCode);
        transcripts.delete(roomCode);
        stopTimer(roomCode);
      }
    }

    if (attendanceId) {
      endSession(attendanceId);
      attendanceId = null;
    }

    socket.leave(roomCode);
    io.to(roomCode).emit('user-left', { id: socket.id });
    console.log(`${socket.user.name} left room ${roomCode}`);
    roomCode = null;
  };

  socket.on('join-room', async (payload) => {
    if (roomCode || joining) return;
    joining = true;

    const deny = (message) => socket.emit('join-denied', { message });

    try {
      const data = payload || {};
      const code = String(data.code || '').trim().toLowerCase();

      if (!CODE_PATTERN.test(code)) {
        return deny('That meeting code is not valid');
      }

      const result = await pool.query(
        'SELECT id, host_id FROM meetings WHERE room_code = $1',
        [code]
      );
      if (result.rows.length === 0) {
        return deny('No meeting found with that code');
      }

      // The user may have left while we were checking the database
      if (!socket.connected) return;

      const hostId = result.rows[0].host_id;
      const existingMeta = roomMeta.get(code);

      if (existingMeta && existingMeta.removedUsers.has(socket.user.id)) {
        return deny('You were removed from this meeting by the host.');
      }
      if (existingMeta && existingMeta.locked && socket.user.id !== hostId) {
        return deny('The host has locked this meeting. Please ask the host to unlock it.');
      }

      // Record the arrival time for the attendance report
      const session = await pool.query(
        'INSERT INTO attendance (meeting_id, user_id) VALUES ($1, $2) RETURNING id',
        [result.rows[0].id, socket.user.id]
      );
      const sessionId = session.rows[0].id;

      const room = rooms.get(code) || new Map();
      if (!socket.connected || room.size >= MAX_PARTICIPANTS) {
        await endSession(sessionId);
        if (socket.connected) {
          deny(`This meeting is full (maximum ${MAX_PARTICIPANTS} people)`);
        }
        return;
      }

      const participant = {
        id: socket.id,
        userId: socket.user.id,
        name: socket.user.name,
        micOn: Boolean(data.micOn),
        camOn: Boolean(data.camOn),
        handRaised: false,
        recording: false,
        screenStreamId: null,
      };

      const existing = Array.from(room.values());
      room.set(socket.id, participant);
      rooms.set(code, room);
      roomCode = code;
      attendanceId = sessionId;
      socket.join(code);

      if (!roomMeta.has(code)) {
        roomMeta.set(code, {
          hostId,
          locked: false,
          allowRecording: false,
          removedUsers: new Set(),
        });
      }
      const meta = roomMeta.get(code);

      if (!boards.has(code)) {
        boards.set(code, { hostId, strokes: [] });
      }

      const pollState = getPollState(code);
      const active = pollState.active;

      // Tell the newcomer who is already here, the chat so far, the
      // whiteboard, the polls, the timer, the notes, the transcript and
      // the meeting settings, and tell everyone else about the newcomer
      socket.emit('room-users', existing);
      socket.emit('room-state', {
        locked: meta.locked,
        allowRecording: meta.allowRecording,
      });
      socket.emit('chat-history', chats.get(code) || []);
      socket.emit('wb-state', boards.get(code).strokes);
      socket.emit('poll-state', {
        active: active ? publicPoll(active) : null,
        myVote:
          active && active.votes.has(socket.user.id)
            ? active.votes.get(socket.user.id)
            : null,
        counts: active && socket.user.id === hostId ? hostCounts(active) : null,
        history: pollState.history.map((item) => resultOf(item, socket.user.id)),
        scores: leaderboard(pollState),
      });
      socket.emit('timer-state', {
        timer: publicTimer(getTimer(code)),
        serverNow: Date.now(),
      });
      socket.emit('notes-state', notesByRoom.get(code) || []);
      socket.emit('transcript-state', (transcripts.get(code) || []).slice(-TRANSCRIPT_ON_JOIN));
      socket.to(code).emit('user-joined', participant);
      console.log(`${socket.user.name} joined room ${code} (${room.size} in room)`);
    } catch (err) {
      console.error('Join room error:', err.message);
      socket.emit('room-error', 'Could not join the meeting');
    } finally {
      joining = false;
    }
  });

  // Pass WebRTC connection details from one person to another
  socket.on('signal', (payload) => {
    if (!roomCode || !payload) return;

    const room = rooms.get(roomCode);
    if (!room || !room.has(payload.to)) return;

    io.to(payload.to).emit('signal', { from: socket.id, data: payload.data });
  });

  // Share microphone and camera on/off state
  socket.on('media-state', (payload) => {
    if (!roomCode || !payload) return;

    const room = rooms.get(roomCode);
    const participant = room && room.get(socket.id);
    if (!participant) return;

    participant.micOn = Boolean(payload.micOn);
    participant.camOn = Boolean(payload.camOn);

    socket.to(roomCode).emit('media-state', {
      id: socket.id,
      micOn: participant.micOn,
      camOn: participant.camOn,
    });
  });

  // Raise or lower your hand
  socket.on('hand', (payload) => {
    if (!roomCode || !payload) return;

    const room = rooms.get(roomCode);
    const participant = room && room.get(socket.id);
    if (!participant) return;

    participant.handRaised = Boolean(payload.raised);
    socket.to(roomCode).emit('hand', {
      id: socket.id,
      raised: participant.handRaised,
    });
  });

  // Recording: the host may always record, and participants may record
  // only when the host has allowed it. Everyone is told who is recording.
  socket.on('recording-start', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!roomCode) return reply({ ok: false });

    const room = rooms.get(roomCode);
    const participant = room && room.get(socket.id);
    const meta = roomMeta.get(roomCode);
    if (!participant || !meta) return reply({ ok: false });

    const isHost = meta.hostId === socket.user.id;
    if (!isHost && !meta.allowRecording) {
      return reply({
        ok: false,
        message: 'The host has not allowed participants to record this meeting.',
      });
    }

    participant.recording = true;
    socket.to(roomCode).emit('recording-state', {
      id: socket.id,
      name: socket.user.name,
      recording: true,
    });
    console.log(`${socket.user.name} started recording room ${roomCode}`);
    return reply({ ok: true });
  });

  socket.on('recording-stop', () => {
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    const participant = room && room.get(socket.id);
    if (!participant || !participant.recording) return;

    participant.recording = false;
    socket.to(roomCode).emit('recording-state', {
      id: socket.id,
      name: socket.user.name,
      recording: false,
    });
    console.log(`${socket.user.name} stopped recording room ${roomCode}`);
  });

  // Host: allow or forbid recording by participants
  socket.on('host-allow-recording', (payload) => {
    const meta = getHostMeta();
    if (!meta || !payload) return;

    meta.allowRecording = Boolean(payload.allowed);
    io.to(roomCode).emit('room-state', {
      locked: meta.locked,
      allowRecording: meta.allowRecording,
    });

    // When recording is switched off, participants who are recording must stop
    if (!meta.allowRecording) {
      const room = rooms.get(roomCode);
      if (room) {
        room.forEach((participant) => {
          if (participant.recording && participant.userId !== meta.hostId) {
            participant.recording = false;
            io.to(participant.id).emit('force-stop-recording');
            io
              .to(roomCode)
              .except(participant.id)
              .emit('recording-state', {
                id: participant.id,
                name: participant.name,
                recording: false,
              });
          }
        });
      }
    }
  });

  // Emoji reactions, shown to everybody in the meeting
  socket.on('reaction', (payload) => {
    if (!roomCode || !payload || !REACTIONS.includes(payload.type)) return;

    // At most 8 reactions every 5 seconds from one person
    const now = Date.now();
    while (reactionTimes.length && now - reactionTimes[0] > 5000) reactionTimes.shift();
    if (reactionTimes.length >= 8) return;
    reactionTimes.push(now);

    io.to(roomCode).emit('reaction', {
      key: crypto.randomUUID(),
      id: socket.id,
      name: socket.user.name,
      type: payload.type,
    });
  });

  // Live captions: a person's own words, turned into text by their browser.
  // Unfinished text is only shown live; finished sentences join the transcript.
  socket.on('caption', (payload) => {
    if (!roomCode || !payload) return;

    // At most 40 caption messages every 5 seconds from one person
    const now = Date.now();
    while (captionTimes.length && now - captionTimes[0] > 5000) captionTimes.shift();
    if (captionTimes.length >= 40) return;
    captionTimes.push(now);

    const text = String(payload.text || '').trim().slice(0, MAX_CAPTION_LENGTH);
    if (!text) return;
    const final = Boolean(payload.final);

    const line = {
      id: crypto.randomUUID(),
      userId: socket.user.id,
      name: socket.user.name,
      text,
      final,
      time: new Date().toISOString(),
    };

    if (final) {
      const lines = transcripts.get(roomCode) || [];
      lines.push(line);
      if (lines.length > MAX_TRANSCRIPT_LINES) lines.shift();
      transcripts.set(roomCode, lines);
    }

    io.to(roomCode).emit('caption', line);
  });

  // Host: ask everyone else to mute their microphone
  socket.on('host-mute-all', () => {
    if (!getHostMeta()) return;
    socket.to(roomCode).emit('force-mute');
  });

  // Host: ask one person to mute their microphone
  socket.on('host-mute-user', (payload) => {
    if (!getHostMeta() || !payload) return;

    const room = rooms.get(roomCode);
    if (!room || !room.has(payload.id) || payload.id === socket.id) return;

    io.to(payload.id).emit('force-mute');
  });

  // Host: remove a person from the meeting
  socket.on('host-remove', (payload) => {
    const meta = getHostMeta();
    if (!meta || !payload) return;

    const room = rooms.get(roomCode);
    const target = room && room.get(payload.id);
    if (!target || target.userId === socket.user.id) return;

    // They cannot come back until the meeting has ended
    meta.removedUsers.add(target.userId);

    const targetSocket = io.sockets.sockets.get(payload.id);
    if (targetSocket) {
      targetSocket.emit('removed');
      targetSocket.disconnect(true);
    }
    console.log(`${socket.user.name} removed ${target.name} from room ${roomCode}`);
  });

  // Host: lock or unlock the meeting
  socket.on('host-lock', (payload) => {
    const meta = getHostMeta();
    if (!meta || !payload) return;

    meta.locked = Boolean(payload.locked);
    io.to(roomCode).emit('room-state', {
      locked: meta.locked,
      allowRecording: meta.allowRecording,
    });
  });

  // Host: start a poll or a quiz
  socket.on('poll-start', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};

    if (!getHostMeta() || !payload) {
      return reply({ ok: false, message: 'Only the host can start a poll.' });
    }

    const state = getPollState(roomCode);
    if (state.active) {
      return reply({ ok: false, message: 'End the current poll before starting a new one.' });
    }

    const question = String(payload.question || '')
      .trim()
      .slice(0, MAX_POLL_QUESTION);
    const rawOptions = Array.isArray(payload.options)
      ? payload.options.slice(0, MAX_POLL_OPTIONS)
      : [];
    const options = rawOptions.map((option) =>
      String(option || '')
        .trim()
        .slice(0, MAX_POLL_OPTION_LENGTH)
    );

    if (!question) {
      return reply({ ok: false, message: 'Please write a question.' });
    }
    if (options.length < 2 || options.some((option) => !option)) {
      return reply({ ok: false, message: 'Give at least 2 options and fill in every one.' });
    }

    let correctIndex = null;
    if (payload.correctIndex !== null && payload.correctIndex !== undefined) {
      correctIndex = Number(payload.correctIndex);
      if (
        !Number.isInteger(correctIndex) ||
        correctIndex < 0 ||
        correctIndex >= options.length
      ) {
        return reply({ ok: false, message: 'Pick the correct answer.' });
      }
    }

    const poll = {
      id: crypto.randomUUID(),
      question,
      options,
      correctIndex,
      votes: new Map(),
      names: new Map(),
    };
    state.active = poll;

    io.to(roomCode).emit('poll-started', publicPoll(poll));
    emitToHost(roomCode, 'poll-counts', hostCounts(poll));
    console.log(`${socket.user.name} started a ${correctIndex === null ? 'poll' : 'quiz'} in ${roomCode}`);
    return reply({ ok: true });
  });

  // Anyone: answer the open poll (one answer each)
  socket.on('poll-vote', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!roomCode || !payload) return reply({ ok: false });

    const state = polls.get(roomCode);
    const poll = state && state.active;
    if (!poll || poll.id !== payload.pollId) {
      return reply({ ok: false, message: 'This poll has already ended.' });
    }

    const index = Number(payload.index);
    if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) {
      return reply({ ok: false, message: 'That option does not exist.' });
    }
    if (poll.votes.has(socket.user.id)) {
      return reply({ ok: false, message: 'You have already answered.' });
    }

    poll.votes.set(socket.user.id, index);
    poll.names.set(socket.user.id, socket.user.name);

    emitToHost(roomCode, 'poll-counts', hostCounts(poll));
    return reply({ ok: true });
  });

  // Host: end the poll and show the results to everyone
  socket.on('poll-end', () => {
    if (!getHostMeta()) return;

    const state = polls.get(roomCode);
    const poll = state && state.active;
    if (!poll) return;

    state.active = null;
    state.history.unshift(poll);
    if (state.history.length > MAX_POLL_HISTORY) state.history.pop();

    // Quiz points
    if (poll.correctIndex !== null) {
      poll.votes.forEach((index, userId) => {
        const entry = state.scores.get(userId) || {
          userId,
          name: poll.names.get(userId) || 'Student',
          correct: 0,
          answered: 0,
        };
        entry.name = poll.names.get(userId) || entry.name;
        entry.answered += 1;
        if (index === poll.correctIndex) entry.correct += 1;
        state.scores.set(userId, entry);
      });
    }

    // Everybody gets the same results, plus which answer was their own
    const room = rooms.get(roomCode);
    if (room) {
      room.forEach((participant) => {
        io.to(participant.id).emit('poll-ended', resultOf(poll, participant.userId));
      });
    }
    io.to(roomCode).emit('poll-scores', leaderboard(state));
    console.log(`${socket.user.name} ended a poll in ${roomCode} (${poll.votes.size} answers)`);
  });

  // Host: start the focus timer (or a break) for everybody
  socket.on('timer-start', (payload) => {
    if (!getHostMeta() || !payload) return;

    const mode = payload.mode === 'break' ? 'break' : 'focus';
    const minutes = Number(payload.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIMER_MINUTES) return;

    const timer = getTimer(roomCode);
    timer.mode = mode;
    timer.durationMs = minutes * 60 * 1000;
    timer.remainingMs = timer.durationMs;
    timer.status = 'running';
    timer.endsAt = Date.now() + timer.durationMs;

    scheduleTimer(roomCode);
    broadcastTimer(roomCode);
  });

  // Host: pause the timer
  socket.on('timer-pause', () => {
    if (!getHostMeta()) return;

    const timer = timers.get(roomCode);
    if (!timer || timer.status !== 'running') return;

    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remainingMs = Math.max(0, timer.endsAt - Date.now());
    timer.endsAt = null;
    timer.status = 'paused';
    broadcastTimer(roomCode);
  });

  // Host: continue a paused timer
  socket.on('timer-resume', () => {
    if (!getHostMeta()) return;

    const timer = timers.get(roomCode);
    if (!timer || timer.status !== 'paused') return;

    timer.status = 'running';
    timer.endsAt = Date.now() + timer.remainingMs;
    scheduleTimer(roomCode);
    broadcastTimer(roomCode);
  });

  // Host: stop the timer and go back to the start
  socket.on('timer-reset', () => {
    if (!getHostMeta()) return;

    const timer = timers.get(roomCode);
    if (!timer) return;

    clearTimeout(timer.handle);
    timer.handle = null;
    timer.status = 'idle';
    timer.endsAt = null;
    timer.remainingMs = timer.durationMs;
    broadcastTimer(roomCode);
  });

  // Shared notes: anyone can add a note or an action item
  socket.on('note-add', (payload) => {
    if (!roomCode || !payload || !noteRateOk()) return;

    const text = String(payload.text || '').trim().slice(0, MAX_NOTE_LENGTH);
    if (!text) return;
    const kind = NOTE_KINDS.includes(payload.kind) ? payload.kind : 'note';

    const list = notesByRoom.get(roomCode) || [];
    if (list.length >= MAX_NOTES) return;

    list.push({
      id: crypto.randomUUID(),
      userId: socket.user.id,
      name: socket.user.name,
      text,
      kind,
      done: false,
      edited: false,
      time: new Date().toISOString(),
    });
    notesByRoom.set(roomCode, list);
    broadcastNotes();
  });

  // Shared notes: only the author can change the text
  socket.on('note-edit', (payload) => {
    if (!roomCode || !payload || !noteRateOk()) return;

    const list = notesByRoom.get(roomCode) || [];
    const note = list.find((item) => item.id === payload.id);
    if (!note || note.userId !== socket.user.id) return;

    const text = String(payload.text || '').trim().slice(0, MAX_NOTE_LENGTH);
    if (!text || text === note.text) return;

    note.text = text;
    note.edited = true;
    broadcastNotes();
  });

  // Shared notes: anyone can tick or untick an action item
  socket.on('note-toggle', (payload) => {
    if (!roomCode || !payload || !noteRateOk()) return;

    const list = notesByRoom.get(roomCode) || [];
    const note = list.find((item) => item.id === payload.id);
    if (!note || note.kind !== 'task') return;

    note.done = !note.done;
    broadcastNotes();
  });

  // Shared notes: the author or the host can delete a note
  socket.on('note-delete', (payload) => {
    if (!roomCode || !payload || !noteRateOk()) return;

    const list = notesByRoom.get(roomCode) || [];
    const index = list.findIndex((item) => item.id === payload.id);
    if (index === -1) return;

    const note = list[index];
    if (note.userId !== socket.user.id && !getHostMeta()) return;

    list.splice(index, 1);
    broadcastNotes();
  });

  // Start or stop presenting. Only one person may present at a time.
  socket.on('screen-share', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!roomCode || !payload) return reply({ ok: false });

    const room = rooms.get(roomCode);
    const participant = room && room.get(socket.id);
    if (!participant) return reply({ ok: false });

    if (payload.sharing) {
      const someoneElse = Array.from(room.values()).some(
        (p) => p.id !== socket.id && p.screenStreamId
      );
      if (someoneElse) {
        return reply({ ok: false, message: 'Someone else is already sharing' });
      }

      const streamId = String(payload.streamId || '').slice(0, 100);
      if (!streamId) return reply({ ok: false });

      participant.screenStreamId = streamId;
      socket
        .to(roomCode)
        .emit('screen-share', { id: socket.id, sharing: true, streamId });
      return reply({ ok: true });
    }

    participant.screenStreamId = null;
    socket.to(roomCode).emit('screen-share', { id: socket.id, sharing: false });
    return reply({ ok: true });
  });

  // In-meeting chat
  socket.on('chat-message', (payload) => {
    if (!roomCode || !payload) return;

    const text = String(payload.text || '').trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;

    // Basic spam protection: at most 10 messages every 10 seconds
    const now = Date.now();
    while (chatTimes.length && now - chatTimes[0] > 10000) chatTimes.shift();
    if (chatTimes.length >= 10) return;
    chatTimes.push(now);

    const message = {
      id: crypto.randomUUID(),
      userId: socket.user.id,
      name: socket.user.name,
      text,
      time: new Date().toISOString(),
    };

    const history = chats.get(roomCode) || [];
    history.push(message);
    if (history.length > MAX_CHAT_HISTORY) history.shift();
    chats.set(roomCode, history);

    io.to(roomCode).emit('chat-message', message);
  });

  // Whiteboard: add a stroke (or more points of a stroke being drawn)
  socket.on('wb-stroke', (payload) => {
    if (!roomCode) return;
    const board = boards.get(roomCode);
    if (!board) return;

    // Ignore a flood of drawing messages from one connection
    const now = Date.now();
    while (strokeTimes.length && now - strokeTimes[0] > 1000) strokeTimes.shift();
    if (strokeTimes.length >= WB_MAX_EVENTS_PER_SECOND) return;
    strokeTimes.push(now);

    const chunk = cleanStrokeChunk(payload);
    if (!chunk) return;

    const isShape = chunk.tool !== 'pen' && chunk.tool !== 'eraser';

    let stroke = null;
    for (let i = board.strokes.length - 1; i >= 0; i--) {
      if (board.strokes[i].id === chunk.id) {
        stroke = board.strokes[i];
        break;
      }
    }

    if (stroke) {
      // Only the owner may add to a stroke, and shapes are sent in one piece
      if (stroke.userId !== socket.user.id || isShape) return;
      if (stroke.points.length + chunk.points.length > WB_MAX_POINTS_PER_STROKE) {
        return;
      }
      stroke.points.push(...chunk.points);
    } else {
      if (isShape) {
        if (chunk.points.length < 2) return;
        chunk.points = chunk.points.slice(0, 2);
      }

      if (board.strokes.length >= WB_MAX_STROKES) {
        const removed = board.strokes.shift();
        io.to(roomCode).emit('wb-remove', { id: removed.id });
      }
      board.strokes.push({ ...chunk, userId: socket.user.id });
    }

    socket.to(roomCode).emit('wb-stroke', chunk);
  });

  // Whiteboard: remove your own most recent stroke
  socket.on('wb-undo', () => {
    if (!roomCode) return;
    const board = boards.get(roomCode);
    if (!board) return;

    for (let i = board.strokes.length - 1; i >= 0; i--) {
      if (board.strokes[i].userId === socket.user.id) {
        const [removed] = board.strokes.splice(i, 1);
        io.to(roomCode).emit('wb-remove', { id: removed.id });
        break;
      }
    }
  });

  // Whiteboard: only the host of the meeting may clear everything
  socket.on('wb-clear', () => {
    if (!roomCode) return;
    const board = boards.get(roomCode);
    if (!board || board.hostId !== socket.user.id) return;

    board.strokes = [];
    io.to(roomCode).emit('wb-clear');
  });

  socket.on('leave-room', leaveRoom);

  socket.on('disconnect', () => {
    leaveRoom();
    console.log('User disconnected:', socket.user.name, socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  testConnection();
  closeStaleSessions();
});