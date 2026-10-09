import { useEffect, useRef, useState } from 'react';

export const CAPTION_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'bn-BD', label: 'Bengali (Bangladesh)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ur-PK', label: 'Urdu' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'ja-JP', label: 'Japanese' },
];

// Pick the language that matches the browser's own language, if we support it
export function defaultCaptionLanguage() {
  const preferred = (navigator.language || 'en-US').toLowerCase();

  const exact = CAPTION_LANGUAGES.find((item) => item.code.toLowerCase() === preferred);
  if (exact) return exact.code;

  const base = preferred.split('-')[0];
  const similar = CAPTION_LANGUAGES.find((item) =>
    item.code.toLowerCase().startsWith(`${base}-`)
  );
  return similar ? similar.code : 'en-US';
}

function getRecognitionClass() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// Turns your own voice into text with the browser's speech recognition.
// onResult(text, isFinal) is called for each piece of speech.
export function useSpeechRecognition({ active, language, onResult }) {
  const [supported] = useState(() => Boolean(getRecognitionClass()));
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    const Recognition = getRecognitionClass();
    if (!active || !Recognition) return undefined;

    let stopped = false;
    let restartDelay = 300;
    let restartTimer = null;
    let lastInterim = 0;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = language;

    recognition.onstart = () => {
      restartDelay = 300;
      setListening(true);
      setError('');
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;

        if (result.isFinal) {
          onResultRef.current(text, true);
        } else {
          // Do not flood the meeting with every tiny change
          const now = Date.now();
          if (now - lastInterim >= 300) {
            lastInterim = now;
            onResultRef.current(text, false);
          }
        }
      }
    };

    recognition.onerror = (event) => {
      switch (event.error) {
        case 'no-speech':
        case 'aborted':
          break;
        case 'not-allowed':
        case 'service-not-allowed':
          stopped = true;
          setError(
            'Microphone or speech service access is blocked. Allow the microphone in your browser address bar.'
          );
          break;
        case 'audio-capture':
          stopped = true;
          setError('No microphone was found, so your voice cannot be captioned.');
          break;
        case 'language-not-supported':
          stopped = true;
          setError('Your browser does not support captions in this language.');
          break;
        case 'network':
          restartDelay = 3000;
          setError(
            'Captions need an internet connection to your browser\'s speech service. Retrying...'
          );
          break;
        default:
          restartDelay = 2000;
          break;
      }
    };

    // The browser stops listening now and then, so start again
    recognition.onend = () => {
      setListening(false);
      if (stopped) return;

      restartTimer = setTimeout(() => {
        if (stopped) return;
        try {
          recognition.start();
        } catch (err) {
          console.error('Could not restart captions:', err);
        }
      }, restartDelay);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Could not start captions:', err);
    }

    return () => {
      stopped = true;
      clearTimeout(restartTimer);
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch (err) {
        console.error('Could not stop captions:', err);
      }
      setListening(false);
      setError('');
    };
  }, [active, language]);

  return { supported, listening, error };
}