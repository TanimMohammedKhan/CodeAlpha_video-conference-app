import { useCallback, useEffect, useState } from 'react';

function describeError(err) {
  if (err.name === 'NotAllowedError') {
    return 'Camera and microphone access is blocked. Allow access from your browser address bar to use them.';
  }
  if (err.name === 'NotFoundError') {
    return 'No camera or microphone was found on this device. You can still join to watch and listen.';
  }
  if (err.name === 'NotReadableError') {
    return 'Your camera or microphone is being used by another app.';
  }
  return 'Could not access your camera or microphone.';
}

// Try camera + microphone first, then fall back to whatever is available
async function getBestStream() {
  const attempts = [
    { video: true, audio: true },
    { video: false, audio: true },
    { video: true, audio: false },
  ];

  let lastError = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      // If the user blocked access, retrying would only ask them again
      if (err.name === 'NotAllowedError') break;
    }
  }
  throw lastError;
}

export function useLocalMedia() {
  const [stream, setStream] = useState(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let localStream = null;

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support camera and microphone access.');
        return;
      }

      try {
        const media = await getBestStream();

        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }

        localStream = media;
        setStream(media);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    }

    start();

    return () => {
      cancelled = true;
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const hasMic = Boolean(stream && stream.getAudioTracks().length > 0);
  const hasCam = Boolean(stream && stream.getVideoTracks().length > 0);

  let notice = '';
  if (stream && !hasCam && hasMic) {
    notice = 'No camera detected. You can still join and use your microphone.';
  } else if (stream && hasCam && !hasMic) {
    notice = 'No microphone detected. You can still join with your camera.';
  }

  const toggleMic = useCallback(() => {
    if (!stream) return;
    const next = !micEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicEnabled(next);
  }, [stream, micEnabled]);

  const toggleCam = useCallback(() => {
    if (!stream) return;
    const next = !camEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCamEnabled(next);
  }, [stream, camEnabled]);

  return {
    stream,
    hasMic,
    hasCam,
    micOn: hasMic && micEnabled,
    camOn: hasCam && camEnabled,
    error,
    notice,
    toggleMic,
    toggleCam,
  };
}