import { useMemo, useState } from 'react';
import { useI18n, type Key } from '../services/i18n';
import { usePrefs } from '../services/prefs';
import { readStore, writeStore } from '../services/storage';
import { haptic } from '../services/telegram';
import type { AppData } from '../types';
import { Sheet } from './ui';

const KEY = 'djpulse.onboarded.v1';
export const wasOnboarded = (): boolean => readStore<{ done: boolean }>(KEY, { done: false }).done === true;
export const resetOnboarding = (): void => writeStore(KEY, { done: false });

/** Подсказка при первом запуске: что это и выбор жанров (они попадают в избранное и в дайджест бота). */
export default function Onboarding({ data, onClose }: { data: AppData; onClose: () => void }) {
  const { t } = useI18n();
  const { prefs, toggleFav } = usePrefs();
  const [step, setStep] = useState(0);
  // Предлагаем самые заметные жанры, у которых уже есть оценка интереса
  const [fam, setFam] = useState('all');
  const families = useMemo(() => [...new Set(data.genres.map((g) => g.family).filter(Boolean))] as string[], [data.genres]);
  const popular = useMemo(() => [...data.genres].filter((g) => fam === 'all' || g.family === fam)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name)), [data.genres, fam]);
  const finish = () => { writeStore(KEY, { done: true }); onClose(); };
  return (
    <Sheet title={t('onb.title')} onClose={finish}>
      {step === 0 ? (
        <>
          <p style={{ marginBottom: 12, lineHeight: 1.5 }}>{t('onb.lead')}</p>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {(['onb.b1', 'onb.b2', 'onb.b3'] as const).map((k) => <p className="note" style={{ color: 'var(--tx2)' }} key={k}>• {t(k)}</p>)}
          </div>
          <button className="btn" onClick={() => { setStep(1); haptic(); }}>{t('onb.next')}</button>
        </>
      ) : (
        <>
          <p style={{ marginBottom: 4, fontWeight: 600 }}>{t('onb.pick')}</p>
          <p className="note" style={{ marginBottom: 10 }}>{t('onb.pick.note')}</p>
          <div className="chips" style={{ marginBottom: 8 }}>
            <button className={`chip ${fam === 'all' ? 'on' : ''}`} onClick={() => setFam('all')}>{t('family.all')}</button>
            {families.map((f) => <button key={f} className={`chip ${fam === f ? 'on' : ''}`} onClick={() => setFam(f)}>{t(`family.${f}` as Key)}</button>)}
          </div>
          <div className="chips" style={{ flexWrap: 'wrap', overflow: 'auto', maxHeight: 260, margin: 0, padding: 0, marginBottom: 14 }}>
            {popular.map((g) => (
              <button key={g.id} className={`chip ${prefs.favGenres.includes(g.id) ? 'on' : ''}`} style={{ marginBottom: 2 }}
                aria-pressed={prefs.favGenres.includes(g.id)} onClick={() => { toggleFav('favGenres', g.id); haptic(); }}>{g.name}</button>
            ))}
          </div>
          <button className="btn" onClick={finish}>{t('onb.done')}</button>
        </>
      )}
      {step === 0 && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={finish}>{t('onb.skip')}</button>}
    </Sheet>
  );
}
