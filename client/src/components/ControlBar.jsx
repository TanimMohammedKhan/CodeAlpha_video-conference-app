import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  Circle,
  ClipboardList,
  Hand,
  ListChecks,
  MessageSquare,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  Paperclip,
  PenTool,
  PhoneOff,
  Smile,
  StickyNote,
  Timer,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import { REACTIONS } from '../reactions';

function ControlBar({
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onLeave,
  micDisabled = false,
  camDisabled = false,
  screenSupported = false,
  screenSharing = false,
  screenDisabled = false,
  onToggleScreen,
  whiteboardOpen = false,
  onToggleWhiteboard,
  handRaised = false,
  onToggleHand,
  onReact,
  recordOpen = false,
  recording = false,
  onToggleRecord,
  captionsOpen = false,
  captionsActive = false,
  onToggleCaptions,
  pollsOpen = false,
  pollAlert = 0,
  onTogglePolls,
  timerOpen = false,
  timerRunning = false,
  onToggleTimer,
  notesOpen = false,
  newNotes = 0,
  onToggleNotes,
  filesOpen = false,
  newFiles = 0,
  onToggleFiles,
  attendanceOpen = false,
  onToggleAttendance,
  peopleOpen = false,
  handCount = 0,
  onTogglePeople,
  chatOpen = false,
  unread = 0,
  onToggleChat,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  // Close the reaction picker when clicking anywhere else
  useEffect(() => {
    if (!pickerOpen) return undefined;

    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  let micTitle = micOn ? 'Turn microphone off' : 'Turn microphone on';
  if (micDisabled) micTitle = 'No microphone detected';

  let camTitle = camOn ? 'Turn camera off' : 'Turn camera on';
  if (camDisabled) camTitle = 'No camera detected';

  let screenTitle = screenSharing ? 'Stop sharing your screen' : 'Share your screen';
  if (screenDisabled) screenTitle = 'Someone else is presenting';

  const whiteboardTitle = whiteboardOpen ? 'Close whiteboard' : 'Open whiteboard';
  const handTitle = handRaised ? 'Lower your hand' : 'Raise your hand';
  const recordTitle = recordOpen ? 'Close recording' : 'Recording';
  const captionsTitle = captionsOpen ? 'Close captions' : 'Captions and transcript';
  const pollsTitle = pollsOpen ? 'Close polls' : 'Polls and quizzes';
  const timerTitle = timerOpen ? 'Close focus timer' : 'Focus timer';
  const notesTitle = notesOpen ? 'Close shared notes' : 'Shared notes';
  const filesTitle = filesOpen ? 'Close shared files' : 'Shared files';
  const attendanceTitle = attendanceOpen ? 'Close attendance' : 'Attendance report';
  const peopleTitle = peopleOpen ? 'Close people' : 'People';

  return (
    <div className="control-bar">
      <button
        type="button"
        className={`control-btn ${micOn ? '' : 'off'}`}
        onClick={onToggleMic}
        disabled={micDisabled}
        aria-label={micTitle}
        title={micTitle}
      >
        {micOn ? <Mic size={22} /> : <MicOff size={22} />}
      </button>

      <button
        type="button"
        className={`control-btn ${camOn ? '' : 'off'}`}
        onClick={onToggleCam}
        disabled={camDisabled}
        aria-label={camTitle}
        title={camTitle}
      >
        {camOn ? <Video size={22} /> : <VideoOff size={22} />}
      </button>

      {onToggleScreen && screenSupported && (
        <button
          type="button"
          className={`control-btn ${screenSharing ? 'active' : ''}`}
          onClick={onToggleScreen}
          disabled={screenDisabled}
          aria-label={screenTitle}
          title={screenTitle}
        >
          {screenSharing ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
        </button>
      )}

      {onToggleWhiteboard && (
        <button
          type="button"
          className={`control-btn ${whiteboardOpen ? 'active' : ''}`}
          onClick={onToggleWhiteboard}
          aria-label={whiteboardTitle}
          title={whiteboardTitle}
        >
          <PenTool size={22} />
        </button>
      )}

      {onToggleHand && (
        <button
          type="button"
          className={`control-btn ${handRaised ? 'hand-active' : ''}`}
          onClick={onToggleHand}
          aria-label={handTitle}
          title={handTitle}
        >
          <Hand size={22} />
        </button>
      )}

      {onReact && (
        <div className="reaction-wrap" ref={pickerRef}>
          {pickerOpen && (
            <div className="reaction-picker" role="menu">
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction.type}
                  type="button"
                  className="reaction-option"
                  onClick={() => {
                    onReact(reaction.type);
                    setPickerOpen(false);
                  }}
                  aria-label={reaction.label}
                  title={reaction.label}
                >
                  {reaction.emoji}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={`control-btn ${pickerOpen ? 'active' : ''}`}
            onClick={() => setPickerOpen((open) => !open)}
            aria-label="Send a reaction"
            title="Reactions"
          >
            <Smile size={22} />
          </button>
        </div>
      )}

      {onToggleRecord && (
        <button
          type="button"
          className={`control-btn ${recordOpen ? 'active' : ''} ${recording ? 'recording' : ''}`}
          onClick={onToggleRecord}
          aria-label={recordTitle}
          title={recordTitle}
        >
          <Circle size={22} />
        </button>
      )}

      {onToggleCaptions && (
        <button
          type="button"
          className={`control-btn ${captionsOpen ? 'active' : ''}`}
          onClick={onToggleCaptions}
          aria-label={captionsTitle}
          title={captionsTitle}
        >
          <Captions size={22} />
          {captionsActive && <span className="run-dot" />}
        </button>
      )}

      {onTogglePolls && (
        <button
          type="button"
          className={`control-btn ${pollsOpen ? 'active' : ''}`}
          onClick={onTogglePolls}
          aria-label={pollsTitle}
          title={pollsTitle}
        >
          <ListChecks size={22} />
          {pollAlert > 0 && <span className="hand-dot">!</span>}
        </button>
      )}

      {onToggleTimer && (
        <button
          type="button"
          className={`control-btn ${timerOpen ? 'active' : ''}`}
          onClick={onToggleTimer}
          aria-label={timerTitle}
          title={timerTitle}
        >
          <Timer size={22} />
          {timerRunning && <span className="run-dot" />}
        </button>
      )}

      {onToggleNotes && (
        <button
          type="button"
          className={`control-btn ${notesOpen ? 'active' : ''}`}
          onClick={onToggleNotes}
          aria-label={notesTitle}
          title={notesTitle}
        >
          <StickyNote size={22} />
          {newNotes > 0 && (
            <span className="unread-dot">{newNotes > 9 ? '9+' : newNotes}</span>
          )}
        </button>
      )}

      {onToggleFiles && (
        <button
          type="button"
          className={`control-btn ${filesOpen ? 'active' : ''}`}
          onClick={onToggleFiles}
          aria-label={filesTitle}
          title={filesTitle}
        >
          <Paperclip size={22} />
          {newFiles > 0 && (
            <span className="unread-dot">{newFiles > 9 ? '9+' : newFiles}</span>
          )}
        </button>
      )}

      {onToggleAttendance && (
        <button
          type="button"
          className={`control-btn ${attendanceOpen ? 'active' : ''}`}
          onClick={onToggleAttendance}
          aria-label={attendanceTitle}
          title={attendanceTitle}
        >
          <ClipboardList size={22} />
        </button>
      )}

      {onTogglePeople && (
        <button
          type="button"
          className={`control-btn ${peopleOpen ? 'active' : ''}`}
          onClick={onTogglePeople}
          aria-label={peopleTitle}
          title={peopleTitle}
        >
          <Users size={22} />
          {handCount > 0 && (
            <span className="hand-dot">{handCount > 9 ? '9+' : handCount}</span>
          )}
        </button>
      )}

      {onToggleChat && (
        <button
          type="button"
          className={`control-btn ${chatOpen ? 'active' : ''}`}
          onClick={onToggleChat}
          aria-label="Toggle chat"
          title="Chat"
        >
          <MessageSquare size={22} />
          {unread > 0 && <span className="unread-dot">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}

      {onLeave && (
        <button type="button" className="control-btn leave" onClick={onLeave}>
          <PhoneOff size={20} />
          <span>Leave</span>
        </button>
      )}
    </div>
  );
}

export default ControlBar;