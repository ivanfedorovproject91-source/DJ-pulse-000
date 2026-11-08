import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Track } from '../types';

/** Ошибка последнего неудавшегося превью — показывается под самим треком, без перехода на сайт. */
let errState: { id: string; msg: string } | null = null;
const subs = new Set<() => void>();
const setErr = (e: { id: string; msg: string } | null) => { errState = e; subs.forEach((f) => f()); };
export function useAudioError(id: string): string | null {
  const cur = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => errState, () => null);
  return cur && cur.id === id ? cur.msg : null;
}

const explain = (code: string) => `Превью не загрузилось на этом устройстве (${code}). Чаще всего это блокировка сети — попробуйте VPN или откройте трек кнопкой справа.`;

/** Один общий <audio> на все превью: на мобильных WebView новый Audio() на каждый клик часто блокируется. */
export function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

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
    setErr(null);
    a.pause();
    a.onerror = () => { setPlaying(null); setErr({ id: t.id, msg: explain(`код ${a.error?.code ?? '?'}`) }); };
    a.src = t.preview;
    setPlaying(t.id);
    a.play().catch((e: unknown) => {
      setPlaying(null);
      const name = e instanceof Error ? e.name : 'ошибка';
      setErr({ id: t.id, msg: explain(name) });
    });
  }, [playing]);

  return { playing, toggle };
}
