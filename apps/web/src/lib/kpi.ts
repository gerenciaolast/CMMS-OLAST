export type KpiUnit = 'pct' | 'km' | 'h' | 'cop_km' | 'weeks';
export type Light = 'ok' | 'warn' | 'bad' | null;
export interface Kpi {
  code: string; n: number; name: string; unit: KpiUnit; value: number | null; detail: string; light: Light;
  targetLabel: string; scope: string; direction: 'higher' | 'lower' | 'range'; trend: { month: string; value: number | null }[];
}
export interface Dashboard {
  period: { from: string; to: string }; vehicles: number;
  summary: { orders: number; totalCost: number; preventiveCost: number; correctiveCost: number; km: number };
  kpis: Kpi[]; costByMonth: ({ month: string; total: number } & Record<string, number | string>)[];
}
export interface ParetoRow { key: string; name: string; value: number; share: number; cumulative: number; vital: boolean; orders: { id: string; number: string; plate: string; date: string; cost: number; description: string }[] }
export interface BadActor { id: string; plate: string; site: string; model: string; type: string; status: string; orders: number; failures: number; cost: number; km: number; costPerKm: number | null; kmBetweenFailures: number | null; availability: number | null }
export interface Filters { from: string; to: string; site: string; type: string }

const nf = (d = 0) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d });
export function fmt(v: number | null | undefined, unit: KpiUnit): string {
  if (v == null) return '—';
  switch (unit) {
    case 'pct': return `${nf(v >= 0.995 || v === 0 ? 0 : 1).format(v * 100)} %`;
    case 'km': return `${nf().format(v)} km`;
    case 'h': return `${nf(1).format(v)} h`;
    case 'cop_km': return `$${nf().format(v)}/km`;
    case 'weeks': return `${nf(1).format(v)} sem`;
  }
}
export const money = (v: number) => `$${nf().format(v)}`;
/** Millones: $12,3 M. */
export const millions = (v: number) => `$${nf(Math.abs(v) >= 10_000_000 ? 0 : 1).format(v / 1_000_000)} M`;
export const MONTH = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }).replace('.', '');

export function query(f: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams(extra);
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

/** Grupos de costo para el gráfico (≤ 4 series, orden fijo; el color sigue al grupo). */
export const COST_SERIES = [
  { key: 'prev', label: 'Preventivo', types: ['PM', 'INS', 'PDM'], color: 'var(--color-series-1)' },
  { key: 'corr', label: 'Correctivo', types: ['CP', 'CE', 'AUX'], color: 'var(--color-series-2)' },
  { key: 'sin', label: 'Siniestro', types: ['SIN'], color: 'var(--color-series-3)' },
  { key: 'otr', label: 'Mejora y campañas', types: ['MEJ', 'CAM'], color: 'var(--color-series-4)' },
] as const;

export function defaultFilters(): Filters {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: d(from), to: d(now), site: '', type: '' };
}
