'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ClipboardList, Coins, History, Pause, Play, RotateCcw, ShieldCheck, Tags, Trash2, X } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Modal, SecondaryButton, Select } from '@/components/ui';
import { AuthImage } from '@/components/auth-image';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { day, km, money } from '@/lib/fleet';
import { ACTION_LABEL, HOLD_LABEL, PRIORITY_TONE, WO_STATUS_LABEL, WO_STATUS_TONE, WO_TYPE_LABEL, type WoStatus } from '@/lib/maintenance';

interface Line { id: string }
interface Detail {
  id: string; number: string; type: string; priority: string; status: WoStatus; description: string; workshopType: string; origin: string;
  isRework: boolean; isHistorical: boolean; reworkOf: { id: string; number: string } | null; cancelReason: string | null; completionNotes: string | null;
  plannedStart: string | null; estimatedHours: string | null; actualStart: string | null; actualEnd: string | null; closedAt: string | null; createdAt: string;
  odometerIn: number | null; odometerOut: number | null;
  laborCost: string; partsCost: string; externalCost: string; totalCost: string;
  vehicle: { id: string; plate: string; criticality: string | null; status: string; currentOdometer: number | null; site: { name: string }; vehicleModel: { make: string; model: string } };
  supplier: { id: string; name: string } | null;
  requests: { id: string; number: string; description: string; canOperate: string; reportedAt: string; photos: { id: string }[] }[];
  tasks: (Line & { description: string; status: 'pending' | 'done' | 'not_done' | 'finding'; notDoneReason: string | null; comment: string | null })[];
  labor: (Line & { hours: string; hourlyCost: string; cost: string; workDate: string; technician: { name: string } })[];
  parts: (Line & { description: string; quantity: string; unitCost: string; totalCost: string })[];
  externalServices: (Line & { description: string; invoiceNumber: string | null; amount: string; supplier: { name: string } | null })[];
  holds: (Line & { reason: string; comment: string | null; startedAt: string; endedAt: string | null })[];
  failures: (Line & { componentCode: string; failureMode: string | null; cause: string | null; action: string | null; comment: string | null })[];
  events: (Line & { action: string; fromStatus: string | null; toStatus: string | null; comment: string | null; createdAt: string })[];
  tireChanges: (Line & { axle: string; quantity: number; reason: string })[];
  actions: string[]; codingRequired: boolean; codingComplete: boolean; pendingTasks: number;
}
interface Code { code: string; name: string }
interface Coding { modes: Code[]; causes: Code[]; actions: Code[] }
interface Technician { id: string; name: string; hourlyCost: string }
interface Supplier { id: string; name: string }
type Dialog = null | 'schedule' | 'start' | 'hold' | 'complete' | 'reject' | 'cancel' | 'close' | 'labor' | 'part' | 'external' | 'failure' | { notDone: string };

const TASK_TONE = { pending: 'border-line text-muted', done: 'border-ok/40 bg-ok/10 text-ok', not_done: 'border-danger/40 text-danger', finding: 'border-warn/40 text-warn' } as const;
const TASK_LABEL = { pending: 'Pendiente', done: 'Hecha', not_done: 'No hecha', finding: 'Hallazgo' } as const;

function errorText(e: unknown) {
  if (e instanceof ApiError) {
    const d = e.details as { message: string }[] | undefined;
    return Array.isArray(d) && d.length ? d.map((x) => x.message).join('. ') : e.message;
  }
  return 'No fue posible guardar';
}

function Form({ onSubmit, label, children, danger }: { onSubmit: (f: FormData) => Promise<void>; label: string; children?: React.ReactNode; danger?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(new FormData(e.currentTarget));
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      {children}
      <Button type="submit" disabled={busy} className={`w-full ${danger ? 'bg-danger hover:bg-danger/90' : ''}`}>{busy ? 'Guardando…' : label}</Button>
    </form>
  );
}

