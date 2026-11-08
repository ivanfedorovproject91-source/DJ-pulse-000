import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../types';
import { openLink } from '../services/telegram';

/** Один общий <audio> на все превью: на мобильных WebView новый Audio() на каждый клик часто блокируется. */
export function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const el = () => {
    if (!ref.current) {
      const a = new Audio();
      a.preload = 'none';
      a.setAttribute('playsinline', '');
      a.onended = () => setPlaying(null);
      ref.current = a;
    }
    return ref.current;
  };

  useEffect(() => () => { ref.current?.pause(); ref.current = null; }, []);

  const toggle = useCallback((t: Track) => {
    if (!t.preview) return;
    const a = el();
    if (playing === t.id) { a.pause(); setPlaying(null); return; }
    setError(null);
    a.pause();
    a.onerror = () => {
      setPlaying(null);
      setError(`media-error ${a.error?.code ?? ''}`.trim());
      if (t.url) openLink(t.url); // превью недоступно на этом устройстве — открываем трек на сайте
    };
    a.src = t.preview;
    setPlaying(t.id);
    a.play().catch((e: unknown) => {
      setPlaying(null);
      setError(e instanceof Error ? e.name : 'play-failed');
      if (t.url) openLink(t.url);
    });
  }, [playing]);

  return { playing, toggle, error };
}
