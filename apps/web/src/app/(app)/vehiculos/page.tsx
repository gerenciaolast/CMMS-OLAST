'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Search } from 'lucide-react';
import { Badge, Card, CriticalityBadge, Progress, SecondaryButton } from '@/components/ui';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { STATUS_LABEL, STATUS_TONE, daysUntil, shortDay, km, type VehicleSummary } from '@/lib/fleet';
import type { VehicleStatus } from '@cmms/shared';

interface Site { code: string; name: string }

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </Card>
  );
}

function Expiry({ v }: { v: VehicleSummary }) {
  if (!v.nextExpiry) return <span className="text-muted">—</span>;
  const d = daysUntil(v.nextExpiry.expiresAt);
  const tone = d < 0 ? 'text-danger font-semibold' : d <= 30 ? 'text-warn font-semibold' : '';
  return <span className={tone}>{v.nextExpiry.code} · {d < 0 ? `vencido hace ${-d} d` : `${d} d`}</span>;
}

export default function FleetPage() {
  const { can } = useSession();
  const [rows, setRows] = useState<VehicleSummary[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Site[]>('/sites').then(setSites).catch(() => undefined);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (site) p.set('site', site);
    if (status) p.set('status', status);
    if (onlyIncomplete) p.set('incomplete', 'true');
    const t = setTimeout(() => {
      if (q.trim()) p.set('q', q.trim());
      api<VehicleSummary[]>(`/vehicles?${p}`).then(setRows).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [site, status, q, onlyIncomplete]);

  const stats = useMemo(() => {
    const r = rows ?? [];
    return {
      total: r.length,
      operating: r.filter((v) => v.status.startsWith('operational')).length,
      down: r.filter((v) => v.status.startsWith('out_of_service')).length,
      incomplete: r.filter((v) => v.missing.length > 0).length,
    };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Flota</h1>
          <p className="text-muted">Hoja de vida, estado y kilometraje de cada vehículo.</p>
        </div>
        {can('vehicle.edit') && (
          <Link href="/vehiculos/importar"><SecondaryButton><FileSpreadsheet size={16} /> Plantilla Excel</SecondaryButton></Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Vehículos" value={stats.total} />
        <Stat label="Operando" value={stats.operating} tone="text-ok" />
        <Stat label="Fuera de servicio" value={stats.down} tone={stats.down ? 'text-danger' : ''} />
        <Stat label="Fichas incompletas" value={stats.incomplete} tone={stats.incomplete ? 'text-warn' : ''} />
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_180px_220px_auto] md:items-end">
        <label className="relative block">
          <span className="sr-only">Buscar</span>
          <Search className="absolute top-3 left-3 text-muted" size={18} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa o línea" className="h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-10" />
        </label>
        <select aria-label="Sede" value={site} onChange={(e) => setSite(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-3">
          <option value="">Todas las sedes</option>
          {sites.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-3">
          <option value="">Todos los estados activos</option>
          {(Object.keys(STATUS_LABEL) as VehicleStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="flex h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} className="h-4 w-4 accent-brand" />
          Solo fichas incompletas
        </label>
      </div>

      {error && <p className="text-danger">{error}</p>}
      {!rows && !error && <p className="text-muted">Cargando…</p>}
      {rows && rows.length === 0 && <Card><p className="text-muted">No hay vehículos con esos filtros.</p></Card>}

      {rows && rows.length > 0 && (
        <>
          {/* Escritorio: tabla */}
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Placa</th>
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Sede</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Kilometraje</th>
                  <th className="px-4 py-3">Criticidad</th>
                  <th className="px-4 py-3">Ficha</th>
                  <th className="px-4 py-3">Próx. vencimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v) => (
                  <tr key={v.id} className="hover:bg-sky/10">
                    <td className="px-4 py-3">
                      <Link href={`/vehiculos/${v.id}`} className="font-semibold text-brand hover:underline">{v.plate}</Link>
                    </td>
                    <td className="max-w-64 px-4 py-3">
                      <p className="truncate">{v.vehicleModel.make} {v.vehicleModel.model}</p>
                      <p className="text-xs text-muted">{v.year ?? 'año —'} · {v.vehicleModel.vehicleType.code}</p>
                    </td>
                    <td className="px-4 py-3">{v.site.name}</td>
                    <td className="px-4 py-3"><Badge className={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {km(v.currentOdometer)}
                      <p className="text-xs text-muted">{v.lastReadingAt ? shortDay(v.lastReadingAt) : 'sin lectura'}</p>
                    </td>
                    <td className="px-4 py-3"><CriticalityBadge value={v.criticality} /></td>
                    <td className="px-4 py-3">{v.completeness != null ? <Progress value={v.completeness} /> : '—'}</td>
                    <td className="px-4 py-3"><Expiry v={v} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Celular: tarjetas */}
          <div className="space-y-3 md:hidden">
            {rows.map((v) => (
              <Link key={v.id} href={`/vehiculos/${v.id}`} className="block">
                <Card className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-brand">{v.plate}</p>
                      <p className="truncate text-sm text-muted">{v.vehicleModel.model} · {v.site.name}</p>
                    </div>
                    <CriticalityBadge value={v.criticality} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                    <span className="text-sm tabular-nums">{km(v.currentOdometer)}</span>
                  </div>
                  {v.missing.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-warn">
                      <AlertTriangle size={14} aria-hidden /> {v.missing.length} dato(s) pendiente(s) · ficha {v.completeness}%
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
