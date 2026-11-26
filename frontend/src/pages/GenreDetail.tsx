import LineChart from '../charts/LineChart';
import { SERIES } from '../charts/palette';
import { ReleaseRow, TrackRow } from '../components/Rows';
import { Delta, Empty, FavStar, SecHead, SourceTags, StatusBadge } from '../components/ui';
import { useAudio } from '../hooks/useAudio';
import { useI18n, type Key } from '../services/i18n';
import { fmtDay } from '../services/format';
import { usePrefs } from '../services/prefs';
import { haptic, openLink } from '../services/telegram';
import { GenreRow } from '../components/Rows';
import type { AppData } from '../types';

export default function GenreDetail({ data, id, go }: { data: AppData; id: string; go: (p: string) => void }) {
  const { t, lang } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const audio = useAudio();
  const g = data.genres.find((x) => x.id === id);
  if (!g) return <Empty title={t('notfound')} />;

  const tracks = data.tracks.filter((x) => x.genre === g.id).sort((a, b) => a.rank - b.rank).slice(0, 8);
  const releases = data.releases.filter((r) => r.genre === g.id).slice(0, 6);
  const lfPoints = g.history.lf_reach;
  const related = data.genres.filter((x) => x.family && x.family === g.family && x.id !== g.id)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 5);
  const share = () => {
    haptic();
    const url = window.location.href.split('#')[0] + `#/genres/${g.id}`;
    const text = `${t('share.text')}: ${g.name}${g.changes.d30 != null ? ` (${g.changes.d30 > 0 ? '+' : ''}${Math.round(g.changes.d30)}% / 30)` : ''}`;
    openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  };
  const labels = data.labels.filter((l) => l.genres.some((x) => x.genre === g.id)).sort((a, b) => b.n_releases - a.n_releases).slice(0, 5);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>{g.name}</h1>
          <StatusBadge status={g.status} />
          {g.family && <span className="src-tag" style={{ marginLeft: 8 }}>{t(`family.${g.family}` as Key)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="chip" onClick={share}>{t('share')}</button>
          <FavStar on={prefs.favGenres.includes(g.id)} onClick={() => toggleFav('favGenres', g.id)} />
        </div>
      </div>

      {g.summary && (
        <section className="sec" style={{ marginTop: 14, marginBottom: 0 }}>
          <div className="panel pad">
            <div className="note" style={{ marginBottom: 6 }}>{t('genre.about')}</div>
            <p style={{ lineHeight: 1.5 }}>{g.summary}</p>
            <p className="note" style={{ marginTop: 6 }}>{t('genre.about.src')}</p>
          </div>
        </section>
      )}

      <section className="sec" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <div className="note">{t('score')}</div>
              <div className="score">{g.score != null ? g.score.toFixed(0) : '—'}</div>
            </div>
            <div className="note" style={{ maxWidth: 150, textAlign: 'right' }}>{t('score.hint')}</div>
          </div>
          <div className="kpis" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="kpi"><small>{t('change.7')}</small><Delta v={g.changes.d7} /></div>
            <div className="kpi"><small>{t('change.30')}</small><Delta v={g.changes.d30} /></div>
            <div className="kpi"><small>{t('change.90')}</small><Delta v={g.changes.d90} /></div>
          </div>
        </div>
        {g.changes.y1 != null && <p className="note" style={{ marginTop: 8 }}>{t('change.365')}: <Delta v={g.changes.y1} /></p>}
      </section>

      <section className="sec">
        <SecHead title={t('genre.history')} />
        <div className="panel pad">
          <LineChart series={[{ id: g.id, label: g.name, color: SERIES[0], points: g.history.wiki }]} defaultPeriod={90} />
          <p className="note" style={{ marginTop: 8 }}>{t('genre.history.note')}</p>
          <p className="note">{t('genre.asof')} {fmtDay(g.as_of, lang)} · <SourceTags sources={g.sources} /></p>
          {g.wiki_article && (
            <button className="chip" style={{ marginTop: 8 }} onClick={() => openLink(`https://en.wikipedia.org/wiki/${encodeURIComponent(g.wiki_article!.replace(/ /g, '_'))}`)}>
              {t('genre.article')}
            </button>
          )}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('genre.lf')} />
        <div className="panel pad">
          {lfPoints.length >= 3 ? (
            <LineChart series={[{ id: 'lf', label: 'Last.fm', color: SERIES[1], points: lfPoints }]} defaultPeriod={90} allowSmooth={false} small />
          ) : (
            <p className="note">{t('genre.lf.few')}: {lfPoints.length}</p>
          )}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('genre.tracks')} />
        <p className="note" style={{ marginBottom: 8 }}>{t('genre.tracks.note')}</p>
        <div className="panel">
          {tracks.length ? tracks.map((x) => <TrackRow key={x.id} tr={x} playing={audio.playing === x.id} onPlay={audio.toggle} />) : <Empty>{t('genre.tracks.none')}</Empty>}
        </div>
      </section>

      {labels.length > 0 && (
        <section className="sec">
          <SecHead title={t('genre.labels')} />
          <div className="panel">
            {labels.map((l) => (
              <button className="row" key={l.id} onClick={() => openLink(l.url)}>
                <div className="grow"><div className="title">{l.name}</div><div className="sub">{l.artists.slice(0, 3).join(', ')}</div></div>
                <div className="note">{l.n_releases} {t('labels.releases')}</div>
              </button>
            ))}
          </div>
          <p className="note" style={{ marginTop: 8 }}>{t('labels.note')}</p>
        </section>
      )}

      {related.length > 0 && (
        <section className="sec">
          <SecHead title={t('genre.related')} />
          <div className="panel">
            {related.map((x) => <GenreRow key={x.id} g={x} onOpen={() => go(`genres/${x.id}`)} fav={prefs.favGenres.includes(x.id)} onFav={() => toggleFav('favGenres', x.id)} />)}
          </div>
        </section>
      )}

      <section className="sec">
        <SecHead title={t('genre.releases')} />
        <div className="panel">
          {releases.length ? releases.map((r) => <ReleaseRow key={r.mbid} r={r} />) : <Empty>{t('genre.releases.none')}</Empty>}
        </div>
      </section>
    </>
  );
}
