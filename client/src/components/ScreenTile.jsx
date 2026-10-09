import { useEffect, useRef } from 'react';
import { Maximize, Minimize, MonitorUp } from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';

function ScreenTile({ stream, label, muted = false }) {
  const tileRef = useRef(null);
  const videoRef = useRef(null);
  const { isFullscreen, supported, toggle } = useFullscreen(tileRef);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <div
      ref={tileRef}
      className="tile screen"
      onDoubleClick={supported ? toggle : undefined}
    >
      <video ref={videoRef} autoPlay playsInline muted={muted} />

      {supported && (
        <button
          type="button"
          className="tile-fullscreen-btn"
          onClick={toggle}
          aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
          title={isFullscreen ? 'Exit full screen' : 'Full screen'}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      )}

      <div className="tile-label">
        <MonitorUp size={14} />
        <span>{label}</span>
      </div>
    </div>
  );
}

export default ScreenTile;