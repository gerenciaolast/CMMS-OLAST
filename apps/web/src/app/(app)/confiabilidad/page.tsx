'use client';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Alert, Card } from '@/components/ui';
import { InlineBar } from '@/components/charts';
import { KpiFilterBar, useKpiFilters } from '@/components/kpi-filters';
import { api } from '@/lib/api';
import { fmt, millions, money, query, type BadActor, type ParetoRow } from '@/lib/kpi';

const BY = [
  { v: 'system', l: 'Sistema' }, { v: 'assembly', l: 'Conjunto' }, { v: 'component', l: 'Componente' }, { v: 'cause', l: 'Causa' }, { v: 'mode', l: 'Modo de falla' },
] as const;
const ACTOR = [
  { v: 'cost', l: 'Costo' }, { v: 'costPerKm', l: 'Costo por km' }, { v: 'failures', l: 'Nº de fallas' }, { v: 'availability', l: 'Menor disponibilidad' },
] as const;

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={`h-8 rounded-full border px-3 text-xs font-medium ${value === o.v ? 'border-brand bg-brand text-white' : 'border-line text-muted hover:border-brand hover:text-brand'}`}>{o.l}</button>
      ))}
    </div>
  );
}

function Pareto({ q }: { q: string }) {
  const [by, setBy] = useState<(typeof BY)[number]['v']>('system');
  const [metric, setMetric] = useState<'count' | 'cost'>('count');
  const [rows, setRows] = useState<ParetoRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setRows(null); void api<ParetoRow[]>(`/kpi/pareto?${q}&by=${by}&metric=${metric}`).then(setRows).catch(() => setRows([])); }, [q, by, metric]);
  const max = rows?.[0]?.value ?? 0;
  const total = (rows ?? []).reduce((a, r) => a + r.value, 0);
  const vital = (rows ?? []).filter((r) => r.vital).length;
  const show = (v: number) => (metric === 'cost' ? millions(v) : String(Math.round(v)));
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Pareto de fallas</h2>
        <p className="text-sm text-muted">OT correctivas del periodo (incluye el historial). Los primeros {vital || '—'} de {rows?.length ?? '—'} grupos explican el 80 % {metric === 'cost' ? 'del costo' : 'de las fallas'}: ahí se concentra la mejora. Toque una fila para ver sus OT.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Segmented label="Agrupar por" value={by} options={BY} onChange={(v) => { setBy(v); setOpen(null); }} />
        <Segmented label="Medir por" value={metric} options={[{ v: 'count', l: 'Nº de fallas' }, { v: 'cost', l: 'Costo' }] as const} onChange={setMetric} />
      </div>
      {!rows && <p className="text-sm text-muted">Calculando…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No hay OT correctivas en el periodo.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed text-sm">
            <colgroup><col className="w-7" /><col /><col className="w-[38%]" /><col className="w-16" /><col className="w-16" /></colgroup>
            <thead className="text-left text-xs text-muted uppercase">
              <tr><th className="py-2 pr-2" /><th className="py-2 pr-3">{BY.find((b) => b.v === by)!.l}</th><th className="py-2 pr-3">{metric === 'cost' ? 'Costo' : 'Fallas'}</th><th className="py-2 pr-3 text-right">%</th><th className="py-2 text-right">Acum.</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const firstTrivial = !r.vital && (i === 0 || rows[i - 1]!.vital);
                return (
                  <Fragment key={r.key}>
                    {firstTrivial && <tr><td colSpan={5} className="py-1"><div className="flex items-center gap-2 text-[11px] text-muted"><span className="h-px flex-1 border-t border-dashed border-ink/40" />80 % {metric === 'cost' ? 'del costo' : 'de las fallas'}<span className="h-px flex-1 border-t border-dashed border-ink/40" /></div></td></tr>}
                    <tr className={`cursor-pointer border-t border-line hover:bg-canvas ${r.vital ? '' : 'text-muted'}`} onClick={() => setOpen(open === r.key ? null : r.key)}>
                      <td className="py-2 pr-2 text-muted">{open === r.key ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                      <td className="truncate py-2 pr-3" title={r.name}><span className={r.vital ? 'font-medium' : ''}>{r.name}</span> <span className="text-xs text-muted">{r.key.includes('SIN_') ? '' : r.key}</span></td>
                      <td className="py-2 pr-3"><div className="flex items-center gap-2"><InlineBar value={r.value} max={max} /><span className="w-16 shrink-0 text-right tabular-nums">{show(r.value)}</span></div></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.share, 'pct')}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(r.cumulative, 'pct')}</td>
                    </tr>
                    {open === r.key && (
                      <tr><td /><td colSpan={4} className="pb-3">
                        <ul className="max-h-64 divide-y divide-line overflow-auto rounded-lg border border-line text-xs">
                          {r.orders.map((o) => (
                            <li key={o.id}><Link href={`/ot/${o.id}`} className="flex gap-3 px-3 py-1.5 hover:bg-canvas">
                              <span className="w-28 shrink-0 font-medium whitespace-nowrap text-brand">{o.number}</span><span className="w-14 shrink-0">{o.plate}</span><span className="w-20 shrink-0 text-muted">{o.date}</span>
                              <span className="w-24 shrink-0 text-right whitespace-nowrap tabular-nums">{money(o.cost)}</span><span className="min-w-0 flex-1 truncate text-muted">{o.description}</span>
                            </Link></li>
                          ))}
                        </ul>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot><tr className="border-t border-line text-xs text-muted"><td /><td className="py-2">Total</td><td className="py-2 pr-3 text-right tabular-nums">{show(total)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function BadActors({ q }: { q: string }) {
  const [metric, setMetric] = useState<(typeof ACTOR)[number]['v']>('cost');
  const [rows, setRows] = useState<BadActor[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { setRows(null); void api<BadActor[]>(`/kpi/bad-actors?${q}&metric=${metric}`).then(setRows).catch(() => setRows([])); }, [q, metric]);
  const val = (r: BadActor) => (metric === 'cost' ? r.cost : metric === 'failures' ? r.failures : metric === 'costPerKm' ? (r.costPerKm ?? 0) : r.availability == null ? 0 : 1 - r.availability);
  const list = (rows ?? []).slice(0, all ? undefined : 10);
  const max = Math.max(0, ...list.map(val));
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Vehículos con más problemas</h2>
        <p className="text-sm text-muted">Los 10 primeros según la medida elegida. Candidatos a revisión de plan, análisis de causa o reemplazo. Costo sin siniestros; costo/km solo con 1 000 km o más en el periodo.</p>
      </div>
      <Segmented label="Ordenar por" value={metric} options={ACTOR} onChange={setMetric} />
      {!rows && <p className="text-sm text-muted">Calculando…</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted uppercase">
              <tr><th className="py-2 pr-2">#</th><th className="py-2 pr-3">Placa</th><th className="w-1/4 py-2 pr-3" /><th className="py-2 pr-3 text-right">Fallas</th><th className="py-2 pr-3 text-right">Costo</th><th className="py-2 pr-3 text-right">Km</th><th className="py-2 pr-3 text-right">Costo/km</th><th className="py-2 pr-3 text-right">Km entre fallas</th><th className="py-2 text-right">Disponib.</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((r, i) => (
                <tr key={r.id}>
                  <td className="py-2 pr-2 text-muted">{i + 1}</td>
                  <td className="py-2 pr-3 whitespace-nowrap"><Link href={`/vehiculos/${r.id}`} className="font-medium text-brand hover:underline">{r.plate}</Link><p className="max-w-48 truncate text-xs text-muted">{r.model} · {r.site}{r.status === 'retired' ? ' · de baja' : ''}</p></td>
                  <td className="py-2 pr-3"><InlineBar value={val(r)} max={max} /></td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.failures}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{millions(r.cost)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{r.km.toLocaleString('es-CO')}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{fmt(r.costPerKm, 'cop_km')}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{fmt(r.kmBetweenFailures, 'km')}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(r.availability, 'pct')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(rows?.length ?? 0) > 10 && <button onClick={() => setAll(!all)} className="mt-2 text-sm text-brand hover:underline">{all ? 'Ver solo los 10 primeros' : `Ver los ${rows!.length} vehículos`}</button>}
        </div>
      )}
    </Card>
  );
}

export default function ReliabilityPage() {
  const [f, setF] = useKpiFilters();
  const [error, setError] = useState<string | null>(null);
  const q = query(f);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Confiabilidad</h1>
        <p className="text-muted">Dónde se concentran las fallas y el costo, y qué vehículos más lo generan.</p>
      </div>
      <KpiFilterBar value={f} onChange={setF} onError={setError} />
      {error && <Alert>{error}</Alert>}
      <Pareto q={q} />
      <BadActors q={q} />
    </div>
  );
}
