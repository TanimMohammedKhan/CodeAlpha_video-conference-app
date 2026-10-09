import { useEffect, useRef } from 'react';
import { Maximize, MicOff, Minimize } from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function VideoTile({
  stream,
  name,
  muted = false,
  micOn = true,
  camOn = true,
  isSelf = false,
  handRaised = false,
}) {
  const tileRef = useRef(null);
  const videoRef = useRef(null);
  const { isFullscreen, supported, toggle } = useFullscreen(tileRef);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  const showVideo = Boolean(stream) && camOn;
  const canFullscreen = supported && (showVideo || isFullscreen);

  return (
    <div
      ref={tileRef}
      className={`tile ${isSelf ? 'self' : ''}`}
      onDoubleClick={canFullscreen ? toggle : undefined}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={showVideo ? '' : 'hidden'}
      />

      {!showVideo && <div className="tile-avatar">{getInitials(name)}</div>}

      {handRaised && (
        <span className="tile-hand" title="Hand raised">
          ✋
        </span>
      )}

      {canFullscreen && (
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
        {!micOn && <MicOff size={14} />}
        <span>
          {name}
          {isSelf ? ' (You)' : ''}
        </span>
      </div>
    </div>
  );
}

export default VideoTile;