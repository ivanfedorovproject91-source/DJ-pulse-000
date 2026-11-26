import { useMemo, useState } from 'react';
import { ReleaseRow } from '../components/Rows';
import { Empty, Seg } from '../components/ui';
import { useI18n } from '../services/i18n';
import { daysBetween } from '../services/format';
import { usePrefs } from '../services/prefs';
import type { AppData } from '../types';

type Period = '7' | '30' | '90';
const MINE = '__mine';

/** Свежие релизы из MusicBrainz: по жанру или по «моим жанрам», с лейблом. */
export default function Releases({ data }: { data: AppData }) {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const [period, setPeriod] = useState<Period>('30');
  const [genre, setGenre] = useState(prefs.favGenres.length ? MINE : '');
  const gname = useMemo(() => new Map(data.genres.map((g) => [g.id, g.name])), [data.genres]);
  const today = data.meta.data_date;

  const list = useMemo(() => data.releases.filter((r) => {
    if (genre === MINE ? !prefs.favGenres.includes(r.genre) : genre && r.genre !== genre) return false;
    const age = daysBetween(r.date, today);
    return age >= 0 && age <= Number(period);
  }).sort((a, b) => (a.date < b.date ? 1 : -1)), [data.releases, genre, period, today, prefs.favGenres]);

  return (
    <>
      <h1 className="page-title">{t('nav.releases')}</h1>
      <Seg<Period> value={period} onChange={setPeriod}
        options={[{ id: '7', label: t('chart.period.7') }, { id: '30', label: t('chart.period.30') }, { id: '90', label: t('chart.period.90') }]} />
      <div className="filters">
        <label className="full">
          <span className="field-label">{t('filter.genre')}</span>
          <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">{t('all')}</option>
            {(prefs.favGenres.length > 0 || genre === MINE) && <option value={MINE}>★ {t('digest.mine')}</option>}
            {data.genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      </div>
      <p className="note" style={{ marginBottom: 12 }}>{t('releases.note')} ({list.length})</p>
      <div className="panel">
        {list.length ? list.slice(0, 100).map((r) => <ReleaseRow key={r.mbid} r={r} genreName={gname.get(r.genre)} />)
          : <Empty>{t('releases.none')}</Empty>}
      </div>
    </>
  );
}
