import { useMemo, useState } from 'react';
import { Empty, SecHead, Sheet } from '../components/ui';
import { flag, fmtDay } from '../services/format';
import { useI18n } from '../services/i18n';
import { openLink } from '../services/telegram';
import type { AppData, LabelItem } from '../types';

export function Labels({ data }: { data: AppData }) {
  const { t, lang } = useI18n();
  const [sel, setSel] = useState<LabelItem | null>(null);
  return (
    <>
      <SecHead title={t('labels.title')} />
      <div className="panel">
        {data.labels.length ? data.labels.map((l) => (
          <button className="row" key={l.id} onClick={() => setSel(l)}>
            <div className="grow">
              <div className="title">{l.name}</div>
              <div className="sub">{l.genres.slice(0, 3).map((g) => g.name).join(' · ')}</div>
            </div>
            <div className="note">{l.n_releases} {t('labels.releases')}</div>
          </button>
        )) : <Empty>{t('labels.none')}</Empty>}
      </div>
      <p className="note" style={{ marginTop: 8 }}>{t('labels.note')}</p>
      {sel && (
        <Sheet title={sel.name} onClose={() => setSel(null)}>
          <p className="note" style={{ marginBottom: 8 }}>{sel.artists.join(', ')}</p>
          <div className="panel">
            {sel.releases.map((r) => (
              <button className="row" key={r.url} onClick={() => openLink(r.url)}>
                <div className="grow"><div className="title">{r.title}</div><div className="sub">{r.artist}</div></div>
                <div className="note">{fmtDay(r.date, lang)}</div>
              </button>
            ))}
          </div>
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => openLink(sel.url)}>{t('labels.open')}</button>
        </Sheet>
      )}
    </>
  );
}

export function Events({ data }: { data: AppData }) {
  const { t, lang } = useI18n();
  const [country, setCountry] = useState('all');
  const off = data.sources.ticketmaster?.status === 'disabled' || (!data.sources.ticketmaster && data.events.length === 0);
  const countries = useMemo(() => [...new Set(data.events.map((e) => e.country).filter(Boolean))].sort() as string[], [data.events]);
  const list = data.events.filter((e) => country === 'all' || e.country === country);
  return (
    <>
      <SecHead title={t('events.title')} />
      {off ? (
        <div className="panel pad">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>{t('events.off')}</p>
          <p className="note">{t('events.off.how')}</p>
        </div>
      ) : (
        <>
          {countries.length > 1 && (
            <div className="chips">
              <button className={`chip ${country === 'all' ? 'on' : ''}`} onClick={() => setCountry('all')}>{t('events.all')}</button>
              {countries.map((c) => <button key={c} className={`chip ${country === c ? 'on' : ''}`} onClick={() => setCountry(c)}>{flag(c)} {c}</button>)}
            </div>
          )}
          <div className="panel">
            {list.length ? list.slice(0, 60).map((e) => (
              <button className="row" key={e.id} onClick={() => openLink(e.url)}>
                <div className="grow">
                  <div className="title">{e.name}</div>
                  <div className="sub">{[e.venue, e.city, e.country].filter(Boolean).join(', ')}</div>
                </div>
                <div className="note">{fmtDay(e.date, lang)}</div>
              </button>
            )) : <Empty>{t('events.none')}</Empty>}
          </div>
          <p className="note" style={{ marginTop: 8 }}>{t('events.note')}</p>
        </>
      )}
    </>
  );
}
