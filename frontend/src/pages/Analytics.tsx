import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NewsRow } from '../components/Rows';
import { SourcesList } from '../components/Shell';
import { Events, Labels } from './Scene';
import { resetOnboarding } from '../components/Onboarding';
import { Empty, SecHead, Seg, SourceTags, Toggle } from '../components/ui';
import { isApiConfigured, saveDigestPrefs, type SyncResult } from '../services/api';
import { useI18n, type Key } from '../services/i18n';
import { DIGEST_SECTIONS, SECTIONS, usePrefs, type DigestSection, type Lang } from '../services/prefs';
import { haptic, inTelegram, tg } from '../services/telegram';
import type { AppData } from '../types';

export type ATab = 'insights' | 'labels' | 'events' | 'sources' | 'settings';
const ATABS: ATab[] = ['insights', 'labels', 'events', 'sources', 'settings'];
const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

/** Безопасно показывает дайджест: допускается только <b>, остальное — обычный текст. */
function DigestText({ html }: { html: string }) {
  const parts = html.split(/(<b>.*?<\/b>)/g);
  const dec = (s: string) => s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (m) => ENT[m] ?? m);
  const nodes: ReactNode[] = parts.map((p, i) => (p.startsWith('<b>') ? <b key={i}>{dec(p.slice(3, -4))}</b> : <span key={i}>{dec(p)}</span>));
  return <p style={{ whiteSpace: 'pre-line', fontSize: 13.5, lineHeight: 1.55 }}>{nodes}</p>;
}

