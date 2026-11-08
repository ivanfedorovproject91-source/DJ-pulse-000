import type { HeatRow } from '../services/heatmap';
import { fmtPct } from '../services/format';
import { useI18n } from '../services/i18n';

/** Диверсирующая заливка: рост — зелёный, спад — розовый; насыщенность по модулю (насыщение при ±40%). Значение всегда выписано цифрой. */
function cellStyle(v: number | null) {
  if (v == null) return { background: 'transparent', border: '1px dashed var(--line)' };
  const a = Math.min(1, Math.abs(v) / 40);
  const rgb = v >= 0 ? '183,255,60' : '255,115,150';
  return { background: `rgba(${rgb},${(0.08 + a * 0.62).toFixed(2)})`, border: '1px solid transparent' };
}

export default function Heatmap({ rows, onOpen }: { rows: HeatRow[]; onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const n = rows[0]?.cells.length ?? 0;
  return (
    <div className="heat" role="table">
      <div className="heat-row heat-head" role="row">
        <span className="heat-name">{t('heat.week')}</span>
        {Array.from({ length: n }, (_, i) => <span key={i} className="heat-col">{i === n - 1 ? '→' : `−${n - 1 - i}`}</span>)}
      </div>
      {rows.map((r) => (
        <button key={r.genre.id} className="heat-row" role="row" onClick={() => onOpen(r.genre.id)}>
          <span className="heat-name">{r.genre.name}</span>
          {r.cells.map((c, i) => (
            <span key={i} className="heat-cell" style={cellStyle(c)} title={c == null ? '—' : fmtPct(c, 0)}>
              {c == null ? '' : Math.round(c)}
            </span>
          ))}
        </button>
      ))}
    </div>
  );
}
