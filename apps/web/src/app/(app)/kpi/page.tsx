'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Info, Table2, BarChart3 } from 'lucide-react';
import { Alert, Card } from '@/components/ui';
import { LightBadge, Sparkline, StackedColumns } from '@/components/charts';
import { KpiFilterBar, useKpiFilters } from '@/components/kpi-filters';
import { api, ApiError } from '@/lib/api';
import { COST_SERIES, MONTH, fmt, millions, money, query, type Dashboard, type Kpi } from '@/lib/kpi';

/** «dic», y el año solo en enero: «ene 26». */
const shortMonth = (m: string) => {
  const t = MONTH(m).split(' ');
  return m.endsWith('-01') ? MONTH(m).replace(' de ', ' ') : t[0]!;
};

function KpiCard({ k }: { k: Kpi }) {
  const [info, setInfo] = useState(false);
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-tight font-medium"><span className="text-muted">{k.n}.</span> {k.name}</p>
        <button onClick={() => setInfo(!info)} className="shrink-0 text-muted hover:text-brand" aria-label="Cómo se calcula" aria-expanded={info}><Info size={16} /></button>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-2xl font-bold tabular-nums">{fmt(k.value, k.unit)}</p>
        <LightBadge light={k.light} />
      </div>
      <p className="text-xs text-muted">Meta: {k.targetLabel}{k.detail ? ` · ${k.detail}` : ''}</p>
      {info && <p className="rounded-md bg-canvas p-2 text-xs text-muted">{k.scope}</p>}
      {k.trend.length > 0 && <div className="mt-auto pt-6"><Sparkline points={k.trend} format={(v) => fmt(v, k.unit)} /></div>}
    </Card>
  );
}

export default function KpiPage() {
  const [f, setF] = useKpiFilters();
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    setError(null);
    api<Dashboard>(`/kpi/dashboard?${query(f)}`).then(setD).catch((e) => setError(e instanceof ApiError ? e.message : 'No fue posible calcular los indicadores'));
  }, [f]);

  const rows = (d?.costByMonth ?? []).map((m) => ({
    label: shortMonth(m.month),
    values: Object.fromEntries(COST_SERIES.map((s) => [s.key, s.types.reduce((a, t) => a + (Number(m[t]) || 0), 0)])),
  }));
  const s = d?.summary;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Indicadores</h1>
        <p className="text-muted">Los 14 indicadores del modelo con su meta y la tendencia de los últimos 6 meses. Toque <Info size={14} className="inline" /> para ver cómo se calcula cada uno y qué datos incluye.</p>
      </div>
      <KpiFilterBar value={f} onChange={setF} onError={setError} />
      {error && <Alert>{error}</Alert>}
      {!d && !error && <p className="text-muted">Calculando…</p>}
      {d && s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4"><p className="text-sm text-muted">Costo de mantenimiento</p><p className="text-2xl font-bold tabular-nums">{millions(s.totalCost)}</p><p className="text-xs text-muted">{s.orders} OT terminadas · {d.vehicles} vehículos activos</p></Card>
            <Card className="p-4"><p className="text-sm text-muted">Preventivo / total</p><p className="text-2xl font-bold tabular-nums">{s.totalCost ? fmt(s.preventiveCost / s.totalCost, 'pct') : '—'}</p><p className="text-xs text-muted">{millions(s.preventiveCost)} preventivo · {millions(s.correctiveCost)} resto</p></Card>
            <Card className="p-4"><p className="text-sm text-muted">Km recorridos</p><p className="text-2xl font-bold tabular-nums">{fmt(s.km, 'km')}</p><p className="text-xs text-muted">Según lecturas y km de las OT</p></Card>
            <Card className="p-4"><p className="text-sm text-muted">Costo por km</p><p className="text-2xl font-bold tabular-nums">{fmt(d.kpis.find((k) => k.code === 'cost_per_km')?.value, 'cop_km')}</p><p className="text-xs text-muted">Sin siniestros</p></Card>
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Costo por mes y tipo de mantenimiento</h2>
              <button onClick={() => setTable(!table)} className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                {table ? <><BarChart3 size={16} /> Ver gráfico</> : <><Table2 size={16} /> Ver tabla</>}
              </button>
            </div>
            {table ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted uppercase"><tr><th className="py-1 pr-3">Mes</th>{COST_SERIES.map((c) => <th key={c.key} className="py-1 pr-3 text-right">{c.label}</th>)}<th className="py-1 text-right">Total</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r, i) => <tr key={r.label}><td className="py-1 pr-3">{r.label}</td>{COST_SERIES.map((c) => <td key={c.key} className="py-1 pr-3 text-right tabular-nums">{r.values[c.key] ? money(r.values[c.key]!) : '—'}</td>)}<td className="py-1 text-right font-medium tabular-nums">{money(Number(d.costByMonth[i]!.total))}</td></tr>)}
                  </tbody>
                </table>
              </div>
            ) : (
              <StackedColumns rows={rows} series={COST_SERIES} format={millions} />
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.kpis.map((k) => <KpiCard key={k.code} k={k} />)}
          </div>
          <p className="text-sm text-muted">El historial migrado del Excel trae fecha, km, costo y componente, pero no tiempos de reparación, prioridad ni programación: por eso los indicadores de tiempos se llenan a medida que las OT se registran en el CMMS. Análisis de fallas en <Link href="/confiabilidad" className="text-brand hover:underline">Confiabilidad</Link>.</p>
        </>
      )}
    </div>
  );
}
