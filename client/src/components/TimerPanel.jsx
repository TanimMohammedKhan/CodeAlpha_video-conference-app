import { useState } from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { formatClock } from '../hooks/useCountdown';
import '../focus.css';

const FOCUS_CHOICES = [15, 25, 45, 60];
const BREAK_CHOICES = [5, 10, 15];
const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function TimerPanel({
  timer,
  remainingMs,
  isHost,
  onStart,
  onPause,
  onResume,
  onReset,
  onClose,
}) {
  const [override, setOverride] = useState(null);
  const [minutes, setMinutes] = useState({ focus: 25, break: 5 });

  const current = timer || {
    mode: 'focus',
    status: 'idle',
    durationMs: 25 * 60 * 1000,
    remainingMs: 25 * 60 * 1000,
  };

  const mode = override || current.mode;
  const choices = mode === 'focus' ? FOCUS_CHOICES : BREAK_CHOICES;
  const idle = current.status === 'idle';

  // How much of the session has passed (0 to 1)
  const progress =
    idle || !current.durationMs
      ? 0
      : Math.min(1, Math.max(0, 1 - remainingMs / current.durationMs));

  let statusText = 'Ready';
  if (current.status === 'running') {
    statusText = current.mode === 'focus' ? 'Focus time' : 'Break time';
  } else if (current.status === 'paused') {
    statusText = 'Paused';
  }

  const shownTime = idle ? formatClock(current.durationMs) : formatClock(remainingMs);

  const handleStart = () => {
    const value = Math.min(180, Math.max(1, Math.round(Number(minutes[mode]) || 0)));
    setMinutes((prev) => ({ ...prev, [mode]: value }));
    onStart(mode, value);
    setOverride(null);
  };

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Focus timer</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close timer"
        >
          <X size={18} />
        </button>
      </div>

      <div className="timer-body">
        <div className="timer-ring">
          <svg viewBox="0 0 190 190">
            <circle className="ring-track" cx="95" cy="95" r={RADIUS} />
            <circle
              className={`ring-progress ${current.mode === 'break' ? 'break' : ''}`}
              cx="95"
              cy="95"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            />
          </svg>
          <div className="timer-readout">
            <span className="timer-time">{shownTime}</span>
            <span className="timer-status">{statusText}</span>
          </div>
        </div>

        {isHost ? (
          <div className="timer-controls">
            {idle && (
              <>
                <div className={`seg ${mode === 'break' ? 'break' : ''}`}>
                  <button
                    type="button"
                    className={mode === 'focus' ? 'active' : ''}
                    onClick={() => setOverride('focus')}
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    className={mode === 'break' ? 'active' : ''}
                    onClick={() => setOverride('break')}
                  >
                    Break
                  </button>
                </div>

                <div className="minutes-row">
                  <div className="seg">
                    {choices.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        className={minutes[mode] === choice ? 'active' : ''}
                        onClick={() =>
                          setMinutes((prev) => ({ ...prev, [mode]: choice }))
                        }
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  <input
                    className="minutes-input"
                    type="number"
                    min="1"
                    max="180"
                    value={minutes[mode]}
                    onChange={(e) =>
                      setMinutes((prev) => ({ ...prev, [mode]: Number(e.target.value) }))
                    }
                    aria-label="Minutes"
                  />
                </div>

                <button type="button" className="btn btn-primary" onClick={handleStart}>
                  <Play size={18} />
                  Start for everyone
                </button>
              </>
            )}

            {current.status === 'running' && (
              <div className="timer-actions">
                <button type="button" className="btn btn-primary" onClick={onPause}>
                  <Pause size={18} />
                  Pause
                </button>
                <button type="button" className="btn btn-ghost" onClick={onReset}>
                  <RotateCcw size={18} />
                  Reset
                </button>
              </div>
            )}

            {current.status === 'paused' && (
              <div className="timer-actions">
                <button type="button" className="btn btn-primary" onClick={onResume}>
                  <Play size={18} />
                  Resume
                </button>
                <button type="button" className="btn btn-ghost" onClick={onReset}>
                  <RotateCcw size={18} />
                  Reset
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="timer-note">
            {idle
              ? 'The host starts the timer for everyone.'
              : 'The host controls the timer. Stay focused!'}
          </p>
        )}
      </div>
    </aside>
  );
}

export default TimerPanel;