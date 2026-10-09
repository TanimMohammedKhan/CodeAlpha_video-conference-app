import { useCallback, useEffect, useRef, useState } from 'react';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const MAX_SECONDS = 60 * 60;
const PADDING = 16;
const GAP = 12;
const MIN_FILE_BYTES = 2048;

// MP4 (H.264) plays in every default player, so it is tried first.
// WebM is only the fallback for browsers that cannot record MP4.
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1.640028,opus',
  'video/mp4;codecs=avc1.42E01E,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function isSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    Boolean(window.AudioContext || window.webkitAudioContext)
  );
}

function pickMimeType() {
  const found = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
  return found || '';
}

function getInitials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fill the box with the video, cropping the edges if needed
function drawCover(ctx, video, x, y, w, h) {
  const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (video.videoWidth - sw) / 2;
  const sy = (video.videoHeight - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
}

// Fit the whole video inside the box without cropping
function drawContain(ctx, video, x, y, w, h) {
  const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawLabel(ctx, text, x, y, w, h, micOff) {
  const fontSize = Math.max(12, Math.min(20, Math.round(h * 0.055)));
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const textWidth = ctx.measureText(text).width;
  const dotSpace = micOff ? fontSize : 0;
  const boxW = Math.min(w - 16, textWidth + dotSpace + 22);
  const boxH = fontSize + 12;
  const boxX = x + 10;
  const boxY = y + h - 10 - boxH;

  ctx.fillStyle = 'rgba(10, 7, 20, 0.72)';
  roundedRectPath(ctx, boxX, boxY, boxW, boxH, 8);
  ctx.fill();

  if (micOff) {
    ctx.fillStyle = '#e5484d';
    ctx.beginPath();
    ctx.arc(boxX + 12, boxY + boxH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, boxX + 11 + dotSpace, boxY + boxH / 2 + 1, boxW - dotSpace - 20);
}

function drawTile(ctx, tile, x, y, w, h, videos) {
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 18);
  ctx.clip();

  const background = ctx.createLinearGradient(x, y, x + w, y + h);
  background.addColorStop(0, '#271e44');
  background.addColorStop(1, '#171127');
  ctx.fillStyle = background;
  ctx.fillRect(x, y, w, h);

  const video = tile.stream ? videos.get(tile.stream.id) : null;
  const hasVideo =
    tile.camOn && video && video.readyState >= 2 && video.videoWidth > 0;

  if (hasVideo) {
    drawCover(ctx, video, x, y, w, h);
  } else {
    const radius = Math.min(w, h) * 0.2;
    const cx = x + w / 2;
    const cy = y + h / 2 - 6;
    const avatar = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    avatar.addColorStop(0, '#8366f0');
    avatar.addColorStop(1, '#5b3fd1');
    ctx.fillStyle = avatar;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(radius * 0.8)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(tile.name), cx, cy + 2);
  }

  drawLabel(ctx, tile.name, x, y, w, h, !tile.micOn);
  ctx.restore();
}

function drawScreen(ctx, screen, x, y, w, h, videos) {
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 14);
  ctx.clip();
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, w, h);

  const video = screen.stream ? videos.get(screen.stream.id) : null;
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    drawContain(ctx, video, x, y, w, h);
  }

  drawLabel(ctx, screen.label, x, y, w, h, false);
  ctx.restore();
}

function drawFrame(ctx, layout, videos) {
  ctx.fillStyle = '#120d22';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const tiles = layout.tiles;
  const count = tiles.length;

  if (layout.screen) {
    // A shared screen on top and the people in a row below it
    const stripHeight = count > 0 ? 150 : 0;
    const screenHeight = HEIGHT - PADDING * 2 - (count > 0 ? stripHeight + GAP : 0);
    drawScreen(ctx, layout.screen, PADDING, PADDING, WIDTH - PADDING * 2, screenHeight, videos);

    if (count > 0) {
      const tileWidth = Math.min(240, (WIDTH - PADDING * 2 - (count - 1) * GAP) / count);
      const total = count * tileWidth + (count - 1) * GAP;
      const startX = (WIDTH - total) / 2;
      const stripY = HEIGHT - PADDING - stripHeight;

      tiles.forEach((tile, index) => {
        drawTile(ctx, tile, startX + index * (tileWidth + GAP), stripY, tileWidth, stripHeight, videos);
      });
    }
    return;
  }

  if (count === 0) return;

  // A grid of people
  const columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / columns);
  const tileWidth = (WIDTH - PADDING * 2 - (columns - 1) * GAP) / columns;
  const tileHeight = (HEIGHT - PADDING * 2 - (rows - 1) * GAP) / rows;

  tiles.forEach((tile, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const inThisRow = row === rows - 1 ? count - row * columns : columns;
    // Center the last row when it has fewer people
    const offset = ((columns - inThisRow) * (tileWidth + GAP)) / 2;

    drawTile(
      ctx,
      tile,
      PADDING + offset + column * (tileWidth + GAP),
      PADDING + row * (tileHeight + GAP),
      tileWidth,
      tileHeight,
      videos
    );
  });
}

// Keep one hidden video element for every stream that is on screen
function syncVideos(session, layout) {
  const needed = new Map();
  layout.tiles.forEach((tile) => {
    if (tile.stream) needed.set(tile.stream.id, tile.stream);
  });
  if (layout.screen && layout.screen.stream) {
    needed.set(layout.screen.stream.id, layout.screen.stream);
  }

  needed.forEach((stream, id) => {
    if (session.videos.has(id)) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    video.play().catch(() => {});
    session.videos.set(id, video);
  });

  session.videos.forEach((video, id) => {
    if (!needed.has(id)) {
      video.pause();
      video.srcObject = null;
      session.videos.delete(id);
    }
  });
}

