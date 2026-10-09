import { useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';
import { CAPTION_LANGUAGES } from '../hooks/useSpeechRecognition';
import '../captions.css';
import '../focus.css';

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildText(title, transcript) {
  const lines = [
    `${title} - transcript`,
    `Saved on ${new Date().toLocaleString()}`,
    '',
  ];

  transcript.forEach((line) => {
    lines.push(`[${formatTime(line.time)}] ${line.name}: ${line.text}`);
  });

  return lines.join('\n');
}

function CaptionsPanel({
  settings,
  onChange,
  supported,
  listening,
  error,
  micOn,
  transcript,
  title,
  onClose,
}) {
  const endRef = useRef(null);
  const active = settings.show || settings.speak;

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript.length]);

  const handleDownload = () => {
    const blob = new Blob([buildText(title, transcript)], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meeting-transcript.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Captions &amp; transcript</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close captions"
        >
          <X size={18} />
        </button>
      </div>

      <div className="cc-body">
        {!supported && (
          <div className="cc-warning">
            This browser cannot turn your voice into captions. Use Chrome, Edge or Safari
            to caption your own voice. You can still read other people&apos;s captions.
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            active
              ? onChange({ show: false, speak: false })
              : onChange({ show: true, speak: supported })
          }
        >
          {active ? 'Turn off captions' : 'Turn on captions'}
        </button>

        <label className="cc-toggle">
          <input
            type="checkbox"
            checked={settings.show}
            onChange={(e) => onChange({ show: e.target.checked })}
          />
          Show captions on the video
        </label>

        <label className={`cc-toggle ${supported ? '' : 'disabled'}`}>
          <input
            type="checkbox"
            checked={settings.speak}
            disabled={!supported}
            onChange={(e) => onChange({ speak: e.target.checked })}
          />
          Caption my voice
        </label>

        {settings.speak && !micOn && (
          <p className="cc-hint">
            Your microphone is off, so your voice is not being captioned right now.
          </p>
        )}

        <label className="cc-label" htmlFor="cc-language">
          Language I speak
        </label>
        <select
          id="cc-language"
          className="cc-select"
          value={settings.language}
          onChange={(e) => onChange({ language: e.target.value })}
        >
          {CAPTION_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>

        {listening && <div className="cc-listening">● Listening to your voice</div>}
        {error && <div className="cc-error">{error}</div>}

        <p className="cc-privacy">
          Captions are created by your browser&apos;s speech service, which may send your
          voice to the browser maker (Google for Chrome). Only the resulting text is shared
          with this meeting.
        </p>

        <div className="polls-section-title">Transcript</div>
        <ul className="cc-transcript">
          {transcript.length === 0 && (
            <li className="cc-empty">
              Finished sentences will appear here for everyone in the meeting.
            </li>
          )}

          {transcript.map((line) => (
            <li key={line.id} className="cc-entry">
              <div className="cc-entry-meta">
                <strong>{line.name}</strong>
                {formatTime(line.time)}
              </div>
              {line.text}
            </li>
          ))}
          <li ref={endRef} />
        </ul>
      </div>

      <div className="notes-footer">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleDownload}
          disabled={transcript.length === 0}
        >
          <Download size={18} />
          Download transcript
        </button>
      </div>
    </aside>
  );
}

export default CaptionsPanel;