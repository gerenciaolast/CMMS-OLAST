'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Component { code: string; name: string; level: number }
interface Site { id: string; code: string; name: string }

const ROADMAP = [
  ['S4', 'Inspección diaria y documentos', 'Checklist en el celular, bloqueo por defecto crítico, SOAT y técnico-mecánica'],
  ['S5', 'Indicadores', '14 KPI, Pareto de fallas y vehículos con más fallas'],
] as const;

export default function Home() {
  const { me, can } = useSession();
  const [systems, setSystems] = useState<Component[]>([]);
  const [pmAlerts, setPmAlerts] = useState<{ overdue: number; due: number } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<number | null>(null);
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    void api<Component[]>('/catalog/components?level=1').then(setSystems).catch(() => undefined);
    void api<Site[]>('/sites').then(setSites).catch(() => undefined);
    if (can('work_order.view')) {
      void api<{ status: string }[]>('/pm/forecast?status=due,overdue')
        .then((r) => setPmAlerts({ overdue: r.filter((x) => x.status === 'overdue').length, due: r.filter((x) => x.status === 'due').length }))
        .catch(() => undefined);
      void api<{ pendingRequests: number }>('/work-orders/summary').then((r) => setPendingRequests(r.pendingRequests)).catch(() => undefined);
    }
  }, [can]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {me?.fullName.split(' ')[0]}</h1>
        <p className="text-muted">Sistema de gestión de mantenimiento de la flota OLAST.</p>
      </div>
      {((pmAlerts && pmAlerts.overdue + pmAlerts.due > 0) || (pendingRequests ?? 0) > 0) && (
        <Card className="border-warn/40 bg-warn/5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-warn"><AlertTriangle size={18} /> Requiere atención</h2>
          <ul className="space-y-1 text-sm">
            {pmAlerts && pmAlerts.overdue > 0 && <li><Link href="/preventivo" className="font-medium text-danger underline">{pmAlerts.overdue} preventivo(s) vencido(s)</Link></li>}
            {pmAlerts && pmAlerts.due > 0 && <li><Link href="/preventivo" className="font-medium underline">{pmAlerts.due} preventivo(s) por ejecutar (OT ya generada)</Link></li>}
            {(pendingRequests ?? 0) > 0 && <li><Link href="/avisos" className="font-medium underline">{pendingRequests} aviso(s) de falla por revisar</Link></li>}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Sedes visibles</p>
          <p className="text-3xl font-bold">{sites.length}</p>
          <p className="mt-1 truncate text-sm text-muted">{sites.map((s) => s.name).join(' · ')}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Sistemas del catálogo</p>
          <p className="text-3xl font-bold">{systems.length}</p>
          <p className="mt-1 text-sm text-muted">Compatible con VMRS</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Su rol</p>
          <p className="text-xl font-bold">{me?.role.name}</p>
          <p className="mt-1 text-sm text-muted">{me?.permissions.length} permisos</p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Próximas entregas</h2>
        <ol className="space-y-3">
          {ROADMAP.map(([s, t, d]) => (
            <li key={s} className="flex gap-3">
              <span className="h-6 shrink-0 rounded bg-sky/30 px-2 text-sm font-semibold text-brand-800">{s}</span>
              <div>
                <p className="font-medium">{t}</p>
                <p className="text-sm text-muted">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
