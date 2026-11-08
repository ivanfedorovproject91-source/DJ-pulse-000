import { useMemo, useState } from 'react';
import LineChart from '../charts/LineChart';
import { SERIES } from '../charts/palette';
import { ArtistRow, GenreRow, NewsRow, ReleaseRow, TrackRow } from '../components/Rows';
import { Empty, SecHead, SourceTags, StatusBadge, Sheet } from '../components/ui';
import { readStore, writeStore } from '../services/storage';
import { useAudio } from '../hooks/useAudio';
import { useI18n } from '../services/i18n';
import { fmtPct } from '../services/format';
import { usePrefs, type SectionId } from '../services/prefs';
import type { AppData } from '../types';

interface Props { data: AppData; go: (p: string) => void }

export default function Dashboard({ data, go }: Props) {
  const { t } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const audio = useAudio();
  const show = (id: SectionId) => !prefs.hidden.includes(id);
  const gname = useMemo(() => new Map(data.genres.map((g) => [g.id, g.name])), [data.genres]);

  // Растущие жанры — только с заметным объёмом интереса: рост «с нуля» (+500% от пары просмотров) не показатель.
  const topGenres = useMemo(() => {
    const withD = data.genres.filter((g) => g.changes.d30 != null && g.score != null);
    const scores = withD.map((g) => g.score as number).sort((a, b) => a - b);
    const median = scores.length ? scores[Math.floor(scores.length / 2)] : 0;
    return withD.filter((g) => (g.score as number) >= median).sort((a, b) => (b.changes.d30 as number) - (a.changes.d30 as number)).slice(0, 5);
  }, [data.genres]);
  const [picks, setPicks] = useState<string[]>(() => readStore<{ ids: string[] }>('djpulse.chartpicks', { ids: [] }).ids.slice(0, 6));
  const [pickerOpen, setPickerOpen] = useState(false);
  const savePicks = (ids: string[]) => { setPicks(ids); writeStore('djpulse.chartpicks', { ids }); };
  const chartGenres = useMemo(() => {
    const chosen = picks.map((id) => data.genres.find((g) => g.id === id)).filter((g): g is NonNullable<typeof g> => !!g);
    if (chosen.length) return chosen;
    return [...data.genres].filter((g) => g.score != null).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 5);
  }, [picks, data.genres]);
  const rising = useMemo(
    () => data.artists.filter((a) => a.rising).sort((a, b) => (b.growth_30d ?? 0) - (a.growth_30d ?? 0)).slice(0, 5),
    [data.artists],
  );
  const hotTracks = useMemo(() => {
    const dz = data.tracks.filter((x) => x.source === 'deezer');
    const movers = dz.filter((x) => (x.position_delta ?? 0) > 0).sort((a, b) => (b.position_delta as number) - (a.position_delta as number));
    return (movers.length ? movers : dz.sort((a, b) => a.chart_position - b.chart_position)).slice(0, 5);
  }, [data.tracks]);
  const releases = useMemo(() => [...data.releases].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5), [data.releases]);
  const favGenres = data.genres.filter((g) => prefs.favGenres.includes(g.id));
  const favArtists = data.artists.filter((a) => prefs.favArtists.includes(a.id));
  const wt = data.insights.weekly_trend;
  const shifts = (data.digest?.status_changes ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);

  return (
    <>
      {show('trend') && (
        <section className="hero" aria-label={t('trend.title')}>
          <h2>{t('trend.title')}</h2>
          {wt ? (
            <>
              <div className="pulse" aria-hidden="true"><i /><i /><i /><b /></div>
              <div className="name">{wt.name}</div>
              <div className="big">{fmtPct(wt.d7)}</div>
              <div className="meta">{t('trend.d7')}{wt.d30 != null ? ` · ${fmtPct(wt.d30)} ${t('trend.d30')}` : ''}</div>
              <div className="tags"><SourceTags sources={wt.sources} /></div>
              <button className="chip" style={{ marginTop: 6 }} onClick={() => go(`genres/${wt.genre}`)}>{t('genre.history')}</button>
            </>
          ) : (
            <>
              <div className="name" style={{ maxWidth: '100%', fontSize: 17 }}>{t('trend.none')}</div>
              <p className="note" style={{ marginTop: 8 }}>{t('trend.none.why')}</p>
            </>
          )}
        </section>
      )}

      {shifts.length > 0 && (
        <section className="sec">
          <SecHead title={t('changes.title')} note={t('changes.note')} />
          <div className="panel">
            {shifts.map((c) => (
              <div className="row" key={`${c.genre}-${c.date}`} style={{ cursor: 'pointer' }} role="button" tabIndex={0}
                onClick={() => go(`genres/${c.genre}`)} onKeyDown={(e) => e.key === 'Enter' && go(`genres/${c.genre}`)}>
                <div className="grow"><div className="title">{c.name}</div><div className="sub">{c.date}</div></div>
                <StatusBadge status={c.from} /> <span className="note">→</span> <StatusBadge status={c.to} />
              </div>
            ))}
          </div>
        </section>
      )}

      {show('favorites') && (favGenres.length > 0 || favArtists.length > 0) && (
        <section className="sec">
          <SecHead title={t('section.favorites')} />
          <div className="panel">
            {favGenres.map((g) => <GenreRow key={g.id} g={g} onOpen={() => go(`genres/${g.id}`)} fav onFav={() => toggleFav('favGenres', g.id)} />)}
            {favArtists.map((a) => <ArtistRow key={a.id} a={a} onOpen={() => go(`artist/${a.id}`)} fav onFav={() => toggleFav('favArtists', a.id)} />)}
          </div>
        </section>
      )}
      {show('favorites') && favGenres.length === 0 && favArtists.length === 0 && (
        <section className="sec">
          <SecHead title={t('section.favorites')} />
          <div className="panel"><Empty>{t('fav.empty')}</Empty></div>
        </section>
      )}

      {show('chart') && (
        <section className="sec">
          <SecHead title={t('section.chart')} note={picks.length ? t('chart.mine') : t('top5')} action={{ label: t('chart.pick'), onClick: () => setPickerOpen(true) }} />
          <div className="panel pad">
            <LineChart
              defaultMode="pct"
              defaultPeriod={90}
              series={chartGenres.map((g, i) => ({ id: g.id, label: g.name, color: SERIES[i % SERIES.length], points: g.history.wiki }))}
            />
            <p className="note" style={{ marginTop: 8 }}>{t('genre.history.note')}</p>
          </div>
        </section>
      )}

      {show('genres') && (
        <section className="sec">
          <SecHead title={t('section.genres')} action={{ label: t('more'), onClick: () => go('genres') }} />
          <div className="panel">
            {topGenres.length ? topGenres.map((g) => <GenreRow key={g.id} g={g} onOpen={() => go(`genres/${g.id}`)} />) : <Empty>{t('status.insufficient.hint')}</Empty>}
          </div>
        </section>
      )}

      {show('rising') && (
        <section className="sec">
          <SecHead title={t('section.rising')} action={{ label: t('more'), onClick: () => go('djs') }} />
          <div className="panel">
            {rising.length ? rising.map((a, i) => <ArtistRow key={a.id} a={a} rank={i + 1} onOpen={() => go(`artist/${a.id}`)} />) : <Empty>{t('djs.none.rising')}</Empty>}
          </div>
        </section>
      )}

      {show('tracks') && (
        <section className="sec">
          <SecHead title={t('section.tracks')} action={{ label: t('more'), onClick: () => go('tracks') }} />
          <div className="panel">
            {hotTracks.length ? hotTracks.map((x) => <TrackRow key={x.id} tr={x} playing={audio.playing === x.id} onPlay={audio.toggle} />) : <Empty>{t('tracks.none')}</Empty>}
          </div>
        </section>
      )}

      {show('releases') && (
        <section className="sec">
          <SecHead title={t('section.releases')} />
          <div className="panel">
            {releases.length ? releases.map((r) => <ReleaseRow key={r.mbid} r={r} genreName={gname.get(r.genre)} />) : <Empty>{t('genre.releases.none')}</Empty>}
          </div>
        </section>
      )}

      {show('insights') && (
        <section className="sec">
          <SecHead title={t('section.insights')} action={{ label: t('more'), onClick: () => go('analytics/insights') }} />
          <div className="panel">
            {data.insights.items.length ? data.insights.items.slice(0, 3).map((i) => (
              <div className="insight" key={i.id}>
                <h3>{i.title}</h3>
                <p style={{ marginBottom: 6 }}>{i.body}</p>
                <SourceTags sources={i.sources} />
              </div>
            )) : <Empty>{t('insights.none')}</Empty>}
          </div>
        </section>
      )}

      {show('news') && data.news.length > 0 && (
        <section className="sec">
          <SecHead title={t('section.news')} />
          <div className="panel">{data.news.slice(0, 4).map((n) => <NewsRow key={n.link} n={n} />)}</div>
        </section>
      )}
      {pickerOpen && (
        <Sheet title={t('chart.pick.title')} onClose={() => setPickerOpen(false)}>
          <p className="note" style={{ marginBottom: 8 }}>{t('chart.pick.hint')}</p>
          <div className="pick-list">
            {[...data.genres].filter((g) => g.history.wiki.length > 0).sort((a, b) => a.name.localeCompare(b.name)).map((g) => {
              const on = picks.includes(g.id);
              return (
                <button key={g.id} className="pick-row" aria-pressed={on}
                  onClick={() => savePicks(on ? picks.filter((x) => x !== g.id) : picks.length >= 6 ? picks : [...picks, g.id])}>
                  <span className="sw" style={{ background: on ? SERIES[picks.indexOf(g.id) % SERIES.length] : 'transparent' }} />
                  <span className="grow">{g.name}</span>
                </button>
              );
            })}
          </div>
          <button className="btn ghost sm" style={{ marginBottom: 8 }} onClick={() => savePicks([])}>{t('chart.pick.reset')}</button>
          <button className="btn" onClick={() => setPickerOpen(false)}>OK</button>
        </Sheet>
      )}
    </>
  );
}
