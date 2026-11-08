import { describe, expect, it } from 'vitest';
import { searchAll } from '../search';
import type { AppData } from '../../types';

const data = {
  genres: [{ id: 'deep-house', name: 'Deep House', family: 'house' }, { id: 'house', name: 'House' }, { id: 'techno', name: 'Techno' }],
  artists: [{ id: 'a1', name: 'Ёлка Beat', country: 'RU' }, { id: 'a2', name: 'Deep Sea', country: 'US' }],
  labels: [{ id: 'l1', name: 'Deep Records', n_releases: 3 }],
  tracks: [{ id: 't1', title: 'Night Drive', artist: 'Deep Sea', url: 'https://x' }],
} as unknown as AppData;

describe('searchAll', () => {
  it('ищет по всем разделам и ранжирует начало названия выше', () => {
    const r = searchAll(data, 'deep');
    expect(r.map((x) => x.kind)).toEqual(['genre', 'artist', 'label', 'track']);
    const g = searchAll(data, 'house');
    expect(g[0].id).toBe('house');
  });
  it('все слова запроса обязательны; ё = е; короткий запрос — пусто', () => {
    expect(searchAll(data, 'deep records').map((x) => x.id)).toEqual(['l1']);
    expect(searchAll(data, 'елка')[0].id).toBe('a1');
    expect(searchAll(data, 'd')).toEqual([]);
    expect(searchAll(data, 'nothing here')).toEqual([]);
  });
});
