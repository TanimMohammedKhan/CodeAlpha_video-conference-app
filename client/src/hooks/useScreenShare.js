import { useCallback, useEffect, useRef, useState } from 'react';

export function useScreenShare() {
  const [screenStream, setScreenStream] = useState(null);
  const [error, setError] = useState('');
  const streamRef = useRef(null);

  const supported = Boolean(
    navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia
  );

  const stop = useCallback(() => {
    const current = streamRef.current;
    if (current) {
      current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScreenStream(null);
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (streamRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;
      setScreenStream(stream);

      // The browser's own "Stop sharing" button ends the video track
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (streamRef.current === stream) stop();
      });
    } catch (err) {
      // Closing the picker without choosing anything is not an error
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        setError('Could not start screen sharing.');
      }
    }
  }, [stop]);

  // Stop sharing when leaving the meeting
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return { screenStream, supported, error, start, stop };
}