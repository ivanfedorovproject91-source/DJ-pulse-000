import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { freshPreview } from '../services/deezerPreview';
import type { Track } from '../types';

/** Ошибка последнего неудавшегося превью — показывается под самим треком. */
let errState: { id: string; msg: string } | null = null;
const subs = new Set<() => void>();
const setErr = (e: { id: string; msg: string } | null) => { errState = e; subs.forEach((f) => f()); };
export function useAudioError(id: string): string | null {
  const cur = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => errState, () => null);
  return cur && cur.id === id ? cur.msg : null;
}

const MSG = {
  none: 'Для этого трека у Deezer нет 30-секундного превью. Откройте трек кнопкой справа.',
  net: 'Не удалось связаться с Deezer. Проверьте интернет или VPN и попробуйте ещё раз.',
  play: 'Не получилось запустить воспроизведение на этом устройстве. Откройте трек кнопкой справа.',
};

/** Один общий <audio> на все превью; ссылка на превью берётся свежая в момент нажатия. */
export function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const token = useRef(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

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

  useEffect(() => () => { token.current++; ref.current?.pause(); ref.current = null; }, []);

  const toggle = useCallback(async (t: Track) => {
    const a = el();
    if (playing === t.id || loading === t.id) { token.current++; a.pause(); setPlaying(null); setLoading(null); return; }
    const my = ++token.current;
    setErr(null);
    a.pause();
    setPlaying(null);
    setLoading(t.id);
    let url: string | null;
    try {
      url = await freshPreview(t);
    } catch {
      if (my === token.current) { setLoading(null); setErr({ id: t.id, msg: MSG.net }); }
      return;
    }
    if (my !== token.current) return;
    if (!url) { setLoading(null); setErr({ id: t.id, msg: MSG.none }); return; }
    a.onerror = () => { setPlaying(null); setLoading(null); setErr({ id: t.id, msg: MSG.play }); };
    a.src = url;
    try {
      await a.play();
      if (my === token.current) { setLoading(null); setPlaying(t.id); }
    } catch {
      if (my === token.current) { setLoading(null); setPlaying(null); setErr({ id: t.id, msg: MSG.play }); }
    }
  }, [playing, loading]);

  return { playing: playing ?? loading, toggle };
}
