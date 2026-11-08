import { useMemo, useState } from 'react';
import BarChart from '../charts/BarChart';
import Donut, { type Slice } from '../charts/Donut';
import LineChart from '../charts/LineChart';
import { SERIES } from '../charts/palette';
import { GenreRow } from '../components/Rows';
import Heatmap from '../charts/Heatmap';
import { Empty, SecHead, Seg, Sheet } from '../components/ui';
import { buildHeatmap } from '../services/heatmap';
import { haptic } from '../services/telegram';
import { useI18n, type Key } from '../services/i18n';
import { fmtPct } from '../services/format';
import { usePrefs } from '../services/prefs';
import type { AppData, Status } from '../types';

interface Props { data: AppData; go: (p: string) => void }
const STATUSES: (Status | 'all')[] = ['all', 'rising', 'emerging', 'stable', 'declining'];
const FAMILIES = ['house', 'techno', 'trance', 'bass', 'hard', 'disco', 'chill', 'global'];

export default function Genres({ data, go }: Props) {
  const { t } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [family, setFamily] = useState('all');
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [view, setView] = useState<'list' | 'heat'>('list');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  // picks хранит «слот» цвета: цвет закреплён за жанром и не перекрашивается при снятии соседа
  const [picks, setPicks] = useState<{ id: string; slot: number }[]>([]);

  const sorted = useMemo(() => [...data.genres].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)), [data.genres]);
  const needle = q.trim().toLowerCase();
  const list = sorted.filter((g) => (status === 'all' || g.status === status)
    && (family === 'all' || g.family === family)
    && (!onlyFav || prefs.favGenres.includes(g.id))
    && (!needle || g.name.toLowerCase().includes(needle)));
  const present = FAMILIES.filter((f) => data.genres.some((g) => g.family === f));
  const heat = useMemo(() => buildHeatmap(sorted.filter((g) => family === 'all' || g.family === family), data.meta.data_date), [sorted, family, data.meta.data_date]);

  const slices = useMemo<Slice[]>(() => {
    const withLevel = sorted.filter((g) => g.level != null);
    const top = withLevel.slice(0, 6);
    const rest = withLevel.slice(6).reduce((s, g) => s + (g.level as number), 0);
    const out: Slice[] = top.map((g) => ({ id: g.id, label: g.name, value: g.level as number }));
    if (rest > 0) out.push({ id: 'other', label: t('genres.other'), value: rest, isOther: true });
    return out;
  }, [sorted, t]);

  const bars = useMemo(() => {
    const withD = data.genres.filter((g) => g.changes.d30 != null).sort((a, b) => (b.changes.d30 as number) - (a.changes.d30 as number));
    const pick = withD.length > 10 ? [...withD.slice(0, 6), ...withD.slice(-4)] : withD;
    return pick.map((g) => ({ id: g.id, label: g.name, value: g.changes.d30 }));
  }, [data.genres]);

  const togglePick = (id: string) => {
    haptic();
    setPicks((cur) => {
      if (cur.some((p) => p.id === id)) return cur.filter((p) => p.id !== id);
      if (cur.length >= 6) return cur;
      const used = new Set(cur.map((p) => p.slot));
      const slot = SERIES.findIndex((_, i) => !used.has(i));
      return [...cur, { id, slot }];
    });
  };

  const cmpSeries = picks.map((p) => {
    const g = data.genres.find((x) => x.id === p.id)!;
    return { id: g.id, label: g.name, color: SERIES[p.slot], points: g.history.wiki };
  });

  return (
    <>
      <h1 className="page-title">{t('nav.genres')}</h1>

      <section className="sec">
        {compare && <SecHead title={t('genres.compare.on')} />}
        {!compare ? (
          <button className="btn ghost" onClick={() => { setCompare(true); haptic(); }}>{t('genres.compare')}</button>
        ) : (
          <div className="panel pad">
            <p className="note" style={{ marginBottom: 10 }}>{t('genres.compare.pick')}</p>
            <button className="btn ghost sm" onClick={() => setPickerOpen(true)}>{t('genres.pick.btn')} · {t('genres.pick.n')}: {picks.length}</button>
            <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible', margin: '8px 0 0', padding: 0 }}>
              {picks.map((p) => {
                const g = data.genres.find((x) => x.id === p.id)!;
                return <button key={p.id} className="chip on" onClick={() => togglePick(p.id)}><span className="sw" style={{ background: SERIES[p.slot], boxShadow: '0 0 0 2px #0e1011' }} />{g.name} ✕</button>;
              })}
            </div>
            {picks.length >= 2 ? <LineChart series={cmpSeries} defaultMode="pct" defaultPeriod={90} /> : null}
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => { setCompare(false); setPicks([]); }}>{t('genres.compare.done')}</button>
          </div>
        )}
      </section>

      <section className="sec">
        <SecHead title={t('genres.share')} />
        <div className="panel pad">
          {slices.length ? <Donut slices={slices} /> : <Empty>{t('status.insufficient.hint')}</Empty>}
          <p className="note" style={{ marginTop: 8 }}>{t('genres.share.note')}</p>
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('genres.bars')} />
        <div className="panel pad">
          {bars.length ? <BarChart items={bars} signed fmt={(v) => fmtPct(v, 0)} onSelect={(id) => go(`genres/${id}`)} /> : <Empty>{t('status.insufficient.hint')}</Empty>}
        </div>
      </section>

      <section className="sec">
        <Seg value={view} options={[{ id: 'list', label: t('genres.view.list') }, { id: 'heat', label: t('genres.view.heat') }]} onChange={setView} />
      </section>

      <section className="sec">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('genres.search')} aria-label={t('genres.search')} />
        <div className="chips" style={{ marginTop: 10 }}>
          <button className={`chip ${family === 'all' ? 'on' : ''}`} onClick={() => { setFamily('all'); haptic(); }}>{t('family.all')}</button>
          {present.map((f) => <button key={f} className={`chip ${family === f ? 'on' : ''}`} onClick={() => { setFamily(f); haptic(); }}>{t(`family.${f}` as Key)}</button>)}
        </div>
      </section>

      {view === 'heat' ? (
        <section className="sec">
          <SecHead title={t('heat.title')} />
          <div className="panel">
            {heat.length ? <Heatmap rows={heat} onOpen={(id) => go(`genres/${id}`)} /> : <Empty>{t('heat.none')}</Empty>}
          </div>
          <p className="note" style={{ marginTop: 8 }}>{t('heat.note')}</p>
        </section>
      ) : (
      <section className="sec">
        <div className="chips">
          <button className={`chip ${onlyFav ? 'on' : ''}`} onClick={() => { setOnlyFav(!onlyFav); haptic(); }}>★ {t('genres.favs')}</button>
          {STATUSES.map((s) => (
            <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => { setStatus(s); haptic(); }}>
              {s === 'all' ? t('genres.filter.all') : t(`status.${s}` as Key)}
            </button>
          ))}
        </div>
        <div className="panel">
          {list.length ? list.map((g) => (
            <GenreRow key={g.id} g={g} onOpen={() => go(`genres/${g.id}`)} fav={prefs.favGenres.includes(g.id)} onFav={() => toggleFav('favGenres', g.id)} />
          )) : <Empty>{t('tracks.none')}</Empty>}
        </div>
        <p className="note" style={{ marginBottom: 8 }}>{t('genres.count')}: {list.length}</p>
      </section>
      )}

      {pickerOpen && (
        <Sheet title={t('genres.compare.pick')} onClose={() => setPickerOpen(false)}>
          <div className="pick-list">
            {sorted.filter((g) => g.history.wiki.length > 0).map((g) => {
              const p = picks.find((x) => x.id === g.id);
              return (
                <button key={g.id} className="pick-row" aria-pressed={!!p} onClick={() => togglePick(g.id)}>
                  <span className="sw" style={{ background: p ? SERIES[p.slot] : 'transparent' }} />
                  <span className="grow">{g.name}</span>
                  {g.family && <span className="note">{t(`family.${g.family}` as Key)}</span>}
                </button>
              );
            })}
          </div>
          <button className="btn" onClick={() => setPickerOpen(false)}>{t('genres.compare.done')}</button>
        </Sheet>
      )}
    </>
  );
}
