import { useMemo, useState } from 'react';
import { useI18n, type Key } from '../services/i18n';
import { searchAll, type Hit } from '../services/search';
import { openLink } from '../services/telegram';
import type { AppData } from '../types';
import { Sheet } from './ui';

export default function SearchSheet({ data, onClose, go }: { data: AppData; onClose: () => void; go: (p: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchAll(data, q), [data, q]);
  const open = (h: Hit) => {
    onClose();
    if (h.kind === 'genre') go(`genres/${h.id}`);
    else if (h.kind === 'artist') go(`artist/${h.id}`);
    else if (h.kind === 'label') go('analytics/labels');
    else if (h.url) openLink(h.url);
    else go('tracks');
  };
  const kinds: Hit['kind'][] = ['genre', 'artist', 'label', 'track'];
  return (
    <Sheet title={t('search.title')} onClose={onClose}>
      <input className="input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.ph')} aria-label={t('search.title')} />
      <div style={{ minHeight: 160, marginTop: 10 }}>
        {q.trim().length < 2 ? <p className="note">{t('search.hint')}</p>
          : hits.length === 0 ? <p className="note">{t('search.none')}</p>
          : kinds.map((k) => {
            const arr = hits.filter((h) => h.kind === k);
            return arr.length ? (
              <div key={k} style={{ marginBottom: 10 }}>
                <div className="note" style={{ margin: '6px 4px' }}>{t(`search.${k}` as Key)}</div>
                <div className="panel">
                  {arr.map((h) => (
                    <button key={`${h.kind}-${h.id}`} className="row" onClick={() => open(h)}>
                      <div className="grow"><div className="title">{h.title}</div>{h.sub && <div className="sub">{h.kind === 'label' ? `${h.sub} ${t('labels.releases')}` : h.sub}</div>}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null;
          })}
      </div>
    </Sheet>
  );
}
