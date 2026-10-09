import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiRequest } from '../api';
import { SERVER_URL } from '../config';
import { createBoardStore } from '../whiteboardStore';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function removeScreenFromPeer(peer) {
  (peer.screenSenders || []).forEach((sender) => {
    try {
      peer.pc.removeTrack(sender);
    } catch (err) {
      console.error('Could not remove screen track:', err);
    }
  });
  peer.screenSenders = [];
}

function addScreenToPeer(peer, stream) {
  removeScreenFromPeer(peer);
  peer.screenSenders = stream
    .getTracks()
    .map((track) => peer.pc.addTrack(track, stream));
}

// Combine two lists of shared files without duplicates
function mergeFiles(previous, incoming) {
  const byId = new Map(previous.map((file) => [file.id, file]));
  incoming.forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

export function useRoomConnection({
  enabled,
  code,
  token,
  localStream,
  micOn,
  camOn,
  screenStream,
  onScreenShareDenied,
  onJoinDenied,
  onRemoved,
  onForceMute,
  onPollStarted,
  onPollEnded,
  onTimerFinished,
  onRecordingChange,
  onRecordingForbidden,
}) {
  const [participants, setParticipants] = useState({});
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [locked, setLocked] = useState(false);
  const [allowRecording, setAllowRecording] = useState(false);
  const [poll, setPoll] = useState(null);
  const [myVote, setMyVote] = useState(null);
  const [pollCounts, setPollCounts] = useState(null);
  const [pollHistory, setPollHistory] = useState([]);
  const [scores, setScores] = useState([]);
  const [timer, setTimer] = useState(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [notes, setNotes] = useState([]);
  const [liveCaptions, setLiveCaptions] = useState({});
  const [transcript, setTranscript] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [board] = useState(createBoardStore);
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const mediaStateRef = useRef({ micOn, camOn });
  const activeScreenRef = useRef(null);
  const myVoteRef = useRef(null);
  const handlersRef = useRef({
    onScreenShareDenied,
    onJoinDenied,
    onRemoved,
    onForceMute,
    onPollStarted,
    onPollEnded,
    onTimerFinished,
    onRecordingChange,
    onRecordingForbidden,
  });

  // Always call the newest versions of the callbacks
  useEffect(() => {
    handlersRef.current = {
      onScreenShareDenied,
      onJoinDenied,
      onRemoved,
      onForceMute,
      onPollStarted,
      onPollEnded,
      onTimerFinished,
      onRecordingChange,
      onRecordingForbidden,
    };
  });

  // Keep the chosen poll answer in state and in a ref, so event handlers
  // always see the latest value
  const updateMyVote = useCallback((value) => {
    myVoteRef.current = value;
    setMyVote(value);
  }, []);

  // Tell everyone when the microphone or camera is switched on or off
  useEffect(() => {
    mediaStateRef.current = { micOn, camOn };
    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit('media-state', { micOn, camOn });
    }
  }, [micOn, camOn]);

  // Start or stop sharing the screen with everyone in the meeting
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return undefined;

    if (screenStream) {
      let cancelled = false;

      socket.emit(
        'screen-share',
        { sharing: true, streamId: screenStream.id },
        (response) => {
          if (cancelled) {
            // The user stopped sharing before the server answered
            if (response && response.ok) {
              socket.emit('screen-share', { sharing: false });
            }
            return;
          }
          if (!response || !response.ok) {
            const denied = handlersRef.current.onScreenShareDenied;
            if (denied) denied();
            return;
          }
          activeScreenRef.current = screenStream;
          peersRef.current.forEach((peer) => addScreenToPeer(peer, screenStream));
        }
      );

      return () => {
        cancelled = true;
      };
    }

    if (activeScreenRef.current) {
      activeScreenRef.current = null;
      peersRef.current.forEach((peer) => removeScreenFromPeer(peer));
      socket.emit('screen-share', { sharing: false });
    }
    return undefined;
  }, [screenStream]);

  useEffect(() => {
    if (!enabled) return undefined;

    const socket = io(SERVER_URL, { auth: { token } });
    socketRef.current = socket;
    const peers = peersRef.current;
    const reactionTimers = new Set();

    function updateParticipant(id, changes) {
      setParticipants((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...changes },
      }));
    }

    function removePeer(id) {
      const peer = peers.get(id);
      if (peer) {
        peer.pc.close();
        peers.delete(id);
      }
      setParticipants((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    function resetPolls() {
      setPoll(null);
      updateMyVote(null);
      setPollCounts(null);
      setPollHistory([]);
      setScores([]);
    }

    function resetFocus() {
      setTimer(null);
      setClockOffset(0);
      setNotes([]);
      setLiveCaptions({});
      setTranscript([]);
    }

    function createPeer(id) {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peer = {
        pc,
        // One side of every pair is "polite" and backs down if both
        // sides try to start a connection at the same moment
        polite: socket.id > id,
        makingOffer: false,
        ignoreOffer: false,
        remoteStream: new MediaStream(),
        screenStreamId: null,
        screenSenders: [],
      };
      peers.set(id, peer);

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit('signal', { to: id, data: { candidate } });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          socket.emit('signal', {
            to: id,
            data: { description: pc.localDescription },
          });
        } catch (err) {
          console.error('Negotiation failed:', err);
        } finally {
          peer.makingOffer = false;
        }
      };

      pc.ontrack = ({ track, streams }) => {
        const stream = streams[0];

        if (stream && peer.screenStreamId && stream.id === peer.screenStreamId) {
          // This track belongs to the other person's shared screen
          updateParticipant(id, { screenStream: stream });
        } else {
          peer.remoteStream.addTrack(track);
          updateParticipant(id, { stream: peer.remoteStream });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          pc.restartIce();
        }
      };

      // Always create both an audio and a video connection, even if this
      // user has no camera or microphone, so they can still see and hear others
      const audioTrack = localStream ? localStream.getAudioTracks()[0] : null;
      const videoTrack = localStream ? localStream.getVideoTracks()[0] : null;
      const streams = localStream ? [localStream] : [];

      pc.addTransceiver(audioTrack || 'audio', { direction: 'sendrecv', streams });
      pc.addTransceiver(videoTrack || 'video', { direction: 'sendrecv', streams });

      // If we are already presenting, share the screen with the newcomer too
      if (activeScreenRef.current) {
        addScreenToPeer(peer, activeScreenRef.current);
      }

      return peer;
    }

    async function handleSignal(from, data) {
      if (!data) return;
      const peer = peers.get(from) || createPeer(from);
      const { pc } = peer;

      try {
        if (data.description) {
          const description = data.description;
          const offerCollision =
            description.type === 'offer' &&
            (peer.makingOffer || pc.signalingState !== 'stable');

          peer.ignoreOffer = !peer.polite && offerCollision;
          if (peer.ignoreOffer) return;

          await pc.setRemoteDescription(description);
          if (description.type === 'offer') {
            await pc.setLocalDescription();
            socket.emit('signal', {
              to: from,
              data: { description: pc.localDescription },
            });
          }
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch (err) {
            if (!peer.ignoreOffer) throw err;
          }
        }
      } catch (err) {
        console.error('Signal handling failed:', err);
      }
    }

    socket.on('connect', () => {
      // On a reconnect, start fresh
      peers.forEach(({ pc }) => pc.close());
      peers.clear();
      setParticipants({});
      setMessages([]);
      setFiles([]);
      setReactions([]);
      setLocked(false);
      setAllowRecording(false);
      resetPolls();
      resetFocus();
      board.clear();
      setError('');
      setConnected(true);
      socket.emit('join-room', { code, ...mediaStateRef.current });

      // Load the files that were already shared in this meeting
      apiRequest(`/api/meetings/${code}/files`, { token })
        .then((data) => setFiles((prev) => mergeFiles(prev, data.files)))
        .catch(() => {});
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (err) => {
      setError(err.message || 'Could not connect to the meeting');
    });

    socket.on('room-error', (message) => setError(message));

    // The server refused to let us in (locked, removed, full, ...)
    socket.on('join-denied', ({ message }) => {
      const denied = handlersRef.current.onJoinDenied;
      if (denied) denied(message);
    });

    // The host removed us from the meeting
    socket.on('removed', () => {
      const removed = handlersRef.current.onRemoved;
      if (removed) removed();
    });

    // The host muted us
    socket.on('force-mute', () => {
      const mute = handlersRef.current.onForceMute;
      if (mute) mute();
    });

    // The host stopped participants from recording
    socket.on('force-stop-recording', () => {
      const forbidden = handlersRef.current.onRecordingForbidden;
      if (forbidden) forbidden();
    });

    socket.on('room-state', (state) => {
      setLocked(Boolean(state && state.locked));
      setAllowRecording(Boolean(state && state.allowRecording));
    });

    socket.on('room-users', (users) => {
      users.forEach((user) => {
        updateParticipant(user.id, {
          userId: user.userId,
          name: user.name,
          micOn: user.micOn,
          camOn: user.camOn,
          handRaised: Boolean(user.handRaised),
          recording: Boolean(user.recording),
          sharing: Boolean(user.screenStreamId),
        });
        const peer = peers.get(user.id) || createPeer(user.id);
        peer.screenStreamId = user.screenStreamId || null;
      });
    });

    socket.on('user-joined', (user) => {
      updateParticipant(user.id, {
        userId: user.userId,
        name: user.name,
        micOn: user.micOn,
        camOn: user.camOn,
        handRaised: false,
        recording: false,
        sharing: false,
      });
      if (!peers.has(user.id)) createPeer(user.id);
    });

    socket.on('user-left', ({ id }) => removePeer(id));

    socket.on('media-state', ({ id, micOn: remoteMic, camOn: remoteCam }) => {
      updateParticipant(id, { micOn: remoteMic, camOn: remoteCam });
    });

    socket.on('hand', ({ id, raised }) => {
      updateParticipant(id, { handRaised: Boolean(raised) });
    });

    // Somebody started or stopped recording the meeting
    socket.on('recording-state', ({ id, name, recording }) => {
      if (id === socket.id) return;
      updateParticipant(id, { recording: Boolean(recording) });

      const callback = handlersRef.current.onRecordingChange;
      if (callback) callback({ name, recording: Boolean(recording) });
    });

    socket.on('reaction', (reaction) => {
      const item = { ...reaction, left: 8 + Math.random() * 78 };
      setReactions((prev) => [...prev.slice(-30), item]);

      const timerId = setTimeout(() => {
        reactionTimers.delete(timerId);
        setReactions((prev) => prev.filter((r) => r.key !== item.key));
      }, 3500);
      reactionTimers.add(timerId);
    });

    socket.on('screen-share', ({ id, sharing, streamId }) => {
      const peer = peers.get(id);
      if (peer) peer.screenStreamId = sharing ? streamId : null;
      updateParticipant(id, { sharing: Boolean(sharing), screenStream: null });
    });

    socket.on('signal', ({ from, data }) => handleSignal(from, data));

    socket.on('chat-history', (history) => setMessages(history));
    socket.on('chat-message', (message) => {
      setMessages((prev) => [...prev, message].slice(-200));
    });

    // Shared files
    socket.on('file-shared', (file) => {
      setFiles((prev) => mergeFiles(prev, [file]));
    });

    // Polls and quizzes
    socket.on('poll-state', (state) => {
      setPoll(state.active || null);
      updateMyVote(state.myVote === undefined ? null : state.myVote);
      setPollCounts(state.counts || null);
      setPollHistory(state.history || []);
      setScores(state.scores || []);
    });

    socket.on('poll-started', (started) => {
      setPoll(started);
      updateMyVote(null);
      setPollCounts(null);
      const callback = handlersRef.current.onPollStarted;
      if (callback) callback(started);
    });

    socket.on('poll-counts', (data) => setPollCounts(data));

    socket.on('poll-ended', (result) => {
      setPoll(null);
      updateMyVote(null);
      setPollCounts(null);
      setPollHistory((prev) =>
        [result, ...prev.filter((item) => item.id !== result.id)].slice(0, 20)
      );
      const callback = handlersRef.current.onPollEnded;
      if (callback) callback(result);
    });

    socket.on('poll-scores', (list) => setScores(list));

    // Focus timer
    socket.on('timer-state', ({ timer: state, serverNow }) => {
      setTimer(state);
      setClockOffset(serverNow - Date.now());
    });

    socket.on('timer-finished', ({ mode }) => {
      const callback = handlersRef.current.onTimerFinished;
      if (callback) callback(mode);
    });

    // Shared notes
    socket.on('notes-state', (list) => setNotes(Array.isArray(list) ? list : []));

    // Live captions and transcript
    socket.on('caption', (line) => {
      setLiveCaptions((prev) => ({
        ...prev,
        [line.userId]: {
          userId: line.userId,
          name: line.name,
          text: line.text,
          final: line.final,
          time: Date.now(),
        },
      }));

      if (line.final) {
        setTranscript((prev) => [...prev, line].slice(-1000));
      }
    });

    socket.on('transcript-state', (list) => {
      setTranscript(Array.isArray(list) ? list : []);
    });

    // Whiteboard
    socket.on('wb-state', (strokes) => {
      board.setStrokes(Array.isArray(strokes) ? strokes : []);
    });
    socket.on('wb-stroke', (chunk) => board.applyChunk(chunk));
    socket.on('wb-remove', ({ id }) => board.remove(id));
    socket.on('wb-clear', () => board.clear());

    return () => {
      reactionTimers.forEach((timerId) => clearTimeout(timerId));
      socket.disconnect();
      socketRef.current = null;
      peers.forEach(({ pc }) => pc.close());
      peers.clear();
      activeScreenRef.current = null;
      setParticipants({});
      setMessages([]);
      setFiles([]);
      setReactions([]);
      setLocked(false);
      setAllowRecording(false);
      resetPolls();
      resetFocus();
      board.clear();
      setConnected(false);
    };
  }, [enabled, code, token, localStream, board, updateMyVote]);

  const emit = useCallback((event, payload) => {
    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit(event, payload);
    }
  }, []);

  // Send an event and wait for the server's answer
  const request = useCallback(
    (event, payload, fallbackMessage) =>
      new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          reject(new Error('You are not connected to the meeting.'));
          return;
        }

        socket.emit(event, payload, (response) => {
          if (response && response.ok) {
            resolve();
          } else {
            reject(new Error((response && response.message) || fallbackMessage));
          }
        });
      }),
    []
  );

  const sendMessage = useCallback((text) => emit('chat-message', { text }), [emit]);
  const emitStroke = useCallback((chunk) => emit('wb-stroke', chunk), [emit]);
  const undoStroke = useCallback(() => emit('wb-undo'), [emit]);
  const clearBoard = useCallback(() => emit('wb-clear'), [emit]);
  const setHand = useCallback((raised) => emit('hand', { raised }), [emit]);
  const sendReaction = useCallback((type) => emit('reaction', { type }), [emit]);
  const sendCaption = useCallback(
    (text, final) => emit('caption', { text, final: Boolean(final) }),
    [emit]
  );
  const muteAll = useCallback(() => emit('host-mute-all'), [emit]);
  const muteUser = useCallback((id) => emit('host-mute-user', { id }), [emit]);
  const removeUser = useCallback((id) => emit('host-remove', { id }), [emit]);
  const setRoomLocked = useCallback(
    (value) => emit('host-lock', { locked: Boolean(value) }),
    [emit]
  );

  // Recording: ask permission first, then tell everyone when it stops
  const startRecording = useCallback(
    () => request('recording-start', {}, 'Could not start recording.'),
    [request]
  );
  const stopRecording = useCallback(() => emit('recording-stop'), [emit]);
  const setRecordingAllowed = useCallback(
    (allowed) => emit('host-allow-recording', { allowed: Boolean(allowed) }),
    [emit]
  );

  const startPoll = useCallback(
    (data) => request('poll-start', data, 'Could not start the poll.'),
    [request]
  );

  const votePoll = useCallback(
    async (pollId, index) => {
      await request('poll-vote', { pollId, index }, 'Could not send your answer.');
      updateMyVote(index);
    },
    [request, updateMyVote]
  );

  const endPoll = useCallback(() => emit('poll-end'), [emit]);

  const timerStart = useCallback(
    (mode, minutes) => emit('timer-start', { mode, minutes }),
    [emit]
  );
  const timerPause = useCallback(() => emit('timer-pause'), [emit]);
  const timerResume = useCallback(() => emit('timer-resume'), [emit]);
  const timerReset = useCallback(() => emit('timer-reset'), [emit]);

  const addNote = useCallback((text, kind) => emit('note-add', { text, kind }), [emit]);
  const editNote = useCallback((id, text) => emit('note-edit', { id, text }), [emit]);
  const toggleNote = useCallback((id) => emit('note-toggle', { id }), [emit]);
  const deleteNote = useCallback((id) => emit('note-delete', { id }), [emit]);

  const participantList = Object.entries(participants).map(([id, participant]) => ({
    id,
    ...participant,
  }));

  return {
    participants: participantList,
    messages,
    sendMessage,
    files,
    reactions,
    sendReaction,
    liveCaptions,
    transcript,
    sendCaption,
    setHand,
    locked,
    muteAll,
    muteUser,
    removeUser,
    setRoomLocked,
    allowRecording,
    startRecording,
    stopRecording,
    setAllowRecording: setRecordingAllowed,
    poll,
    myVote,
    pollCounts,
    pollHistory,
    scores,
    startPoll,
    votePoll,
    endPoll,
    timer,
    clockOffset,
    timerStart,
    timerPause,
    timerResume,
    timerReset,
    notes,
    addNote,
    editNote,
    toggleNote,
    deleteNote,
    board,
    emitStroke,
    undoStroke,
    clearBoard,
    connected,
    error,
  };
}