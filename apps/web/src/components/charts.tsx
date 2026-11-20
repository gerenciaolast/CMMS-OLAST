'use client';
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { MONTH, type Light } from '@/lib/kpi';

/**
 * Gráficos livianos sin librería: líneas de 2 px, barras ≤ 24 px con punta redondeada de 4 px,
 * separación de 2 px entre segmentos, ejes y rejilla discretos, tooltip al pasar el mouse o tocar.
 */

/** Tendencia de un KPI (una sola serie: el título la nombra, sin leyenda). */
export function Sparkline({ points, format, height = 44 }: { points: { month: string; value: number | null }[]; format: (v: number | null) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length === 0) return <p className="flex items-center text-xs text-muted" style={{ height }}>Sin datos en los últimos 6 meses</p>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;
  const lo = min - pad, hi = max + pad;
  const W = 100, n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  // Segmentos continuos (los meses sin dato cortan la línea).
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value == null) { if (cur) segs.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i)},${y(p.value)}`;
  });
  if (cur) segs.push(cur);
  const last = [...points].reverse().findIndex((p) => p.value != null);
  const li = n - 1 - last;
  const show = hover ?? li;
  const sp = points[show]!;
  return (
    <div className="relative" style={{ height }}
      onMouseLeave={() => setHover(null)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
      }}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {segs.map((d) => <path key={d} d={d} fill="none" stroke="var(--color-series-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      {sp.value != null && (
        <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
          style={{ left: `${x(show)}%`, top: y(sp.value), background: 'var(--color-series-1)' }} />
      )}
      {hover != null && (
        <div className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-0.5 text-xs whitespace-nowrap shadow-sm"
          style={{ left: `${Math.min(85, Math.max(15, x(hover)))}%` }}>
          <span className="text-muted">{MONTH(sp.month)}</span> <strong>{format(sp.value)}</strong>
        </div>
      )}
      <span className="sr-only">{points.map((p) => `${MONTH(p.month)}: ${format(p.value)}`).join('; ')}</span>
    </div>
  );
}

const LIGHT: Record<Exclude<Light, null>, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: 'En meta', tone: 'text-ok', Icon: CheckCircle2 },
  warn: { label: 'Cerca de la meta', tone: 'text-warn', Icon: AlertTriangle },
  bad: { label: 'Fuera de meta', tone: 'text-danger', Icon: XCircle },
};
/** Estado frente a la meta: icono + texto (nunca solo color). */
export function LightBadge({ light }: { light: Light }) {
  if (!light) return null;
  const { label, tone, Icon } = LIGHT[light];
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}><Icon size={14} aria-hidden /> {label}</span>;
}

export interface StackSeries { key: string; label: string; color: string }
/** Columnas apiladas por mes con leyenda, rejilla discreta y tooltip por columna. */
export function StackedColumns({ rows, series, format, height = 220 }: {
  rows: { label: string; values: Record<string, number> }[]; series: readonly StackSeries[]; format: (v: number) => string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const used = series.filter((s) => rows.some((r) => (r.values[s.key] ?? 0) > 0));
  const totals = rows.map((r) => used.reduce((a, s) => a + (r.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 1));
  const ticks = [0, max / 2, max];
  return (
    <div>
      {used.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {used.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}
        </ul>
      )}
      <div className="flex">
        <div className="relative mr-2 w-14 shrink-0 text-right text-[11px] text-muted" style={{ height }}>
          {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: height - (t / max) * height }}>{format(t)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {ticks.map((t) => <div key={t} className={`absolute inset-x-0 border-t ${t === 0 ? 'border-ink/30' : 'border-line'}`} style={{ top: height - (t / max) * height }} />)}
          <div className="absolute inset-0 flex items-end">
            {rows.map((r, i) => (
              <div key={r.label} className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
                <div className="flex w-full max-w-6 flex-col-reverse gap-[2px]" style={{ height: `${(totals[i]! / max) * 100}%` }}>
                  {used.map((s, k) => {
                    const v = r.values[s.key] ?? 0;
                    if (!v) return null;
                    const top = used.slice(k + 1).every((z) => !(r.values[z.key] ?? 0));
                    return <div key={s.key} className={top ? 'rounded-t' : ''} style={{ flexGrow: v, flexBasis: 0, background: s.color, minHeight: 2, opacity: hover == null || hover === i ? 1 : 0.55 }} />;
                  })}
                </div>
                {hover === i && (
                  <div className={`pointer-events-none absolute bottom-full z-10 mb-1 min-w-40 rounded-lg border border-line bg-surface p-2 text-xs shadow-md ${i > rows.length / 2 ? 'right-0' : 'left-0'}`}>
                    <p className="mb-1 font-semibold">{r.label}</p>
                    {used.map((s) => (r.values[s.key] ?? 0) > 0 && (
                      <p key={s.key} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span><span className="tabular-nums">{format(r.values[s.key]!)}</span></p>
                    ))}
                    <p className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{format(totals[i]!)}</span></p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-16 flex">
        {rows.map((r, i) => <span key={r.label} className={`flex-1 truncate pt-1 text-center text-[11px] text-muted ${i % 2 && rows.length > 12 ? 'invisible' : i % 2 && rows.length > 6 ? 'max-sm:invisible' : ''}`}>{r.label}</span>)}
      </div>
    </div>
  );
}

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Barra horizontal de magnitud para tablas (una sola serie). */
export function InlineBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 w-full min-w-16 rounded-full bg-line/60" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: 'var(--color-series-1)' }} />
    </div>
  );
}
