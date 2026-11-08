import { describe, expect, it } from 'vitest';
import { weeklyChanges } from '../heatmap';

const days = (n: number, f: (i: number) => number): [string, number][] =>
  Array.from({ length: n }, (_, i) => [new Date(Date.UTC(2026, 5, 30) - (n - 1 - i) * 86400000).toISOString().slice(0, 10), f(i)]);

describe('weeklyChanges', () => {
  it('считает изменение недели к предыдущей', () => {
    const pts = days(28, (i) => (i < 21 ? 100 : 150));    // последняя неделя на 50% выше
    const c = weeklyChanges(pts, '2026-06-30', 3);
    expect(c[2]).toBeCloseTo(50);
    expect(c[1]).toBeCloseTo(0);
  });
  it('нет данных — null, а не 0', () => {
    const c = weeklyChanges(days(10, () => 100), '2026-06-30', 4);
    expect(c[0]).toBeNull();
    expect(c[3]).toBeNull();                              // для последней недели нет предыдущей полной
  });
});
