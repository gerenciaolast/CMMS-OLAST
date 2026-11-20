'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Component { code: string; name: string; level: number }
interface Site { id: string; code: string; name: string }
interface Note { id: string; kind: string; title: string; body: string; link: string | null; createdAt: string }

const ROADMAP = [
  ['S5', 'Indicadores', '14 KPI, Pareto de fallas y vehículos con más fallas'],
] as const;

export default function Home() {
  const { me, can } = useSession();
  const [systems, setSystems] = useState<Component[]>([]);
  const [pmAlerts, setPmAlerts] = useState<{ overdue: number; due: number } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<number | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [docs, setDocs] = useState<{ expired: number; soon: number; licenses: number } | null>(null);
  const [daily, setDaily] = useState<{ expected: number; done: number } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    void api<Component[]>('/catalog/components?level=1').then(setSystems).catch(() => undefined);
    void api<Site[]>('/sites').then(setSites).catch(() => undefined);
    if (can('work_order.view')) {
      void api<{ status: string }[]>('/pm/forecast?status=due,overdue')
        .then((r) => setPmAlerts({ overdue: r.filter((x) => x.status === 'overdue').length, due: r.filter((x) => x.status === 'due').length }))
        .catch(() => undefined);
      void api<{ pendingRequests: number }>('/work-orders/summary').then((r) => setPendingRequests(r.pendingRequests)).catch(() => undefined);
      void api<{ expected: number; done: number }>('/inspections/daily').then(setDaily).catch(() => undefined);
    }
    if (can('work_order.view') || can('vehicle.edit'))
      void api<{ documents: { level: string | null }[]; licenses: { level: string | null }[] }>('/documents/overview')
        .then((r) => setDocs({
          expired: r.documents.filter((d) => d.level === 'expired').length,
          soon: r.documents.filter((d) => d.level === 'urgent' || d.level === 'soon').length,
          licenses: r.licenses.filter((d) => d.level === 'expired' || d.level === 'urgent').length,
        }))
        .catch(() => undefined);
    void api<Note[]>('/notifications').then((r) => setNotes(r.filter((n) => Date.now() - new Date(n.createdAt).getTime() < 7 * 86_400_000).slice(0, 5))).catch(() => undefined);
  }, [can]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {me?.fullName.split(' ')[0]}</h1>
        <p className="text-muted">Sistema de gestión de mantenimiento de la flota OLAST.</p>
      </div>
      {((pmAlerts && pmAlerts.overdue + pmAlerts.due > 0) || (pendingRequests ?? 0) > 0 || (docs && docs.expired + docs.soon + docs.licenses > 0) || (daily && daily.done < daily.expected)) && (
        <Card className="border-warn/40 bg-warn/5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-warn"><AlertTriangle size={18} /> Requiere atención</h2>
          <ul className="space-y-1 text-sm">
            {pmAlerts && pmAlerts.overdue > 0 && <li><Link href="/preventivo" className="font-medium text-danger underline">{pmAlerts.overdue} preventivo(s) vencido(s)</Link></li>}
            {pmAlerts && pmAlerts.due > 0 && <li><Link href="/preventivo" className="font-medium underline">{pmAlerts.due} preventivo(s) por ejecutar (OT ya generada)</Link></li>}
            {(pendingRequests ?? 0) > 0 && <li><Link href="/avisos" className="font-medium underline">{pendingRequests} aviso(s) de falla por revisar</Link></li>}
            {docs && docs.expired > 0 && <li><Link href="/documentos" className="font-medium text-danger underline">{docs.expired} documento(s) vencido(s)</Link></li>}
            {docs && docs.soon > 0 && <li><Link href="/documentos" className="font-medium underline">{docs.soon} documento(s) vencen en 15 días o menos</Link></li>}
            {docs && docs.licenses > 0 && <li><Link href="/documentos" className="font-medium underline">{docs.licenses} licencia(s) de conducción vencida(s) o por vencer</Link></li>}
            {daily && daily.done < daily.expected && <li><Link href="/inspeccion" className="font-medium underline">Inspección diaria: {daily.done} de {daily.expected} vehículos operativos hoy</Link></li>}
          </ul>
        </Card>
      )}
      {can('inspection.perform') && !can('work_order.view') && (
        <Link href="/inspeccion" className="flex items-center justify-center gap-3 rounded-2xl bg-brand p-6 text-lg font-semibold text-white shadow-sm hover:bg-brand-600">
          <ClipboardCheck size={28} /> Hacer la inspección diaria
        </Link>
      )}
      {notes.length > 0 && (
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Bell size={18} /> Notificaciones recientes</h2>
          <ul className="divide-y divide-line text-sm">
            {notes.map((n) => (
              <li key={n.id} className="py-2">
                {n.link ? <Link href={n.link} className={`font-medium hover:underline ${n.kind === 'critical_defect' ? 'text-danger' : ''}`}>{n.title}</Link> : <p className="font-medium">{n.title}</p>}
                <p className="text-muted">{n.body}</p>
                <p className="text-xs text-muted">{new Date(n.createdAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </li>
            ))}
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
