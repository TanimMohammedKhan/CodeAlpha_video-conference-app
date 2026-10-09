import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Lock,
  Maximize,
  Minimize,
  Timer,
  Users,
} from 'lucide-react';
import { apiRequest, downloadMeetingFile, uploadMeetingFile } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatClock, useCountdown } from '../hooks/useCountdown';
import { useFullscreen } from '../hooks/useFullscreen';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useRecorder } from '../hooks/useRecorder';
import { useRoomConnection } from '../hooks/useRoomConnection';
import { useScreenShare } from '../hooks/useScreenShare';
import {
  defaultCaptionLanguage,
  useSpeechRecognition,
} from '../hooks/useSpeechRecognition';
import { playChime } from '../sound';
import Navbar from '../components/Navbar';
import VideoTile from '../components/VideoTile';
import ScreenTile from '../components/ScreenTile';
import Whiteboard from '../components/Whiteboard';
import ChatPanel from '../components/ChatPanel';
import FilePanel from '../components/FilePanel';
import AttendancePanel from '../components/AttendancePanel';
import PeoplePanel from '../components/PeoplePanel';
import PollPanel from '../components/PollPanel';
import TimerPanel from '../components/TimerPanel';
import NotesPanel from '../components/NotesPanel';
import CaptionsPanel from '../components/CaptionsPanel';
import CaptionOverlay from '../components/CaptionOverlay';
import RecordPanel from '../components/RecordPanel';
import ReactionLayer from '../components/ReactionLayer';
import ControlBar from '../components/ControlBar';
import '../meetings.css';
import '../call.css';
import '../social.css';
import '../focus.css';
import '../captions.css';
import '../recording.css';

