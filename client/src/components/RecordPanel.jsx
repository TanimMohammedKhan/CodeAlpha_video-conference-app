import { Circle, Square, X } from 'lucide-react';
import { formatClock } from '../hooks/useCountdown';
import '../recording.css';

function RecordPanel({
  supported,
  recording,
  seconds,
  error,
  isHost,
  canRecord,
  allowRecording,
  others,
  onStart,
  onStop,
  onToggleAllow,
  onClose,
}) {
  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Recording</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close recording"
        >
          <X size={18} />
        </button>
      </div>

      <div className="rec-body">
        {!supported && (
          <div className="rec-warning">
            This browser cannot record the meeting. Use a recent version of Chrome, Edge or
            Firefox.
          </div>
        )}

        <div className={`rec-status ${recording ? 'live' : ''}`}>
          <div className="rec-time">{formatClock(seconds * 1000)}</div>
          {recording ? (
            <div className="rec-state live">
              <span className="rec-dot" />
              Recording
            </div>
          ) : (
            <div className="rec-state">Not recording</div>
          )}
        </div>

        {error && <div className="rec-error">{error}</div>}

        {recording ? (
          <button type="button" className="btn btn-rec" onClick={onStop}>
            <Square size={16} />
            Stop and save
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-rec"
            onClick={onStart}
            disabled={!supported || !canRecord}
          >
            <Circle size={16} />
            Start recording
          </button>
        )}

        {!recording && !canRecord && (
          <p className="rec-hint">The host has not allowed participants to record.</p>
        )}

        {others.length > 0 && (
          <div className="rec-others">
            Also recording: {others.map((person) => person.name || 'Someone').join(', ')}
          </div>
        )}

        {isHost && (
          <label className="rec-toggle">
            <input
              type="checkbox"
              checked={allowRecording}
              onChange={onToggleAllow}
            />
            Let participants record this meeting
          </label>
        )}

        <p className="rec-hint">
          The video is saved to your own computer (your Downloads folder). Nothing is
          uploaded. Everyone in the meeting is told when you start recording. Please also
          tell them yourself, and follow your school or company rules.
        </p>

        <ul className="rec-list">
          <li>Included: every video tile with names, a shared screen, and the sound of everyone whose microphone is on.</li>
          <li>Not included: the whiteboard, chat, captions and other apps.</li>
          <li>Keep this tab visible while recording. Browsers slow down hidden tabs, and the picture can freeze.</li>
          <li>One recording can last up to 60 minutes.</li>
          <li>
            The file is saved as MP4 when your browser supports it, which plays in any
            player. If it is saved as WebM instead, open it with VLC or Chrome, because
            the default Windows player cannot play WebM.
          </li>
        </ul>
      </div>
    </aside>
  );
}

export default RecordPanel;