'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Modal, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { money, shortDay, type VehicleSummary } from '@/lib/fleet';
import { PRIORITY_LABEL, PRIORITY_TONE, WO_STATUS_LABEL, WO_STATUS_TONE, WO_TYPE_LABEL, type WoStatus, type WorkOrderRow } from '@/lib/maintenance';

interface Summary { byStatus: Partial<Record<WoStatus, number>>; byPriority: Record<string, number>; backlogHours: number; pendingRequests: number }
interface Site { code: string; name: string }
interface Supplier { id: string; name: string }

const VIEWS = [
  ['open', 'Abiertas'],
  ['completed', 'Por verificar'],
  ['closed', 'Cerradas'],
  ['all', 'Todas'],
] as const;

function NewOrder({ onCreated }: { onCreated: (id: string) => void }) {
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<VehicleSummary[]>('/vehicles').then(setVehicles);
    void api<Supplier[]>('/suppliers').then(setSuppliers).catch(() => undefined);
  }, []);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? '').trim() || undefined;
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ id: string }>('/work-orders', {
            method: 'POST',
            json: {
              vehicleId: s('vehicleId'), type: s('type'), priority: s('priority'), description: s('description'), workshopType: s('workshopType'),
              supplierId: s('supplierId') ?? null, plannedStart: s('plannedStart') ? new Date(String(s('plannedStart'))).toISOString() : undefined,
              estimatedHours: s('estimatedHours') ? Number(s('estimatedHours')) : undefined,
              tasks: (s('tasks') ?? '').split('\n').map((t) => t.trim()).filter((t) => t.length >= 2),
            },
          });
          onCreated(r.id);
        } catch (err) {
          const d = err instanceof ApiError ? (err.details as { message: string }[] | undefined) : undefined;
          setError(err instanceof ApiError ? (Array.isArray(d) && d.length ? d.map((x) => x.message).join('. ') : err.message) : 'No fue posible crear la OT');
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      <Select label="Vehículo" name="vehicleId" required defaultValue="">
        <option value="" disabled>Seleccione…</option>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.vehicleModel.model} · {v.site.name}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Tipo" name="type" defaultValue="PM">
          {Object.entries(WO_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select label="Prioridad" name="priority" defaultValue="P3">
          {Object.entries(PRIORITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      <Field label="Descripción" name="description" required minLength={5} placeholder="Ej.: Servicio de 10.000 km" />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Tareas (una por línea)</span>
        <textarea name="tasks" rows={4} placeholder={'Cambio de aceite y filtro\nGraduación de frenos\nEngrase general'} className="w-full rounded-lg border border-line bg-surface p-3" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Taller" name="workshopType" defaultValue="external"><option value="external">Externo</option><option value="internal">Interno</option></Select>
        <Select label="Proveedor" name="supplierId" defaultValue=""><option value="">—</option>{suppliers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha planeada" name="plannedStart" type="date" />
        <Field label="Horas estimadas" name="estimatedHours" type="number" min={0} step="0.5" />
      </div>
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creando…' : 'Crear OT'}</Button>
    </form>
  );
}

export default function WorkOrdersPage() {
  const { can } = useSession();
  const router = useRouter();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('open');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [site, setSite] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<WorkOrderRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void api<Summary>('/work-orders/summary').then(setSummary);
    void api<Site[]>('/sites').then(setSites);
  }, []);

  const load = useCallback(() => {
    const p = new URLSearchParams({ status: view, take: view === 'open' ? '300' : '200' });
    if (type) p.set('type', type);
    if (priority) p.set('priority', priority);
    if (site) p.set('site', site);
    if (q.trim()) p.set('q', q.trim());
    void api<WorkOrderRow[]>(`/work-orders?${p}`).then(setRows);
  }, [view, type, priority, site, q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const s = summary?.byStatus ?? {};
  const stats: [string, number | string, string][] = [
    ['Avisos por revisar', summary?.pendingRequests ?? '—', summary?.pendingRequests ? 'text-warn' : ''],
    ['Planificadas', s.planned ?? 0, ''],
    ['Programadas', s.scheduled ?? 0, ''],
    ['En ejecución', s.in_progress ?? 0, 'text-brand'],
    ['En espera', s.on_hold ?? 0, s.on_hold ? 'text-warn' : ''],
    ['Por verificar', s.completed ?? 0, s.completed ? 'text-ok' : ''],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de trabajo</h1>
          <p className="text-muted">Backlog, ejecución y cierre. Todo trabajo de mantenimiento se registra en una OT.</p>
        </div>
        {can('work_order.plan') && <Button onClick={() => setCreating(true)} className="h-10 gap-1.5"><Plus size={16} /> Nueva OT</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([l, v, tone]) => (
          <Card key={l} className="p-4">
            <p className="text-sm text-muted">{l}</p>
            <p className={`text-2xl font-bold ${tone}`}>{v}</p>
          </Card>
        ))}
      </div>
      {summary?.pendingRequests ? <Alert tone="warn"><Link href="/avisos" className="font-medium underline">Hay {summary.pendingRequests} aviso(s) de falla esperando revisión</Link></Alert> : null}

      <div className="flex flex-wrap gap-2">
        {VIEWS.map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`h-9 rounded-full border px-4 text-sm ${view === k ? 'border-brand bg-brand text-white' : 'border-line bg-surface hover:border-brand'}`}>{l}</button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_170px]">
        <label className="relative block">
          <Search className="absolute top-3 left-3 text-muted" size={18} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OT, placa o descripción" className="h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-10" />
        </label>
        <select aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-3">
          <option value="">Todos los tipos</option>
          {Object.entries(WO_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Prioridad" value={priority} onChange={(e) => setPriority(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-3">
          <option value="">Todas las prioridades</option>
          {Object.entries(PRIORITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Sede" value={site} onChange={(e) => setSite(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-3">
          <option value="">Todas las sedes</option>
          {sites.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
      </div>

      {!rows && <p className="text-muted">Cargando…</p>}
      {rows?.length === 0 && <Card><p className="text-muted">No hay órdenes con esos filtros.</p></Card>}
      {rows && rows.length > 0 && (
        <>
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs tracking-wide text-muted uppercase">
                <tr><th className="px-4 py-3">OT</th><th className="px-4 py-3">Vehículo</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Prior.</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3 text-right">Costo</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-sky/10" onClick={() => router.push(`/ot/${o.id}`)}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap text-brand">
                      <Link href={`/ot/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.number}</Link>
                      {o.isRework && <RotateCcw size={14} className="ml-1 inline text-danger" aria-label="Retrabajo" />}
                    </td>
                    <td className="px-4 py-3 font-medium">{o.vehicle.plate}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{WO_TYPE_LABEL[o.type] ?? o.type}</td>
                    <td className="px-4 py-3"><Badge className={PRIORITY_TONE[o.priority]}>{o.priority}</Badge></td>
                    <td className="px-4 py-3"><Badge className={WO_STATUS_TONE[o.status]}>{WO_STATUS_LABEL[o.status]}</Badge></td>
                    <td className="max-w-80 px-4 py-3"><p className="truncate">{o.description}</p>{o.isHistorical && <p className="text-xs text-muted">Historial importado</p>}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{shortDay(o.closedAt ?? o.plannedStart ?? o.createdAt)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{Number(o.totalCost) ? money(o.totalCost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-3 md:hidden">
            {rows.map((o) => (
              <Link key={o.id} href={`/ot/${o.id}`} className="block">
                <Card className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-brand">{o.number}</span>
                    <Badge className={PRIORITY_TONE[o.priority]}>{o.priority}</Badge>
                  </div>
                  <p className="text-sm"><strong>{o.vehicle.plate}</strong> · {WO_TYPE_LABEL[o.type]}</p>
                  <p className="truncate text-sm text-muted">{o.description}</p>
                  <div className="flex items-center justify-between gap-2">
                    <Badge className={WO_STATUS_TONE[o.status]}>{WO_STATUS_LABEL[o.status]}</Badge>
                    <span className="text-sm tabular-nums">{Number(o.totalCost) ? money(o.totalCost) : ''}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      <Modal title="Nueva orden de trabajo" open={creating} onClose={() => setCreating(false)}>
        {creating && <NewOrder onCreated={(id) => router.push(`/ot/${id}`)} />}
      </Modal>
    </div>
  );
}