export default function Analytics({ data, tab, setTab, go }: { data: AppData; tab: ATab; setTab: (t: ATab) => void; go: (p: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <h1 className="page-title">{t('nav.analytics')}</h1>
      <div className="chips">
        {ATABS.filter((x) => x !== 'events' || data.events.length > 0).map((x) => <button key={x} className={`chip ${tab === x ? 'on' : ''}`} onClick={() => { setTab(x); haptic(); }}>{t(`an.${x}` as Key)}</button>)}
      </div>
      {tab === 'insights' && <Insights data={data} go={go} />}
      {tab === 'labels' && <Labels data={data} />}
      {tab === 'events' && data.events.length > 0 && <Events data={data} />}
      {tab === 'sources' && <Sources data={data} />}
      {tab === 'settings' && <Settings data={data} />}
    </>
  );
}

function Insights({ data, go }: { data: AppData; go: (p: string) => void }) {
  const { t } = useI18n();
  const items = data.insights.items;
  return (
    <>
      <div className="panel">
        {items.length ? items.map((i) => (
          <div className="insight" key={i.id}>
            <h3>{i.title}</h3>
            <p>{i.body}</p>
            <div className="note" style={{ marginBottom: 4 }}>{t('insights.period')}: {t('insights.days', { n: i.period_days })}</div>
            <div className="note" style={{ marginBottom: 2 }}>{t('insights.evidence')}</div>
            {i.evidence.map((e, k) => <div className="ev" key={k}><span>{e.label}</span><b>{e.value}</b></div>)}
            <div style={{ marginTop: 8 }}><SourceTags sources={i.sources} /></div>
            {i.genre && <button className="chip" style={{ marginTop: 4 }} onClick={() => go(`genres/${i.genre}`)}>{data.genres.find((g) => g.id === i.genre)?.name}</button>}
          </div>
        )) : <Empty>{t('insights.none')}</Empty>}
      </div>
      <p className="note pad">{t('insights.ru.note')}</p>
      {data.news.length > 0 && (
        <section className="sec">
          <SecHead title={t('section.news')} />
          <div className="panel">{data.news.slice(0, 10).map((n) => <NewsRow key={n.link} n={n} />)}</div>
        </section>
      )}
    </>
  );
}

function Sources({ data }: { data: AppData }) {
  const { t } = useI18n();
  return (
    <>
      <SecHead title={t('sources.title')} />
      <SourcesList data={data} />
      <section className="sec" style={{ marginTop: 22 }}>
        <SecHead title={t('method.title')} />
        <div className="panel pad" style={{ display: 'grid', gap: 10 }}>
          {(['method.score', 'method.change', 'method.status'] as Key[]).map((k) => <p className="note" key={k} style={{ color: 'var(--tx2)' }}>{t(k)}</p>)}
        </div>
      </section>
      <section className="sec">
        <SecHead title={t('method.limits')} />
        <div className="panel pad" style={{ display: 'grid', gap: 8 }}>
          {(['method.limits.2'] as Key[]).map((k) => <p className="note" key={k} style={{ color: 'var(--tx2)' }}>• {t(k)}</p>)}
          <p className="note">{t('method.lastfm')}</p>
        </div>
      </section>
    </>
  );
}

function Settings({ data }: { data: AppData }) {
  const { t } = useI18n();
  const { prefs, update } = usePrefs();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const save = async () => {
    setBusy(true);
    tg()?.MainButton?.showProgress();
    const r = await saveDigestPrefs(prefsRef.current);
    setBusy(false);
    tg()?.MainButton?.hideProgress();
    setResult(r);
    if (r === 'ok') { setDirty(false); haptic('success'); }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Главная кнопка Telegram («Сохранить подписку») показывается только при несохранённых изменениях.
  useEffect(() => {
    const mb = tg()?.MainButton;
    if (!mb || !inTelegram()) return;
    const h = () => { void saveRef.current(); };
    if (dirty && prefs.digest.freq !== undefined) {
      mb.setParams({ text: t('settings.digest.save'), is_visible: true, is_active: true, color: '#b7ff3c', text_color: '#0e1011' });
      mb.onClick(h);
    } else mb.hide();
    return () => { mb.offClick(h); mb.hide(); };
  }, [dirty, t, prefs.digest.freq]);

  const setDigest = (patch: Partial<typeof prefs.digest>) => { update({ digest: { ...prefs.digest, ...patch } }); setDirty(true); setResult(null); };
  const toggleDigestSection = (s: DigestSection, on: boolean) =>
    setDigest({ sections: on ? [...new Set([...prefs.digest.sections, s])] : prefs.digest.sections.filter((x) => x !== s) });

  const msg: Record<SyncResult, Key> = { ok: 'settings.digest.saved', error: 'settings.digest.err', 'no-api': 'settings.digest.noapi', 'no-telegram': 'settings.digest.notg', unauthorized: 'settings.digest.unauth' };

  return (
    <>
      <section className="sec">
        <SecHead title={t('settings.lang')} />
        <Seg<Lang> value={prefs.lang} onChange={(l) => { update({ lang: l }); setDirty(true); }} options={[{ id: 'ru', label: 'Русский' }, { id: 'en', label: 'English' }]} />
      </section>

      <section className="sec">
        <SecHead title={t('settings.sections')} />
        <div className="panel">
          {SECTIONS.map((s) => (
            <Toggle key={s} on={!prefs.hidden.includes(s)} onChange={(on) => update({ hidden: on ? prefs.hidden.filter((x) => x !== s) : [...prefs.hidden, s] })}>
              {t(`section.${s}` as Key)}
            </Toggle>
          ))}
        </div>
      </section>

      <section className="sec">
        <SecHead title={t('settings.digest')} />
        <p className="note" style={{ marginBottom: 8 }}>{t('settings.digest.freq')}</p>
        <Seg<'off' | 'daily' | 'weekly'> value={prefs.digest.freq} onChange={(f) => setDigest({ freq: f })}
          options={[{ id: 'off', label: t('settings.digest.off') }, { id: 'daily', label: t('settings.digest.daily') }, { id: 'weekly', label: t('settings.digest.weekly') }]} />
        {prefs.digest.freq !== 'off' && (
          <>
            <p className="note" style={{ margin: '14px 0 8px' }}>{t('settings.digest.sections')}</p>
            <div className="panel">
              {DIGEST_SECTIONS.map((s) => (
                <Toggle key={s} on={prefs.digest.sections.includes(s)} onChange={(on) => toggleDigestSection(s, on)}>{t(`digest.${s}` as Key)}</Toggle>
              ))}
            </div>
          </>
        )}
        <button className="btn ghost sm" style={{ marginTop: 14 }} onClick={() => { resetOnboarding(); window.location.reload(); }}>{t('onb.again')}</button>
        {!inTelegram() && <button className="btn" style={{ marginTop: 14 }} disabled={busy || !dirty} onClick={() => void save()}>{t('settings.digest.save')}</button>}
        {inTelegram() && !dirty && result !== 'ok' && !isApiConfigured() && <p className="note" style={{ marginTop: 10 }}>{t('settings.digest.noapi')}</p>}
        {result && <p className="note" style={{ marginTop: 10, color: result === 'ok' ? 'var(--up)' : 'var(--warn)' }}>{t(msg[result])}</p>}
      </section>

      {data.digest && (
        <section className="sec">
          <SecHead title={t('settings.preview')} note={data.digest.data_date} />
          <div className="panel pad" style={{ display: 'grid', gap: 12 }}>
            {data.digest.order.filter((k) => data.digest!.sections[k]).map((k) => <DigestText key={k} html={data.digest!.sections[k]} />)}
            <p className="note">{data.digest.footer.replace(/&amp;/g, '&')}</p>
          </div>
        </section>
      )}

      <button className="btn ghost" onClick={() => update({ favGenres: [] })}>{t('settings.reset')}</button>
    </>
  );
}
