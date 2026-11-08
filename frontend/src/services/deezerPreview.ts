import type { Track } from '../types';

/**
 * Ссылки на 30-секундные превью Deezer живут считанные минуты (подписанный токен), поэтому
 * заранее сохранять их нельзя. Берём свежую ссылку в момент нажатия: Deezer отдаёт JSONP без CORS.
 */
let seq = 0;
function jsonp<T>(url: string, timeoutMs = 9000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__dz${Date.now().toString(36)}${seq++}`;
    const w = window as unknown as Record<string, unknown>;
    const s = document.createElement('script');
    const done = () => { clearTimeout(timer); delete w[cb]; s.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, timeoutMs);
    w[cb] = (d: T) => { done(); resolve(d); };
    s.onerror = () => { done(); reject(new Error('network')); };
    s.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    document.head.appendChild(s);
  });
}

interface DzTrack { id?: number; preview?: string; title?: string; artist?: { name?: string } }

const mem = new Map<string, { url: string; at: number }>();
const FRESH_MS = 4 * 60 * 1000;

export function deezerIdOf(t: Track): string | null {
  const m = t.url ? /deezer\.com\/(?:\w+\/)?track\/(\d+)/.exec(t.url) : null;
  return m ? m[1] : null;
}

/** Свежая ссылка на превью или null, если Deezer такого трека не нашёл. Бросает ошибку при недоступности сети. */
export async function freshPreview(t: Track): Promise<string | null> {
  const hit = mem.get(t.id);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.url;
  let url: string | undefined;
  const id = t.deezer_id ? String(t.deezer_id) : deezerIdOf(t);
  if (id) {
    url = (await jsonp<DzTrack>(`https://api.deezer.com/track/${id}`)).preview;
  } else {
    const q = encodeURIComponent(`artist:"${t.artist.replace(/"/g, '')}" track:"${t.title.replace(/"/g, '')}"`);
    const r = await jsonp<{ data?: DzTrack[] }>(`https://api.deezer.com/search?q=${q}&limit=1`);
    url = r.data?.[0]?.preview;
  }
  if (!url) return null;
  mem.set(t.id, { url, at: Date.now() });
  return url;
}
