# MeetSpace

**A video conferencing and collaboration platform built for classrooms, study groups and teams.**

MeetSpace lets people meet by video, share their screen, chat, draw on a shared whiteboard and exchange files. It adds tools that classes and teams need every day: automatic attendance, live polls and quizzes, a shared focus timer, shared notes, live captions with a transcript, and local recording.

<!-- Add screenshots here, for example:
![Dashboard](docs/screenshots/dashboard.png)
![Meeting room](docs/screenshots/meeting-room.png)
-->

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing with two users on one computer](#testing-with-two-users-on-one-computer)
- [Project structure](#project-structure)
- [API and real-time events](#api-and-real-time-events)
- [Security](#security)
- [Browser support](#browser-support)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Author](#author)

---

## Features

### Core meeting tools
- **Multi-user video and audio calls** using WebRTC, up to 8 people per meeting
- **Works without a camera or microphone**: people can still join, watch and listen
- **Screen sharing** (one presenter at a time) with the presenter's shared sound
- **Full screen** for the whole meeting, any video tile and any shared screen
- **In-meeting chat** with unread badges and history for people who join late
- **Collaborative whiteboard** with pen, eraser, line, rectangle and ellipse, 7 colors, 3 brush sizes, per-person undo, PNG export, and a host-only "clear board"
- **File sharing** with drag and drop, upload progress, and downloads for everyone in the meeting

### Built for classes and teams
- **Automatic attendance report** with join and leave times, total time present and CSV export (host only)
- **Raise hand** and **emoji reactions** that float over the video
- **Host controls**: mute everyone, mute one person, remove a person, lock the meeting
- **Live polls and quizzes**: the correct answer is hidden until the host ends the quiz, with a score leaderboard
- **Shared focus timer** (Pomodoro): focus and break sessions started by the host, in sync for everyone, with a chime at the end
- **Shared meeting notes** with action items that anyone can tick off, and a Markdown download
- **Live captions and transcript** in 12 languages, with a downloadable transcript
- **Meeting recording** saved to your own computer, with a visible "is recording" notice for everyone and host-controlled permission

### Accounts and security
- Registration and login with three roles: **student**, **teacher** and **professional**
- Passwords hashed with **bcrypt**, sessions with signed **JWT** tokens
- Uploaded files **encrypted at rest** with AES-256-GCM
- Rate limiting, security headers and input validation (see [Security](#security))

---

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React, Vite, React Router, Socket.IO client, lucide-react icons |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL (`pg`) |
| Real-time media | WebRTC (peer-to-peer mesh) |
| Security | bcryptjs, jsonwebtoken, Helmet, express-rate-limit, AES-256-GCM (Node `crypto`), CORS |
| File uploads | Multer |

---

## How it works

```
Browser A <------ WebRTC: video and audio, encrypted, peer to peer ------> Browser B
    |                                                                          |
    +--- Socket.IO: signaling, chat, whiteboard, polls, timer, notes ---> Node / Express server <---+
                                                                               |
                                                            PostgreSQL + encrypted file storage
```

- **Video and audio** travel directly between participants (a mesh). The server never sees them.
- The **server** handles login, meetings, file storage, and the real-time events that keep everyone in sync.
- The **meeting state** (chat, whiteboard, polls, timer, notes, transcript) lives in the server's memory while a meeting is running.
- **Attendance** and **file records** are stored in PostgreSQL.

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- [PostgreSQL](https://www.postgresql.org/download/) 14 or newer
- [Git](https://git-scm.com/downloads)
- A recent version of Chrome, Edge or Firefox (see [Browser support](#browser-support))

### 1. Clone the project

```bash
git clone https://github.com/TanimMohammedKhan/CodeAlpha_video-conference-app.git
cd video-conference-app
```

### 2. Create the database

Open `psql` (or pgAdmin) and run:

```sql
CREATE DATABASE videoconf;
```

### 3. Set up the server

```bash
cd server
npm install
```

Create your settings file from the template:

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Generate two secrets (run this command twice, one result for each secret):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open `server/.env` and fill in your database password, `JWT_SECRET` and `FILE_ENCRYPTION_KEY`. See [Environment variables](#environment-variables).

Create the database tables, then start the server:

```bash
node initDb.js
npm run dev
```

You should see `Server running on port 5000` and `Database connected at: ...`.

### 4. Set up the client

Open a **second terminal**:

```bash
cd client
npm install
npm run dev
```

### 5. Open the app

Go to **http://localhost:5173**, create an account, and start a meeting.

---

## Environment variables

Set these in `server/.env` (never commit this file):

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port. Default `5000` |
| `CLIENT_URL` | No | Address of the frontend, used for CORS. Default `http://localhost:5173` |
| `DB_HOST` | Yes | PostgreSQL host, usually `localhost` |
| `DB_PORT` | Yes | PostgreSQL port, usually `5432` |
| `DB_USER` | Yes | PostgreSQL user |
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `DB_NAME` | Yes | Database name, for example `videoconf` |
| `JWT_SECRET` | Yes | Secret for signing login tokens. At least 32 characters |
| `FILE_ENCRYPTION_KEY` | Yes | 64 hex characters (32 bytes) used to encrypt uploaded files |

The server refuses to start if `JWT_SECRET` or `FILE_ENCRYPTION_KEY` is missing or too weak.

> **Back up `FILE_ENCRYPTION_KEY`.** If it is lost or changed, files that were encrypted with it can never be opened again.

When deploying, also change `SERVER_URL` in `client/src/config.js` to your server's address.

---

## Scripts

### Server (`server/`)

| Command | What it does |
|---|---|
| `npm run dev` | Start the server with auto-restart (nodemon) |
| `npm start` | Start the server normally |
| `node initDb.js` | Create the database tables (safe to run again) |

### Client (`client/`)

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build the app for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Check the code with ESLint |

---

## Testing with two users on one computer

A meeting needs at least two people, so use two different browser windows and **two different accounts**:

1. Window 1: your normal browser. Log in as the **host** and click **Start meeting**.
2. Window 2: a second browser, a private window, or a separate Chrome profile. Register a second account and open the invite link.

**No webcam?** Chrome can use a fake camera and microphone (a test pattern and a beep). On Windows, run this in PowerShell:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --user-data-dir="$env:TEMP\chrome-fake-cam"
```

This opens a separate Chrome window with its own profile, so you will have to log in again there.

---

## Project structure

```
video-conference-app/
├── client/                      React frontend (Vite)
│   ├── index.html
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── App.jsx              Routes
│       ├── main.jsx             App entry point
│       ├── api.js               HTTP helpers (requests, upload, download)
│       ├── config.js            App name and server address
│       ├── reactions.js         Emoji reaction list
│       ├── sound.js             Timer chime
│       ├── whiteboardStore.js   Whiteboard drawing store
│       ├── *.css                Styles (one file per feature area)
│       ├── components/          UI pieces
│       │   ├── AttendancePanel.jsx   CaptionOverlay.jsx   CaptionsPanel.jsx
│       │   ├── ChatPanel.jsx         ControlBar.jsx        FilePanel.jsx
│       │   ├── NotesPanel.jsx        PeoplePanel.jsx       PollPanel.jsx
│       │   ├── RecordPanel.jsx       ScreenTile.jsx        TimerPanel.jsx
│       │   ├── VideoTile.jsx         Whiteboard.jsx        ReactionLayer.jsx
│       │   └── AuthLayout.jsx   InputField.jsx   Navbar.jsx
│       │       PasswordField.jsx   ProtectedRoute.jsx
│       ├── context/
│       │   └── AuthContext.jsx  Login state
│       ├── hooks/
│       │   ├── useRoomConnection.js   Socket.IO + WebRTC connections
│       │   ├── useLocalMedia.js       Camera and microphone
│       │   ├── useScreenShare.js      Screen sharing
│       │   ├── useSpeechRecognition.js Live captions
│       │   ├── useRecorder.js         Meeting recording
│       │   ├── useCountdown.js        Shared timer clock
│       │   └── useFullscreen.js       Full screen
│       └── pages/
│           ├── Login.jsx   Register.jsx   Dashboard.jsx   Room.jsx
└── server/                      Node.js backend
    ├── index.js                 Express app, security, Socket.IO events
    ├── db.js                    PostgreSQL connection
    ├── initDb.js                Creates the database tables
    ├── fileCrypto.js            AES-256-GCM file encryption
    ├── .env.example             Template for your settings
    ├── middleware/
    │   └── auth.js              JWT check for protected routes
    ├── routes/
    │   ├── auth.js              Register, login, current user
    │   ├── meetings.js          Meetings and attendance report
    │   └── files.js             File upload and download
    └── uploads/                 Encrypted uploaded files (created automatically, not in Git)
```

---

## API and real-time events

### REST API

All routes except register and login need an `Authorization: Bearer <token>` header.

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Log in and receive a token |
| `GET` | `/api/auth/me` | Get the logged-in user |
| `POST` | `/api/meetings` | Create a meeting |
| `GET` | `/api/meetings` | List your recent meetings |
| `GET` | `/api/meetings/:code` | Look up a meeting by its code |
| `GET` | `/api/meetings/:code/attendance` | Attendance report (host only) |
| `GET` | `/api/meetings/:code/files` | List the files shared in a meeting |
| `POST` | `/api/meetings/:code/files` | Upload a file (max 25 MB) |
| `GET` | `/api/meetings/:code/files/:fileId` | Download a file |

### Socket.IO events (overview)

The socket connection requires a valid login token. Events are grouped by feature:

| Area | Events |
|---|---|
| Room | `join-room`, `leave-room`, `room-users`, `user-joined`, `user-left`, `room-state` |
| WebRTC signaling | `signal`, `media-state`, `screen-share` |
| Chat | `chat-message`, `chat-history` |
| Whiteboard | `wb-stroke`, `wb-undo`, `wb-clear`, `wb-state`, `wb-remove` |
| Social | `hand`, `reaction` |
| Host controls | `host-mute-all`, `host-mute-user`, `host-remove`, `host-lock`, `host-allow-recording` |
| Polls | `poll-start`, `poll-vote`, `poll-end`, `poll-state`, `poll-counts`, `poll-scores` |
| Focus timer | `timer-start`, `timer-pause`, `timer-resume`, `timer-reset`, `timer-state` |
| Notes | `note-add`, `note-edit`, `note-toggle`, `note-delete`, `notes-state` |
| Captions | `caption`, `transcript-state` |
| Recording | `recording-start`, `recording-stop`, `recording-state` |
| Files | `file-shared` |

---

## Security

What the app does today:

- **Video and audio** are encrypted by WebRTC (DTLS-SRTP) and travel directly between participants.
- **Passwords** are hashed with bcrypt (12 rounds) and never stored in plain text.
- **Login tokens** are signed JWTs that expire after 7 days. The same token is required to open a socket connection.
- **Uploaded files** are encrypted at rest with **AES-256-GCM**. Each file gets a random initialization vector, and the authentication tag detects any tampering. Files are stored under random names and always downloaded as attachments. Executable file types (`.exe`, `.bat`, `.cmd`, `.com`, `.scr`, `.msi`, `.vbs`, `.ps1`, `.dll`) are blocked.
- **Host-only actions** (attendance, muting, removing, locking, polls, timer, clearing the whiteboard) are checked on the server, not only hidden in the interface.
- **Rate limiting**: 10 failed logins per 15 minutes, 20 registrations per hour, and a general API limit per address.
- **Helmet** security headers, a 100 KB limit on request bodies, and validation of every real-time message.
- **CSV export** neutralizes cells that start like spreadsheet formulas.
- The server **refuses to start** with missing or weak secrets.

What is **not** covered yet:

- Chat, whiteboard, notes, polls and captions pass through the server in readable form (kept in memory only). They are not end-to-end encrypted.
- The development setup uses plain HTTP. **Use HTTPS in production.**
- Files are encrypted with a key held by the server, so this protects stolen disks and backups, not a compromised server.

---

## Browser support

| Feature | Chrome / Edge | Firefox | Safari |
|---|---|---|---|
| Video calls, chat, whiteboard, files | Yes | Yes | Yes |
| Screen sharing | Yes | Yes | Yes (desktop) |
| Captioning your own voice | Yes | No | Yes |
| Recording | Yes | Yes | Limited |

Captions use the browser's built-in speech recognition, which sends the speaker's audio to the browser maker's speech service (Google for Chrome). Only the resulting text is shared with the meeting, and captioning is opt-in for every person.

Browser features change over time, so treat this table as a general guide.

---

## Known limitations

This project is under active testing, and some bugs may remain.

- **Up to 8 people per meeting.** Video uses a peer-to-peer mesh, where every person sends video to everyone else. A media server (SFU) would be needed for larger meetings.
- **STUN only.** There is no TURN relay, so people on strict corporate networks or some mobile networks may be unable to connect. A TURN server is needed for production.
- **Meeting state is kept in memory.** Chat, whiteboard, polls, notes, the timer and the transcript are lost when a meeting empties or the server restarts. Download notes and transcripts before leaving.
- **Recording** is made in the recorder's browser, includes only the video tiles, shared screen and audio (no whiteboard, chat or captions), is limited to 60 minutes, and can freeze the picture if the tab is hidden. The file is MP4 when the browser supports it, otherwise WebM.
- **No email verification or password reset** yet.
- **No automated tests** yet.

---

## Roadmap

- TURN server and a media server (SFU) for larger meetings
- Password reset and email verification
- Scheduled meetings and calendar invites
- Breakout rooms for group work
- Persistent chat history and meeting summaries
- Automated tests and a CI pipeline
- Docker setup and a deployment guide

---

## Author

**Tanim Mohammed Khan** - [GitHub](https://github.com/TanimMohammedKhan)