function FailureForm({ coding, onSubmit }: { coding: Coding | null; onSubmit: (f: FormData) => Promise<void> }) {
  const [systems, setSystems] = useState<Code[]>([]);
  const [assemblies, setAssemblies] = useState<Code[]>([]);
  const [components, setComponents] = useState<Code[]>([]);
  const [sys, setSys] = useState('');
  const [asm, setAsm] = useState('');
  useEffect(() => void api<Code[]>('/catalog/components?level=1').then(setSystems), []);
  useEffect(() => { setAsm(''); setComponents([]); if (sys) void api<Code[]>(`/catalog/components?parent=${sys}`).then(setAssemblies); }, [sys]);
  useEffect(() => { if (asm) void api<Code[]>(`/catalog/components?parent=${asm}`).then(setComponents); }, [asm]);
  return (
    <Form label="Agregar codificación" onSubmit={onSubmit}>
      <Select label="1. Sistema" value={sys} onChange={(e) => setSys(e.target.value)} required>
        <option value="" disabled>Seleccione…</option>
        {systems.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </Select>
      <Select label="2. Conjunto" value={asm} onChange={(e) => setAsm(e.target.value)} required disabled={!sys}>
        <option value="" disabled>Seleccione…</option>
        {assemblies.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </Select>
      <Select label="3. Componente" name="componentCode" required disabled={!asm} defaultValue="" key={asm}>
        <option value="" disabled>Seleccione…</option>
        {components.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </Select>
      {coding && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Modo de falla" name="failureMode" required defaultValue=""><option value="" disabled>—</option>{coding.modes.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
          <Select label="Causa" name="cause" required defaultValue=""><option value="" disabled>—</option>{coding.causes.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
          <Select label="Acción" name="action" required defaultValue=""><option value="" disabled>—</option>{coding.actions.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
        </div>
      )}
      <Field label="Comentario" name="comment" />
    </Form>
  );
}

export default function WorkOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const [o, setO] = useState<Detail | null>(null);
  const [coding, setCoding] = useState<Coding | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => api<Detail>(`/work-orders/${id}`).then(setO).catch((e) => setLoadError(errorText(e))), [id]);
  useEffect(() => {
    void load();
    void api<Coding>('/catalog/failure-coding').then(setCoding);
    void api<Technician[]>('/technicians').then(setTechnicians).catch(() => undefined);
    void api<Supplier[]>('/suppliers').then(setSuppliers).catch(() => undefined);
  }, [load]);

  const run = async (path: string, json: unknown, msg: string, method = 'POST') => {
    await api(`/work-orders/${id}${path}`, { method, json });
    await load();
    setDialog(null);
    setNotice(msg);
  };
  const safeRun = (path: string, json: unknown, msg: string, method = 'POST') => run(path, json, msg, method).catch((e) => setNotice(errorText(e)));

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!o) return <p className="text-muted">Cargando…</p>;

  const editable = ['planned', 'scheduled', 'in_progress', 'on_hold', 'completed'].includes(o.status) && can('work_order.execute');
  const has = (a: string) => o.actions.includes(a);
  const codeName = (list: Code[] | undefined, c: string | null) => (c ? list?.find((x) => x.code === c)?.name ?? c : '—');
  const blockers = [
    o.codingRequired && !o.codingComplete ? 'Falta la codificación completa de la falla (componente, modo, causa y acción).' : null,
    o.pendingTasks > 0 ? `Hay ${o.pendingTasks} tarea(s) sin marcar.` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <Link href="/ot" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><ArrowLeft size={16} /> Órdenes de trabajo</Link>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{o.number}</h1>
              <Badge className={PRIORITY_TONE[o.priority]}>{o.priority}</Badge>
              <Badge className={WO_STATUS_TONE[o.status]}>{WO_STATUS_LABEL[o.status]}</Badge>
              {o.isRework && <Badge className="border-danger/40 text-danger"><RotateCcw size={12} className="mr-1" />Retrabajo{o.reworkOf && <> de&nbsp;<Link href={`/ot/${o.reworkOf.id}`} className="underline">{o.reworkOf.number}</Link></>}</Badge>}
              {o.isHistorical && <Badge className="border-line text-muted">Historial importado</Badge>}
            </div>
            <p className="mt-1 text-muted">
              {WO_TYPE_LABEL[o.type] ?? o.type} · <Link href={`/vehiculos/${o.vehicle.id}`} className="font-semibold text-brand">{o.vehicle.plate}</Link> {o.vehicle.vehicleModel.model} · {o.vehicle.site.name}
            </p>
            <p className="mt-2">{o.description}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">Costo total</p>
            <p className="text-2xl font-bold tabular-nums">{money(o.totalCost)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div><dt className="text-muted">Taller</dt><dd>{o.workshopType === 'internal' ? 'Interno' : 'Externo'}{o.supplier ? ` · ${o.supplier.name}` : ''}</dd></div>
          <div><dt className="text-muted">Programada</dt><dd>{day(o.plannedStart)}{o.estimatedHours ? ` · ${Number(o.estimatedHours)} h` : ''}</dd></div>
          <div><dt className="text-muted">Inicio / fin</dt><dd>{day(o.actualStart)} → {day(o.actualEnd)}</dd></div>
          <div><dt className="text-muted">Km ingreso / salida</dt><dd>{km(o.odometerIn)} / {km(o.odometerOut)}</dd></div>
        </dl>

        {o.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {has('schedule') && can('work_order.plan') && <SecondaryButton onClick={() => setDialog('schedule')}>Programar</SecondaryButton>}
            {has('start') && can('work_order.execute') && <Button onClick={() => setDialog('start')} className="h-10 gap-1.5"><Play size={16} /> Iniciar</Button>}
            {has('hold') && can('work_order.execute') && <SecondaryButton onClick={() => setDialog('hold')}><Pause size={16} /> Poner en espera</SecondaryButton>}
            {has('resume') && can('work_order.execute') && <Button onClick={() => safeRun('/resume', {}, 'OT reanudada')} className="h-10 gap-1.5"><Play size={16} /> Reanudar</Button>}
            {has('complete') && can('work_order.execute') && <Button onClick={() => setDialog('complete')} className="h-10 gap-1.5"><Check size={16} /> Terminar</Button>}
            {has('close') && can('work_order.close') && <Button onClick={() => setDialog('close')} className="h-10 gap-1.5 bg-ok hover:bg-ok/90"><ShieldCheck size={16} /> Verificar y cerrar</Button>}
            {has('reject_verification') && can('work_order.close') && <SecondaryButton onClick={() => setDialog('reject')}><RotateCcw size={16} /> Rechazar verificación</SecondaryButton>}
            {has('cancel') && can('work_order.plan') && <SecondaryButton onClick={() => setDialog('cancel')} className="text-danger"><X size={16} /> Cancelar OT</SecondaryButton>}
          </div>
        )}
      </Card>

      {notice && <Alert tone={/no |falta|debe|requiere|hay /i.test(notice) ? 'warn' : 'ok'}>{notice}</Alert>}
      {o.status === 'in_progress' && blockers.length > 0 && (
        <Alert tone="warn"><span className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Para terminar: {blockers.join(' ')}</span></Alert>
      )}
      {o.cancelReason && <Alert>Cancelada: {o.cancelReason}</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Tareas */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><ClipboardList size={18} /> Tareas</h2>
          </div>
          {o.tasks.length === 0 && <p className="text-sm text-muted">Sin tareas.</p>}
          <ul className="divide-y divide-line">
            {o.tasks.map((t) => (
              <li key={t.id} className="py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className={t.status === 'done' ? 'text-muted' : ''}>{t.description}</span>
                  <Badge className={TASK_TONE[t.status]}>{TASK_LABEL[t.status]}</Badge>
                </div>
                {t.notDoneReason && <p className="text-xs text-danger">No hecha: {t.notDoneReason}</p>}
                {editable && t.status !== 'done' && (
                  <div className="mt-1 flex gap-3 text-xs">
                    <button className="font-medium text-ok" onClick={() => safeRun(`/tasks/${t.id}`, { status: 'done' }, 'Tarea marcada como hecha', 'PATCH')}>Hecha</button>
                    <button className="font-medium text-danger" onClick={() => setDialog({ notDone: t.id })}>No hecha</button>
                    <button className="font-medium text-warn" onClick={() => safeRun(`/tasks/${t.id}`, { status: 'finding' }, 'Hallazgo registrado: cree un aviso para corregirlo', 'PATCH')}>Hallazgo</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <form className="mt-3 flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem('task') as HTMLInputElement;
              if (input.value.trim().length < 2) return;
              await safeRun('/lines/tasks', { description: input.value.trim() }, 'Tarea agregada');
              input.value = '';
            }}>
              <input name="task" placeholder="Agregar tarea…" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm" />
              <SecondaryButton type="submit">Agregar</SecondaryButton>
            </form>
          )}
        </Card>

        {/* Codificación */}
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><Tags size={18} /> Codificación de la falla</h2>
            {o.codingRequired && <Badge className={o.codingComplete ? 'border-ok/40 text-ok' : 'border-warn/40 text-warn'}>{o.codingComplete ? 'Completa' : 'Obligatoria'}</Badge>}
          </div>
          {o.failures.length === 0 && <p className="text-sm text-muted">{o.codingRequired ? 'Registre qué componente falló, cómo, por qué y qué se hizo.' : 'Opcional en este tipo de OT.'}</p>}
          <ul className="divide-y divide-line">
            {o.failures.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium"><code>{f.componentCode}</code></p>
                  <p className="text-muted">{codeName(coding?.modes, f.failureMode)} · {codeName(coding?.causes, f.cause)} · {codeName(coding?.actions, f.action)}</p>
                  {f.comment && <p className="text-xs text-muted">{f.comment}</p>}
                </div>
                {editable && <button aria-label="Eliminar" className="text-muted hover:text-danger" onClick={() => safeRun(`/lines/failures/${f.id}`, undefined, 'Codificación eliminada', 'DELETE')}><Trash2 size={16} /></button>}
              </li>
            ))}
          </ul>
          {editable && <SecondaryButton className="mt-3" onClick={() => setDialog('failure')}>Agregar codificación</SecondaryButton>}
        </Card>

        {/* Costos */}
        <Card className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><Coins size={18} /> Costos</h2>
            {editable && (
              <div className="flex flex-wrap gap-2">
                <SecondaryButton onClick={() => setDialog('labor')}>+ Mano de obra</SecondaryButton>
                <SecondaryButton onClick={() => setDialog('part')}>+ Repuesto</SecondaryButton>
                <SecondaryButton onClick={() => setDialog('external')}>+ Servicio externo</SecondaryButton>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted uppercase"><tr><th className="py-2 pr-3">Concepto</th><th className="pr-3">Detalle</th><th className="pr-3 text-right">Valor</th><th /></tr></thead>
              <tbody className="divide-y divide-line">
                {o.labor.map((l) => (
                  <tr key={l.id}><td className="py-2 pr-3">Mano de obra</td><td className="pr-3">{l.technician.name} · {Number(l.hours)} h × {money(l.hourlyCost)} · {day(l.workDate)}</td><td className="pr-3 text-right tabular-nums">{money(l.cost)}</td>
                    <td>{editable && <button aria-label="Eliminar" className="text-muted hover:text-danger" onClick={() => safeRun(`/lines/labor/${l.id}`, undefined, 'Línea eliminada', 'DELETE')}><Trash2 size={15} /></button>}</td></tr>
                ))}
                {o.parts.map((p) => (
                  <tr key={p.id}><td className="py-2 pr-3">Repuesto</td><td className="pr-3">{p.description} · {Number(p.quantity)} × {money(p.unitCost)}</td><td className="pr-3 text-right tabular-nums">{money(p.totalCost)}</td>
                    <td>{editable && <button aria-label="Eliminar" className="text-muted hover:text-danger" onClick={() => safeRun(`/lines/parts/${p.id}`, undefined, 'Línea eliminada', 'DELETE')}><Trash2 size={15} /></button>}</td></tr>
                ))}
                {o.externalServices.map((x) => (
                  <tr key={x.id}><td className="py-2 pr-3">Servicio externo</td><td className="pr-3">{x.description}{x.supplier ? ` · ${x.supplier.name}` : ''}{x.invoiceNumber ? ` · Fact. ${x.invoiceNumber}` : ''}</td><td className="pr-3 text-right tabular-nums">{money(x.amount)}</td>
                    <td>{editable && <button aria-label="Eliminar" className="text-muted hover:text-danger" onClick={() => safeRun(`/lines/external/${x.id}`, undefined, 'Línea eliminada', 'DELETE')}><Trash2 size={15} /></button>}</td></tr>
                ))}
                {o.labor.length + o.parts.length + o.externalServices.length === 0 && <tr><td colSpan={4} className="py-3 text-muted">Sin costos registrados.</td></tr>}
              </tbody>
              <tfoot className="border-t-2 border-line text-sm">
                <tr><td className="pt-2 pr-3 text-muted" colSpan={2}>Mano de obra {money(o.laborCost)} · Repuestos {money(o.partsCost)} · Externos {money(o.externalCost)}</td><td className="pt-2 pr-3 text-right font-bold tabular-nums">{money(o.totalCost)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Avisos */}
        {o.requests.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Avisos que originaron la OT</h2>
            <ul className="space-y-3">
              {o.requests.map((r) => (
                <li key={r.id} className="text-sm">
                  <p className="font-medium">{r.number} · {day(r.reportedAt)}</p>
                  <p>{r.description}</p>
                  {r.photos.length > 0 && <div className="mt-2 flex gap-2">{r.photos.map((p) => <AuthImage key={p.id} attachmentId={p.id} alt="Foto del aviso" className="h-20 w-20 rounded-lg" />)}</div>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Bitácora */}
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><History size={18} /> Bitácora</h2>
          <ol className="space-y-2">
            {o.events.map((e) => (
              <li key={e.id} className="border-l-2 border-sky pl-3 text-sm">
                <p className="font-medium">{ACTION_LABEL[e.action] ?? e.action}{e.action === 'hold' && e.comment ? `: ${HOLD_LABEL[e.comment] ?? e.comment}` : e.comment ? `: ${e.comment}` : ''}</p>
                <p className="text-xs text-muted">{new Date(e.createdAt).toLocaleString('es-CO')}</p>
              </li>
            ))}
          </ol>
          {o.holds.length > 0 && (
            <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">
              <p className="mb-1 font-medium">Tiempos de espera</p>
              {o.holds.map((h) => <p key={h.id}>{HOLD_LABEL[h.reason] ?? h.reason}: {day(h.startedAt)} → {h.endedAt ? day(h.endedAt) : 'en curso'}{h.comment ? ` · ${h.comment}` : ''}</p>)}
            </div>
          )}
          {o.completionNotes && <p className="mt-3 text-sm text-muted">{o.completionNotes}</p>}
        </Card>
      </div>

      {/* Diálogos */}
      <Modal title="Programar OT" open={dialog === 'schedule'} onClose={() => setDialog(null)}>
        <Form label="Programar" onSubmit={(f) => run('/schedule', { plannedStart: new Date(String(f.get('plannedStart'))).toISOString(), estimatedHours: f.get('estimatedHours') ? Number(f.get('estimatedHours')) : undefined }, 'OT programada')}>
          <Field label="Fecha programada" name="plannedStart" type="datetime-local" required />
          <Field label="Horas estimadas" name="estimatedHours" type="number" min={0} step="0.5" defaultValue={o.estimatedHours ?? ''} />
        </Form>
      </Modal>
      <Modal title="Iniciar OT" open={dialog === 'start'} onClose={() => setDialog(null)}>
        <Form label="Iniciar trabajo" onSubmit={(f) => run('/start', { odometerIn: f.get('odometerIn') ? Number(f.get('odometerIn')) : undefined }, 'OT iniciada: el vehículo quedó en taller')}>
          <Field label={`Kilometraje de ingreso (último ${km(o.vehicle.currentOdometer)})`} name="odometerIn" type="number" min={0} inputMode="numeric" />
        </Form>
      </Modal>
      <Modal title="Poner en espera" open={dialog === 'hold'} onClose={() => setDialog(null)}>
        <Form label="Poner en espera" onSubmit={(f) => run('/hold', { reason: f.get('reason'), comment: String(f.get('comment') ?? '').trim() || null }, 'OT en espera')}>
          <Select label="Motivo" name="reason" required defaultValue="">
            <option value="" disabled>Seleccione…</option>
            {Object.entries(HOLD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Field label="Detalle" name="comment" />
        </Form>
      </Modal>
      <Modal title="Terminar OT" open={dialog === 'complete'} onClose={() => setDialog(null)}>
        {blockers.length > 0 && <Alert tone="warn">{blockers.join(' ')}</Alert>}
        <div className="mt-3" />
        <Form label="Terminar" onSubmit={(f) => run('/complete', { odometerOut: f.get('odometerOut') ? Number(f.get('odometerOut')) : undefined, completionNotes: String(f.get('notes') ?? '').trim() || null }, 'OT terminada: pendiente de verificación')}>
          <Field label="Kilometraje de salida" name="odometerOut" type="number" min={0} inputMode="numeric" />
          <Field label="Observaciones del trabajo" name="notes" />
        </Form>
      </Modal>
      <Modal title="Verificar y cerrar" open={dialog === 'close'} onClose={() => setDialog(null)}>
        <p className="mb-4 text-sm">Confirme que el trabajo fue verificado (prueba funcional). Al cerrar, la OT no se puede modificar y, si no hay otra OT activa, el vehículo vuelve a <strong>Operativo</strong>.</p>
        <Form label="Cerrar OT" onSubmit={() => run('/close', {}, 'OT cerrada y verificada')} />
      </Modal>
      <Modal title="Rechazar verificación" open={dialog === 'reject'} onClose={() => setDialog(null)}>
        <Form label="Devolver a ejecución" onSubmit={(f) => run('/reject-verification', { reason: f.get('reason') }, 'OT devuelta a ejecución')}>
          <Field label="¿Qué falta o falló en la prueba?" name="reason" required minLength={5} />
        </Form>
      </Modal>
      <Modal title="Cancelar OT" open={dialog === 'cancel'} onClose={() => setDialog(null)}>
        <Form label="Cancelar OT" danger onSubmit={(f) => run('/cancel', { reason: f.get('reason') }, 'OT cancelada')}>
          <Field label="Motivo" name="reason" required minLength={5} />
        </Form>
      </Modal>
      <Modal title="Tarea no hecha" open={typeof dialog === 'object' && dialog !== null} onClose={() => setDialog(null)}>
        {typeof dialog === 'object' && dialog && (
          <Form label="Guardar" onSubmit={(f) => run(`/tasks/${dialog.notDone}`, { status: 'not_done', notDoneReason: f.get('reason') }, 'Tarea marcada como no hecha', 'PATCH')}>
            <Field label="¿Por qué no se hizo?" name="reason" required minLength={3} />
          </Form>
        )}
      </Modal>
      <Modal title="Mano de obra" open={dialog === 'labor'} onClose={() => setDialog(null)}>
        <Form label="Agregar" onSubmit={(f) => run('/lines/labor', { technicianId: f.get('technicianId'), hours: Number(f.get('hours')), workDate: f.get('workDate') || undefined }, 'Mano de obra agregada')}>
          <Select label="Técnico" name="technicianId" required defaultValue="">
            <option value="" disabled>{technicians.length ? 'Seleccione…' : 'No hay técnicos registrados'}</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name} · {money(t.hourlyCost)}/h</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Horas" name="hours" type="number" min={0.25} step="0.25" required />
            <Field label="Fecha" name="workDate" type="date" />
          </div>
        </Form>
      </Modal>
      <Modal title="Repuesto o material" open={dialog === 'part'} onClose={() => setDialog(null)}>
        <Form label="Agregar" onSubmit={(f) => run('/lines/parts', { description: f.get('description'), quantity: Number(f.get('quantity')), unitCost: Number(f.get('unitCost')) }, 'Repuesto agregado')}>
          <Field label="Descripción" name="description" required minLength={2} placeholder="Ej.: Kit de bandas traseras" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad" name="quantity" type="number" min={0.01} step="0.01" defaultValue={1} required />
            <Field label="Costo unitario (COP)" name="unitCost" type="number" min={0} required />
          </div>
        </Form>
      </Modal>
      <Modal title="Servicio externo" open={dialog === 'external'} onClose={() => setDialog(null)}>
        <Form label="Agregar" onSubmit={(f) => run('/lines/external', { supplierId: f.get('supplierId') || null, description: f.get('description'), invoiceNumber: String(f.get('invoiceNumber') ?? '').trim() || null, amount: Number(f.get('amount')) }, 'Servicio externo agregado')}>
          <Select label="Proveedor" name="supplierId" defaultValue={o.supplier?.id ?? ''}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Field label="Descripción" name="description" required minLength={2} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="No. factura" name="invoiceNumber" />
            <Field label="Valor (COP)" name="amount" type="number" min={0} required />
          </div>
        </Form>
      </Modal>
      <Modal title="Codificación de la falla" open={dialog === 'failure'} onClose={() => setDialog(null)}>
        {dialog === 'failure' && (
          <FailureForm coding={coding} onSubmit={(f) => run('/lines/failures', {
            componentCode: f.get('componentCode'), failureMode: f.get('failureMode'), cause: f.get('cause'), action: f.get('action'), comment: String(f.get('comment') ?? '').trim() || null,
          }, 'Codificación agregada')} />
        )}
      </Modal>
    </div>
  );
}
