import type { AppData } from '../types';

export type Hit = { kind: 'genre' | 'artist' | 'track' | 'label'; id: string; title: string; sub: string; url?: string | null };

const fold = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Находит жанры, артистов, треки и лейблы: все слова запроса должны входить в название. Начало названия — выше. */
export function searchAll(data: AppData, query: string, perKind = 5): Hit[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const words = q.split(' ');
  const rank = (name: string): number => {
    const n = fold(name);
    if (!words.every((w) => n.includes(w))) return -1;
    return n.startsWith(q) ? 2 : n.split(' ').some((w) => w.startsWith(words[0])) ? 1 : 0;
  };
  const pick = <T,>(items: T[], name: (x: T) => string, mk: (x: T) => Hit): Hit[] =>
    items.map((x) => ({ x, r: rank(name(x)) })).filter((e) => e.r >= 0)
      .sort((a, b) => b.r - a.r).slice(0, perKind).map((e) => mk(e.x));
  return [
    ...pick(data.genres, (g) => g.name, (g) => ({ kind: 'genre', id: g.id, title: g.name, sub: g.family ?? '' })),
    ...pick(data.artists, (a) => a.name, (a) => ({ kind: 'artist', id: a.id, title: a.name, sub: a.country ?? '' })),
    ...pick(data.labels, (l) => l.name, (l) => ({ kind: 'label', id: l.id, title: l.name, sub: String(l.n_releases) })),
    ...pick(data.tracks, (t) => `${t.artist} ${t.title}`, (t) => ({ kind: 'track', id: t.id, title: t.title, sub: t.artist, url: t.url })),
  ];
}
