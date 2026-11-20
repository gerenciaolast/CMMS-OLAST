'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FileText, IdCard } from 'lucide-react';
import { Alert, Badge, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { day } from '@/lib/fleet';

type Level = 'expired' | 'urgent' | 'soon' | 'notice' | 'missing' | null;
interface DocRow { vehicleId: string; plate: string; site: string; status: string; type: string; typeName: string; blocking: boolean; expiresAt: string | null; daysLeft: number | null; level: Level }
interface LicenseRow { driverId: string; name: string; category: string | null; expiresAt: string | null; daysLeft: number | null; level: Level }

const LEVEL: Record<Exclude<Level, null> | 'ok', { label: string; tone: string; rank: number }> = {
  expired: { label: 'Vencido', tone: 'border-danger bg-danger text-white', rank: 0 },
  missing: { label: 'Sin registrar', tone: 'border-dashed border-warn/60 text-warn', rank: 1 },
  urgent: { label: '≤ 7 días', tone: 'border-danger/50 text-danger', rank: 2 },
  soon: { label: '≤ 15 días', tone: 'border-warn/50 text-warn', rank: 3 },
  notice: { label: '≤ 30 días', tone: 'border-warn/40 text-warn', rank: 4 },
  ok: { label: 'Vigente', tone: 'border-ok/40 text-ok', rank: 5 },
};
const lv = (l: Level) => LEVEL[l ?? 'ok'];
const when = (r: { expiresAt: string | null; daysLeft: number | null }) =>
  !r.expiresAt ? '—' : `${day(r.expiresAt)} · ${r.daysLeft! < 0 ? `hace ${-r.daysLeft!} d` : r.daysLeft === 0 ? 'hoy' : `en ${r.daysLeft} d`}`;

/** Documentos del vehículo y licencias (doc 02 P9): alertas a 30/15/7 días; los obligatorios vencidos inmovilizan el vehículo. */
export default function DocumentsPage() {
  const [data, setData] = useState<{ documents: DocRow[]; licenses: LicenseRow[] } | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { void api<{ documents: DocRow[]; licenses: LicenseRow[] }>('/documents/overview').then(setData); }, []);

  const docs = useMemo(() => (data?.documents ?? []).filter((d) => all || d.level).sort((a, b) => lv(a.level).rank - lv(b.level).rank || (a.daysLeft ?? 0) - (b.daysLeft ?? 0)), [data, all]);
  const lic = useMemo(() => (data?.licenses ?? []).filter((d) => all || d.level).sort((a, b) => lv(a.level).rank - lv(b.level).rank || (a.daysLeft ?? 0) - (b.daysLeft ?? 0)), [data, all]);
  if (!data) return <p className="text-muted">Cargando…</p>;
  const count = (l: Level) => data.documents.filter((d) => d.level === l).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Documentos y vencimientos</h1>
        <p className="text-muted">SOAT, técnico-mecánica y demás documentos de la flota, y licencias de los conductores. Avisos por correo a 30, 15 y 7 días. Un documento obligatorio vencido deja el vehículo <strong>fuera de servicio administrativo</strong> hasta que se registre la renovación.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['expired', 'missing', 'urgent', 'soon'] as const).map((l) => (
          <Card key={l} className="py-3"><p className="text-sm text-muted">{LEVEL[l].label}</p><p className={`text-2xl font-bold ${count(l) ? (l === 'expired' || l === 'urgent' ? 'text-danger' : 'text-warn') : ''}`}>{count(l)}</p></Card>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-brand" /> Mostrar también los vigentes</label>

      <Card className="overflow-x-auto p-0">
        <h2 className="flex items-center gap-2 px-4 pt-4 font-semibold"><FileText size={18} /> Vehículos</h2>
        {docs.length === 0 ? <p className="p-4 text-sm text-muted">Nada por vencer en los próximos 30 días.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead className="border-y border-line bg-canvas text-left text-xs tracking-wide text-muted uppercase">
              <tr><th className="px-4 py-2">Placa</th><th className="px-4 py-2">Sede</th><th className="px-4 py-2">Documento</th><th className="px-4 py-2">Vence</th><th className="px-4 py-2">Estado</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {docs.map((d) => (
                <tr key={`${d.vehicleId}-${d.type}`}>
                  <td className="px-4 py-2 font-medium"><Link href={`/vehiculos/${d.vehicleId}`} className="text-brand hover:underline">{d.plate}</Link></td>
                  <td className="px-4 py-2">{d.site}</td>
                  <td className="px-4 py-2">{d.typeName}{d.blocking && <span className="ml-1 text-xs text-muted">(obligatorio)</span>}</td>
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">{when(d)}</td>
                  <td className="px-4 py-2"><Badge className={lv(d.level).tone}>{lv(d.level).label}</Badge>{d.status === 'out_of_service_administrative' && d.level === 'expired' && <span className="ml-1 text-xs text-danger">inmovilizado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="flex items-center gap-2 px-4 pt-4 font-semibold"><IdCard size={18} /> Licencias de conducción</h2>
        {lic.length === 0 ? <p className="p-4 text-sm text-muted">Ninguna licencia por vencer.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead className="border-y border-line bg-canvas text-left text-xs tracking-wide text-muted uppercase">
              <tr><th className="px-4 py-2">Conductor</th><th className="px-4 py-2">Categoría</th><th className="px-4 py-2">Vence</th><th className="px-4 py-2">Estado</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lic.map((d) => (
                <tr key={d.driverId}>
                  <td className="px-4 py-2 font-medium"><Link href="/conductores" className="text-brand hover:underline">{d.name}</Link></td>
                  <td className="px-4 py-2">{d.category ?? '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">{when(d)}</td>
                  <td className="px-4 py-2"><Badge className={lv(d.level).tone}>{lv(d.level).label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Alert tone="warn">Las fechas se actualizan desde la hoja de vida de cada vehículo (tarjeta «Documentos») o en bloque con la plantilla de Excel.</Alert>
    </div>
  );
}
