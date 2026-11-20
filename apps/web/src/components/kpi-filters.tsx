'use client';
import { useEffect, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { SecondaryButton } from '@/components/ui';
import { api, apiDownload, ApiError } from '@/lib/api';
import { defaultFilters, query, type Filters } from '@/lib/kpi';

const KEY = 'cmms.kpi.filters';

/** Filtros del tablero (compartidos entre Indicadores y Confiabilidad durante la sesión). */
export function useKpiFilters() {
  const [f, setF] = useState<Filters>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(KEY) : null;
      return raw ? { ...defaultFilters(), ...(JSON.parse(raw) as Partial<Filters>) } : defaultFilters();
    } catch {
      return defaultFilters();
    }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(KEY, JSON.stringify(f)); } catch { /* sin almacenamiento */ }
  }, [f]);
  return [f, setF] as const;
}

const PRESETS: { label: string; months: number | 'ytd' }[] = [
  { label: '3 meses', months: 3 }, { label: '12 meses', months: 12 }, { label: 'Año actual', months: 'ytd' }, { label: '24 meses', months: 24 },
];
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

export function KpiFilterBar({ value, onChange, onError }: { value: Filters; onChange: (f: Filters) => void; onError?: (m: string) => void }) {
  const [sites, setSites] = useState<{ code: string; name: string }[]>([]);
  const [types, setTypes] = useState<{ code: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ code: string; name: string }[]>('/sites').then(setSites).catch(() => undefined);
    void api<{ code: string; name: string }[]>('/catalog/vehicle-types').then(setTypes).catch(() => undefined);
  }, []);
  const set = (p: Partial<Filters>) => onChange({ ...value, ...p });
  const preset = (m: number | 'ytd') => {
    const now = new Date();
    const from = m === 'ytd' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth() - (m - 1), 1);
    set({ from: iso(from), to: iso(now) });
  };
  const cls = 'h-10 rounded-lg border border-line bg-surface px-2 text-sm';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">Desde<input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} className={`${cls} mt-0.5 block`} /></label>
        <label className="text-xs text-muted">Hasta<input type="date" value={value.to} onChange={(e) => set({ to: e.target.value })} className={`${cls} mt-0.5 block`} /></label>
        <label className="text-xs text-muted">Sede
          <select value={value.site} onChange={(e) => set({ site: e.target.value })} className={`${cls} mt-0.5 block`}>
            <option value="">Todas</option>{sites.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Tipo de vehículo
          <select value={value.type} onChange={(e) => set({ type: e.target.value })} className={`${cls} mt-0.5 block`}>
            <option value="">Todos</option>{types.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
        <SecondaryButton disabled={busy} className="ml-auto"
          onClick={async () => {
            setBusy(true);
            try { await apiDownload(`/kpi/export?${query(value)}`, 'Indicadores_OLAST.xlsx'); }
            catch (e) { onError?.(e instanceof ApiError ? e.message : 'No fue posible exportar'); }
            finally { setBusy(false); }
          }}>
          <FileSpreadsheet size={16} /> {busy ? 'Generando…' : 'Exportar a Excel'}
        </SecondaryButton>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => <button key={p.label} onClick={() => preset(p.months)} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-brand hover:text-brand">{p.label}</button>)}
      </div>
    </div>
  );
}