function Room() {
  const { code } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const media = useLocalMedia();
  const {
    screenStream,
    supported: screenSupported,
    error: screenError,
    start: startScreen,
    stop: stopScreen,
  } = useScreenShare();
  const callRef = useRef(null);
  const callFullscreen = useFullscreen(callRef);
  const layoutRef = useRef(null);
  const serverStopRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sidePanel, setSidePanel] = useState(null);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [myHand, setMyHand] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const [seenFiles, setSeenFiles] = useState(0);
  const [seenNotes, setSeenNotes] = useState(0);
  const [notice, setNotice] = useState('');
  const [captions, setCaptions] = useState(() => ({
    show: false,
    speak: false,
    language: defaultCaptionLanguage(),
  }));

  const handleScreenDenied = useCallback(() => {
    stopScreen();
    setNotice('Someone else is already sharing their screen.');
  }, [stopScreen]);

  // The server did not let us in (locked, removed, full, ...)
  const handleJoinDenied = useCallback((message) => {
    setJoined(false);
    setMyHand(false);
    setJoinError(message);
  }, []);

  // The host removed us from the meeting
  const handleRemoved = useCallback(() => {
    navigate('/dashboard', {
      state: { notice: 'You were removed from the meeting by the host.' },
    });
  }, [navigate]);

  // The host muted us
  const handleForceMute = () => {
    if (media.micOn) media.toggleMic();
    setNotice('The host muted your microphone. You can unmute yourself when you are ready.');
  };

  // A poll was started or finished, so open the polls panel for everyone
  const handlePollEvent = () => showPanel('polls');

  // The shared timer ran out
  const handleTimerFinished = (mode) => {
    playChime();
    setNotice(
      mode === 'focus'
        ? 'Focus session finished. Time for a break!'
        : 'Break is over. Ready to focus?'
    );
  };

  // The recorder saves the video to this computer and then tells the server
  const recorder = useRecorder({
    onStopped: (reason) => {
      if (serverStopRef.current) serverStopRef.current();

      if (reason === 'limit') {
        setNotice('Recording stopped at the 60-minute limit and was saved to your computer.');
      } else if (reason === 'forbidden') {
        setNotice('The host turned off recording for participants. Your recording was saved.');
      } else if (reason === 'error') {
        setNotice('The recording stopped because of an error. What was recorded so far was saved.');
      } else {
        setNotice('Recording saved. Check your Downloads folder.');
      }
    },
  });

  // Somebody else started or stopped recording
  const handleRecordingChange = ({ name, recording }) => {
    const who = name || 'Someone';
    setNotice(recording ? `${who} started recording this meeting.` : `${who} stopped recording.`);
  };

  const connection = useRoomConnection({
    enabled: joined,
    code,
    token,
    localStream: media.stream,
    micOn: media.micOn,
    camOn: media.camOn,
    screenStream,
    onScreenShareDenied: handleScreenDenied,
    onJoinDenied: handleJoinDenied,
    onRemoved: handleRemoved,
    onForceMute: handleForceMute,
    onPollStarted: handlePollEvent,
    onPollEnded: handlePollEvent,
    onTimerFinished: handleTimerFinished,
    onRecordingChange: handleRecordingChange,
    onRecordingForbidden: () => recorder.stop('forbidden'),
  });

  useEffect(() => {
    serverStopRef.current = connection.stopRecording;
  });

  const remainingMs = useCountdown(connection.timer, connection.clockOffset);

  // Turn your own voice into captions (only while your microphone is on)
  const speech = useSpeechRecognition({
    active: joined && captions.speak && media.micOn,
    language: captions.language,
    onResult: connection.sendCaption,
  });

  const updateCaptions = (changes) =>
    setCaptions((previous) => ({ ...previous, ...changes }));

  // Wait until the browser has finished checking for a camera and microphone
  const mediaReady = Boolean(media.stream) || Boolean(media.error);

  useEffect(() => {
    let cancelled = false;

    apiRequest(`/api/meetings/${code}`, { token })
      .then((data) => {
        if (!cancelled) setMeeting(data.meeting);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [code, token]);

  // Messages disappear by themselves after a few seconds
  useEffect(() => {
    if (!notice) return undefined;
    const timerId = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timerId);
  }, [notice]);

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the link');
    }
  };

  const toggleScreen = () => {
    setNotice('');
    if (screenStream) {
      stopScreen();
    } else {
      startScreen();
    }
  };

  const toggleWhiteboard = () => setWhiteboardOpen((open) => !open);

  const toggleHand = () => {
    const next = !myHand;
    setMyHand(next);
    connection.setHand(next);
  };

  const handleMuteAll = () => {
    connection.muteAll();
    setNotice('Everyone else has been muted.');
  };

  // Ask the server for permission, then start the recorder
  const handleStartRecording = async () => {
    setNotice('');
    try {
      await connection.startRecording();
    } catch (err) {
      setNotice(err.message);
      return;
    }

    const started = recorder.start(
      () => layoutRef.current,
      meeting ? meeting.title : 'meeting'
    );
    if (!started) connection.stopRecording();
  };

  // Chat, files, notes, captions, recording, attendance, people, polls and
  // the timer share the right-hand side, so only one is open at a time
  function showPanel(name) {
    // Anything that arrived while a panel was open counts as read
    if (sidePanel === 'chat') setSeenCount(connection.messages.length);
    if (sidePanel === 'files') setSeenFiles(connection.files.length);
    if (sidePanel === 'notes') setSeenNotes(connection.notes.length);
    setSidePanel(name);
  }

  const switchPanel = (name) => showPanel(sidePanel === name ? null : name);

  const uploadFile = (file, onProgress) =>
    uploadMeetingFile(code, file, token, onProgress);

  const downloadFile = (file) => downloadMeetingFile(code, file, token);

  const unread =
    sidePanel === 'chat' ? 0 : Math.max(0, connection.messages.length - seenCount);
  const newFiles =
    sidePanel === 'files' ? 0 : Math.max(0, connection.files.length - seenFiles);
  const newNotes =
    sidePanel === 'notes' ? 0 : Math.max(0, connection.notes.length - seenNotes);
  const raisedHands =
    connection.participants.filter((p) => p.handRaised).length + (myHand ? 1 : 0);

  const presenter = connection.participants.find((p) => p.sharing);
  const remoteScreenStream = presenter ? presenter.screenStream : null;
  const isSharing = Boolean(screenStream);
  const hasScreen = isSharing || Boolean(remoteScreenStream);
  const hasStage = whiteboardOpen || hasScreen;
  const callMessage = connection.error || screenError || notice;
  const timerActive = Boolean(connection.timer) && connection.timer.status !== 'idle';
  const otherRecorders = connection.participants.filter((p) => p.recording);

  // What the recorder should draw and hear right now
  useEffect(() => {
    let screen = null;
    if (screenStream) {
      screen = { stream: screenStream, label: 'You are presenting' };
    } else if (presenter && remoteScreenStream) {
      screen = {
        stream: remoteScreenStream,
        label: `${presenter.name || 'Participant'} is presenting`,
      };
    }

    layoutRef.current = {
      screen,
      tiles: [
        {
          id: 'self',
          stream: media.stream,
          name: user.name,
          camOn: media.camOn,
          micOn: media.micOn,
        },
        ...connection.participants.map((participant) => ({
          id: participant.id,
          stream: participant.stream,
          name: participant.name || 'Participant',
          camOn: Boolean(participant.camOn),
          micOn: Boolean(participant.micOn),
        })),
      ],
      audio: [
        media.stream,
        screenStream,
        remoteScreenStream,
        ...connection.participants.map((participant) => participant.stream),
      ].filter(Boolean),
    };
  });

  // Meeting not found or failed to load
  if (error && !meeting) {
    return (
      <>
        <Navbar />
        <main className="page">
          <div className="surface room-card">
            <h1>Meeting unavailable</h1>
            <div className="alert">{error}</div>
            <div className="room-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft size={18} />
                Back to dashboard
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Still loading the meeting
  if (!meeting) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  // In the call
  if (joined) {
    // Only the host of the meeting may use host controls, clear the
    // whiteboard, run polls, run the timer and see attendance
    const isHost = meeting.host_id === user.id;
    const pollAlert =
      !isHost && connection.poll && connection.myVote === null ? 1 : 0;

    return (
      <div className="call-screen" ref={callRef}>
        <header className="call-header">
          <div>
            <div className="call-title">{meeting.title}</div>
            <div className="call-code">{meeting.room_code}</div>
          </div>
          <div className="call-header-actions">
            {recorder.recording && (
              <button
                type="button"
                className="rec-chip"
                onClick={() => switchPanel('record')}
                title="You are recording"
              >
                <span className="rec-dot" />
                REC {formatClock(recorder.seconds * 1000)}
              </button>
            )}
            {otherRecorders.map((person) => (
              <span key={person.id} className="rec-chip">
                <span className="rec-dot" />
                {person.name || 'Someone'} is recording
              </span>
            ))}
            {timerActive && (
              <button
                type="button"
                className={`timer-chip ${connection.timer.mode}`}
                onClick={() => switchPanel('timer')}
                title="Focus timer"
              >
                <Timer size={14} />
                <span>
                  {connection.timer.status === 'paused' ? 'Paused · ' : ''}
                  {formatClock(remainingMs)}
                </span>
              </button>
            )}
            {connection.locked && (
              <span className="lock-chip">
                <Lock size={14} />
                Locked
              </span>
            )}
            <span className="participant-count">
              <Users size={16} />
              {1 + connection.participants.length}
            </span>
            <button type="button" className="btn btn-ghost" onClick={copyInviteLink}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
            {callFullscreen.supported && (
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                onClick={callFullscreen.toggle}
                aria-label={
                  callFullscreen.isFullscreen ? 'Exit full screen' : 'Full screen'
                }
                title={callFullscreen.isFullscreen ? 'Exit full screen' : 'Full screen'}
              >
                {callFullscreen.isFullscreen ? (
                  <Minimize size={18} />
                ) : (
                  <Maximize size={18} />
                )}
              </button>
            )}
          </div>
        </header>

        {callMessage && (
          <div className="alert" style={{ margin: '0 24px 12px' }}>
            {callMessage}
          </div>
        )}

        <div className="call-main">
          <main className={`video-grid ${hasStage ? 'with-screen' : ''}`}>
            {whiteboardOpen && (
              <Whiteboard
                board={connection.board}
                onStroke={connection.emitStroke}
                onUndo={connection.undoStroke}
                onClear={connection.clearBoard}
                canClear={isHost}
              />
            )}

            {!whiteboardOpen && isSharing && (
              <ScreenTile stream={screenStream} muted label="You are presenting" />
            )}

            {!whiteboardOpen && !isSharing && presenter && remoteScreenStream && (
              <ScreenTile
                stream={remoteScreenStream}
                label={`${presenter.name || 'Participant'} is presenting`}
              />
            )}

            <VideoTile
              stream={media.stream}
              name={user.name}
              muted
              micOn={media.micOn}
              camOn={media.camOn}
              isSelf
              handRaised={myHand}
            />

            {connection.participants.map((participant) => (
              <VideoTile
                key={participant.id}
                stream={participant.stream}
                name={participant.name || 'Participant'}
                micOn={participant.micOn}
                camOn={participant.camOn}
                handRaised={participant.handRaised}
              />
            ))}
          </main>

          {sidePanel === 'chat' && (
            <ChatPanel
              messages={connection.messages}
              currentUserId={user.id}
              onSend={connection.sendMessage}
              onClose={() => switchPanel('chat')}
            />
          )}

          {sidePanel === 'files' && (
            <FilePanel
              files={connection.files}
              onUpload={uploadFile}
              onDownload={downloadFile}
              onClose={() => switchPanel('files')}
            />
          )}

          {sidePanel === 'notes' && (
            <NotesPanel
              notes={connection.notes}
              currentUserId={user.id}
              hostUserId={meeting.host_id}
              title={meeting.title}
              onAdd={connection.addNote}
              onEdit={connection.editNote}
              onToggle={connection.toggleNote}
              onDelete={connection.deleteNote}
              onClose={() => switchPanel('notes')}
            />
          )}

          {sidePanel === 'captions' && (
            <CaptionsPanel
              settings={captions}
              onChange={updateCaptions}
              supported={speech.supported}
              listening={speech.listening}
              error={speech.error}
              micOn={media.micOn}
              transcript={connection.transcript}
              title={meeting.title}
              onClose={() => switchPanel('captions')}
            />
          )}

          {sidePanel === 'record' && (
            <RecordPanel
              supported={recorder.supported}
              recording={recorder.recording}
              seconds={recorder.seconds}
              error={recorder.error}
              isHost={isHost}
              canRecord={isHost || connection.allowRecording}
              allowRecording={connection.allowRecording}
              others={otherRecorders}
              onStart={handleStartRecording}
              onStop={() => recorder.stop('user')}
              onToggleAllow={() =>
                connection.setAllowRecording(!connection.allowRecording)
              }
              onClose={() => switchPanel('record')}
            />
          )}

          {sidePanel === 'timer' && (
            <TimerPanel
              timer={connection.timer}
              remainingMs={remainingMs}
              isHost={isHost}
              onStart={connection.timerStart}
              onPause={connection.timerPause}
              onResume={connection.timerResume}
              onReset={connection.timerReset}
              onClose={() => switchPanel('timer')}
            />
          )}

          {sidePanel === 'attendance' && isHost && (
            <AttendancePanel
              code={code}
              token={token}
              onClose={() => switchPanel('attendance')}
            />
          )}

          {sidePanel === 'people' && (
            <PeoplePanel
              selfName={user.name}
              selfMicOn={media.micOn}
              selfHand={myHand}
              selfUserId={user.id}
              hostId={meeting.host_id}
              participants={connection.participants}
              isHost={isHost}
              locked={connection.locked}
              onMuteAll={handleMuteAll}
              onMuteUser={connection.muteUser}
              onRemove={connection.removeUser}
              onToggleLock={() => connection.setRoomLocked(!connection.locked)}
              onClose={() => switchPanel('people')}
            />
          )}

          {sidePanel === 'polls' && (
            <PollPanel
              isHost={isHost}
              poll={connection.poll}
              myVote={connection.myVote}
              counts={connection.pollCounts}
              history={connection.pollHistory}
              scores={connection.scores}
              currentUserId={user.id}
              onStart={connection.startPoll}
              onVote={connection.votePoll}
              onEnd={connection.endPoll}
              onClose={() => switchPanel('polls')}
            />
          )}

          {captions.show && (
            <CaptionOverlay live={connection.liveCaptions} currentUserId={user.id} />
          )}

          <ReactionLayer reactions={connection.reactions} />
        </div>

        <ControlBar
          micOn={media.micOn}
          camOn={media.camOn}
          onToggleMic={media.toggleMic}
          onToggleCam={media.toggleCam}
          onLeave={() => navigate('/dashboard')}
          micDisabled={!media.hasMic}
          camDisabled={!media.hasCam}
          screenSupported={screenSupported}
          screenSharing={isSharing}
          screenDisabled={Boolean(presenter) && !isSharing}
          onToggleScreen={toggleScreen}
          whiteboardOpen={whiteboardOpen}
          onToggleWhiteboard={toggleWhiteboard}
          handRaised={myHand}
          onToggleHand={toggleHand}
          onReact={connection.sendReaction}
          recordOpen={sidePanel === 'record'}
          recording={recorder.recording}
          onToggleRecord={() => switchPanel('record')}
          captionsOpen={sidePanel === 'captions'}
          captionsActive={captions.show || captions.speak}
          onToggleCaptions={() => switchPanel('captions')}
          pollsOpen={sidePanel === 'polls'}
          pollAlert={pollAlert}
          onTogglePolls={() => switchPanel('polls')}
          timerOpen={sidePanel === 'timer'}
          timerRunning={Boolean(connection.timer) && connection.timer.status === 'running'}
          onToggleTimer={() => switchPanel('timer')}
          notesOpen={sidePanel === 'notes'}
          newNotes={newNotes}
          onToggleNotes={() => switchPanel('notes')}
          filesOpen={sidePanel === 'files'}
          newFiles={newFiles}
          onToggleFiles={() => switchPanel('files')}
          attendanceOpen={sidePanel === 'attendance'}
          onToggleAttendance={isHost ? () => switchPanel('attendance') : undefined}
          peopleOpen={sidePanel === 'people'}
          handCount={raisedHands}
          onTogglePeople={() => switchPanel('people')}
          chatOpen={sidePanel === 'chat'}
          unread={unread}
          onToggleChat={() => switchPanel('chat')}
        />
      </div>
    );
  }

  // Lobby (before joining)
  return (
    <>
      <Navbar />
      <main className="page">
        <div className="lobby">
          <div className="lobby-preview">
            <VideoTile
              stream={media.stream}
              name={user.name}
              muted
              micOn={media.micOn}
              camOn={media.camOn}
              isSelf
            />
            <ControlBar
              micOn={media.micOn}
              camOn={media.camOn}
              onToggleMic={media.toggleMic}
              onToggleCam={media.toggleCam}
              micDisabled={!media.hasMic}
              camDisabled={!media.hasCam}
            />
          </div>

          <div className="lobby-info">
            <h1>{meeting.title}</h1>
            <p className="host">Hosted by {meeting.host_name}</p>

            <div className="code-box">
              <span>{meeting.room_code}</span>
            </div>

            {media.notice && <p className="host">{media.notice}</p>}
            {media.error && <div className="alert">{media.error}</div>}
            {joinError && <div className="alert">{joinError}</div>}

            <div className="room-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setJoinError('');
                  setJoined(true);
                }}
                disabled={!mediaReady}
              >
                Join now
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft size={18} />
                Back to dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default Room;