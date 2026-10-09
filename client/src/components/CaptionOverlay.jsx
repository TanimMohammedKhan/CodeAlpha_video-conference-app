import { useEffect, useState } from 'react';
import '../captions.css';

const SHOW_MS = 7000;
const MAX_LINES = 3;

function CaptionOverlay({ live, currentUserId }) {
  const [now, setNow] = useState(() => Date.now());

  // Old captions fade away after a few seconds
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const lines = Object.values(live)
    .filter((line) => now - line.time < SHOW_MS)
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_LINES);

  if (lines.length === 0) return null;

  return (
    <div className="caption-overlay" aria-live="polite">
      {lines.map((line) => (
        <div
          key={line.userId}
          className={`caption-line ${line.final ? '' : 'interim'}`}
        >
          <span className="caption-name">
            {line.userId === currentUserId ? 'You' : line.name}
          </span>
          {line.text}
        </div>
      ))}
    </div>
  );
}

export default CaptionOverlay;