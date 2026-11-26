export type Point = [string, number];
export type Status = 'rising' | 'stable' | 'declining' | 'emerging' | 'insufficient';

export interface Meta {
  schema: number;
  generated_at: string;
  data_date: string;
  status: 'ok' | 'partial' | 'failed';
  demo: boolean;
  errors: string[];
  /** Информационные пометки (не сбои): например, у жанра нет отдельной статьи. */
  notes?: string[];
  counts: Record<string, number>;
  history_days_max: number;
}

export interface SourceInfo {
  status: 'ok' | 'error' | 'disabled';
  last_success?: string;
  last_attempt?: string;
  message?: string | null;
  name?: string;
}

export interface Genre {
  id: string;
  name: string;
  family?: string;
  summary?: string | null;
  score: number | null;
  level: number | null;
  changes: { d7: number | null; d30: number | null; d90: number | null; y1: number | null };
  status: Status;
  history_days: number;
  signals: { lastfm_growth_30d: number | null; lastfm_reach: number | null };
  history: { wiki: Point[]; lf_reach: Point[] };
  wiki_article: string | null;
  sources: string[];
  as_of: string | null;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  cover: string | null;
  url: string | null;
  preview: string | null;
  deezer_id?: string | number | null;
  source: 'lastfm';
  genre: string;
  /** Порядок в топе тега Last.fm за всё время (не позиция в чарте). */
  rank: number;
  as_of: string;
}

export interface Release {
  mbid: string;
  title: string;
  artist: string;
  date: string;
  type: string | null;
  url: string;
  genre: string;
  label?: { id: string; name: string } | null;
}

export interface LabelItem {
  id: string;
  name: string;
  url: string;
  n_releases: number;
  artists: string[];
  genres: { genre: string; name: string; count: number }[];
  releases: { title: string; artist: string; date: string; url: string }[];
}

export interface EventItem {
  id: string;
  name: string;
  date: string;
  url: string;
  venue: string | null;
  city: string | null;
  country: string | null;
  genre: string | null;
  subgenre: string | null;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
}

export interface Evidence {
  label: string;
  value: string;
}

export interface Insight {
  id: string;
  type: string;
  genre?: string;
  title: string;
  body: string;
  period_days: number;
  sources: string[];
  evidence: Evidence[];
}

export interface WeeklyTrend {
  genre: string;
  name: string;
  d7: number;
  d30: number | null;
  score: number | null;
  sources: string[];
  text: string;
}

export interface Digest {
  generated_at: string;
  data_date: string;
  status: string;
  sections: Record<string, string>;
  genre_brief?: Record<string, { name: string; d7: number | null; d30: number | null; status: Status; score: number | null }>;
  status_changes?: { date: string; genre: string; name: string; from: Status; to: Status }[];
  footer: string;
  order: string[];
}

export interface AppData {
  meta: Meta;
  genres: Genre[];
  tracks: Track[];
  releases: Release[];
  news: NewsItem[];
  labels: LabelItem[];
  events: EventItem[];
  insights: { weekly_trend: WeeklyTrend | null; items: Insight[] };
  sources: Record<string, SourceInfo>;
  digest: Digest | null;
  /** Какие файлы не удалось загрузить (остальные работают). */
  missing: string[];
}
