import { useCallback, useEffect, useState } from 'react';

export function useFullscreen(elementRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const supported = Boolean(document.fullscreenEnabled);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === elementRef.current);
    };

    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [elementRef]);

  const toggle = useCallback(async () => {
    const element = elementRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch (err) {
      console.error('Full screen failed:', err);
    }
  }, [elementRef]);

  return { isFullscreen, supported, toggle };
}