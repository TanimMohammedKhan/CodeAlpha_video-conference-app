import { useEffect, useState } from 'react';

// 90000 milliseconds -> "01:30"
export function formatClock(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Milliseconds left on the shared timer. The server sends the exact moment the
// timer ends, and clockOffset corrects for any difference between this
// computer's clock and the server's clock.
export function useCountdown(timer, clockOffset) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer || timer.status !== 'running') return undefined;

    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [timer]);

  if (!timer) return 0;
  if (timer.status === 'running') {
    return Math.max(0, timer.endsAt - (now + clockOffset));
  }
  return timer.remainingMs;
}