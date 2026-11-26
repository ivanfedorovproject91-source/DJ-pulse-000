import { useAudioError } from '../hooks/useAudio';
import { useI18n } from '../services/i18n';
import { fmtDay } from '../services/format';
import { openLink } from '../services/telegram';
import type { Genre, NewsItem, Release, Track } from '../types';
import Spark from '../charts/Spark';
import { Delta, FavStar, Icon, StatusBadge } from './ui';

export function GenreRow({ g, onOpen, fav, onFav, right }: {
  g: Genre; onOpen: () => void; fav?: boolean; onFav?: () => void; right?: 'spark' | 'score';
}) {
  const { t } = useI18n();
  return (
    <div className="row" style={{ cursor: 'pointer' }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="grow">
        <div className="title">{g.name}</div>
        <div className="sub"><StatusBadge status={g.status} /></div>
      </div>
      {right !== 'score' && <Spark points={g.history.wiki} days={30} />}
      <div style={{ textAlign: 'right', minWidth: 62 }}>
        <Delta v={g.changes.d30} />
        <div className="note" style={{ fontSize: 11.5 }}>{t('change.30')}</div>
      </div>
      {onFav && <FavStar on={!!fav} onClick={onFav} />}
    </div>
  );
}

export function TrackRow({ tr, playing, onPlay }: { tr: Track; playing: boolean; onPlay: (t: Track) => void }) {
  const { t } = useI18n();
  const err = useAudioError(tr.id);
  return (
    <div className="row">
      <span className="cover">{tr.cover ? <img src={tr.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="disc" size={20} />}</span>
      <div className="grow">
        <div className="title">{tr.title}</div>
        <div className="sub">{tr.artist}</div>
        {err && <div className="note" style={{ color: 'var(--warn)', marginTop: 4 }}>{err}</div>}
      </div>
      {(tr.preview || tr.deezer_id) && (
        <button className={`play ${playing ? 'on' : ''}`} onClick={() => onPlay(tr)} aria-label={playing ? t('tracks.stop') : t('tracks.play')}>
          <Icon name={playing ? 'stop' : 'play'} size={16} />
        </button>
      )}
      {tr.url && <button className="play" onClick={() => openLink(tr.url!)} aria-label={t('tracks.open')}><Icon name="ext" size={16} /></button>}
    </div>
  );
}

export function ReleaseRow({ r, genreName }: { r: Release; genreName?: string }) {
  const { lang } = useI18n();
  return (
    <button className="row" onClick={() => openLink(r.url)}>
      <span className="cover"><Icon name="disc" size={20} /></span>
      <div className="grow">
        <div className="title">{r.title}</div>
        <div className="sub">{r.artist}</div>
        {r.label && <div className="sub">{r.label.name}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="note">{fmtDay(r.date, lang)}</div>
        {(genreName || r.type) && <div className="note" style={{ fontSize: 11.5 }}>{[r.type, genreName].filter(Boolean).join(' · ')}</div>}
      </div>
    </button>
  );
}

export function NewsRow({ n }: { n: NewsItem }) {
  const { lang } = useI18n();
  return (
    <button className="row news-row" onClick={() => openLink(n.link)}>
      <div className="grow">
        <div className="title">{n.title}</div>
        <div className="sub">{n.source} · {fmtDay(n.published, lang)}</div>
      </div>
      <Icon name="ext" size={16} />
    </button>
  );
}