// Mix the sound of everyone who is in the meeting right now
function syncAudio(session, layout) {
  const wanted = new Map();
  layout.audio.forEach((stream) => {
    stream.getAudioTracks().forEach((track) => {
      if (track.readyState === 'live') wanted.set(track.id, track);
    });
  });

  wanted.forEach((track, id) => {
    if (session.audioSources.has(id)) return;
    const source = session.audioCtx.createMediaStreamSource(new MediaStream([track]));
    source.connect(session.destination);
    session.audioSources.set(id, source);
  });

  session.audioSources.forEach((source, id) => {
    if (!wanted.has(id)) {
      source.disconnect();
      session.audioSources.delete(id);
    }
  });
}

function makeFileName(title, mimeType) {
  const slug =
    String(title || 'meeting')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'meeting';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  return `${slug}-recording-${stamp}.${extension}`;
}

function teardown(session) {
  clearInterval(session.drawTimer);
  clearInterval(session.syncTimer);
  clearInterval(session.clockTimer);

  session.audioSources.forEach((source) => source.disconnect());
  session.audioSources.clear();

  session.videos.forEach((video) => {
    video.pause();
    video.srcObject = null;
  });
  session.videos.clear();

  session.outputStream.getTracks().forEach((track) => track.stop());
  session.audioCtx.close().catch(() => {});
}

export function useRecorder({ onStopped } = {}) {
  const [supported] = useState(isSupported);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const sessionRef = useRef(null);
  const mountedRef = useRef(true);
  const onStoppedRef = useRef(onStopped);

  useEffect(() => {
    onStoppedRef.current = onStopped;
  });

  // Stop the recorder. The file is saved to the computer when it has stopped.
  const stop = useCallback((reason = 'user') => {
    const session = sessionRef.current;
    if (!session || session.stopping) return;

    session.stopping = true;
    session.stopReason = reason;

    if (session.recorder.state !== 'inactive') {
      session.recorder.stop();
    }
  }, []);

  const start = useCallback(
    (getLayout, title) => {
      if (!supported || sessionRef.current) return false;
      setError('');

      try {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d');

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        const destination = audioCtx.createMediaStreamDestination();

        const videoStream = canvas.captureStream(FPS);
        const outputStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...destination.stream.getAudioTracks(),
        ]);

        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(outputStream, {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: 1800000,
          audioBitsPerSecond: 128000,
        });

        const session = {
          canvas,
          ctx,
          audioCtx,
          destination,
          outputStream,
          recorder,
          // The type the browser really chose (for example "video/mp4;codecs=avc1...")
          mimeType: recorder.mimeType || mimeType || 'video/webm',
          title,
          chunks: [],
          videos: new Map(),
          audioSources: new Map(),
          startedAt: Date.now(),
          stopping: false,
          stopReason: 'user',
          drawTimer: null,
          syncTimer: null,
          clockTimer: null,
        };

        const currentLayout = () =>
          getLayout() || { screen: null, tiles: [], audio: [] };

        const draw = () => {
          const layout = currentLayout();
          syncVideos(session, layout);
          drawFrame(ctx, layout, session.videos);
        };

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) session.chunks.push(event.data);
        };

        recorder.onerror = () => {
          if (mountedRef.current) setError('The recording hit an error and was stopped.');
          stop('error');
        };

        recorder.onstop = () => {
          const baseType = session.mimeType.split(';')[0] || 'video/webm';
          const blob = new Blob(session.chunks, { type: baseType });
          teardown(session);
          sessionRef.current = null;

          let reason = session.stopReason;

          if (blob.size >= MIN_FILE_BYTES) {
            const fileName = makeFileName(session.title, session.mimeType);
            console.info(
              `Recording saved: ${fileName}, ${(blob.size / (1024 * 1024)).toFixed(1)} MB, ${session.mimeType}`
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } else {
            // Nothing useful was recorded, so do not save a broken file
            reason = 'error';
            if (mountedRef.current) {
              setError('The recording came out empty, so no file was saved. Please try again.');
            }
          }

          if (mountedRef.current) {
            setRecording(false);
            setSeconds(0);
            if (onStoppedRef.current) onStoppedRef.current(reason);
          }
        };

        sessionRef.current = session;

        draw();
        syncAudio(session, currentLayout());
        session.drawTimer = setInterval(draw, 1000 / FPS);
        session.syncTimer = setInterval(() => syncAudio(session, currentLayout()), 1000);
        session.clockTimer = setInterval(() => {
          const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
          setSeconds(elapsed);
          if (elapsed >= MAX_SECONDS) stop('limit');
        }, 1000);

        recorder.start(1000);
        setRecording(true);
        setSeconds(0);
        return true;
      } catch (err) {
        console.error('Could not start recording:', err);
        const session = sessionRef.current;
        if (session) {
          teardown(session);
          sessionRef.current = null;
        }
        setError('Could not start recording in this browser.');
        return false;
      }
    },
    [supported, stop]
  );

  // Warn before the tab is closed while a recording is running
  useEffect(() => {
    if (!recording) return undefined;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [recording]);

  // If the page is closed or left, save what has been recorded so far
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      const session = sessionRef.current;
      if (session && !session.stopping) {
        session.stopping = true;
        session.stopReason = 'unmount';
        if (session.recorder.state !== 'inactive') session.recorder.stop();
      }
    };
  }, []);

  return { supported, recording, seconds, error, start, stop };
}