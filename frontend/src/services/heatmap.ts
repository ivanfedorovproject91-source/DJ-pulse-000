import type { Genre, Point } from '../types';

const DAY = 86400000;
const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

/**
 * Недельные изменения интереса: для каждой из `weeks` последних недель — % к предыдущей неделе
 * (среднее суточных просмотров). Неделя без достаточного числа точек даёт null — «нет данных», а не 0.
 * Колонки идут от старой к новой; `end` — последний день окна (дата актуальности данных).
 */
export function weeklyChanges(points: Point[], end: string, weeks = 8): (number | null)[] {
  const endT = ts(end);
  const byDay = new Map(points.map(([d, v]) => [ts(d), v]));
  const mean = (w: number): number | null => {          // w=0 — последняя неделя
    let sum = 0, n = 0;
    for (let i = 0; i < 7; i++) {
      const v = byDay.get(endT - (w * 7 + i) * DAY);
      if (v != null) { sum += v; n++; }
    }
    return n >= 5 ? sum / n : null;
  };
  const out: (number | null)[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const cur = mean(w), prev = mean(w + 1);
    out.push(cur != null && prev != null && prev > 0 ? ((cur - prev) / prev) * 100 : null);
  }
  return out;
}

export interface HeatRow { genre: Genre; cells: (number | null)[] }

export function buildHeatmap(genres: Genre[], end: string, weeks = 8): HeatRow[] {
  return genres
    .filter((g) => g.history.wiki.length >= 14)
    .map((g) => ({ genre: g, cells: weeklyChanges(g.history.wiki, end, weeks) }))
    .filter((r) => r.cells.some((c) => c != null));
}
