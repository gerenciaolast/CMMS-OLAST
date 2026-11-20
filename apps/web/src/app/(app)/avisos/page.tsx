'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Camera, Megaphone } from 'lucide-react';
import { suggestPriority } from '@cmms/domain';
import type { Criticality, FailureConsequence } from '@cmms/shared';
import { Alert, Badge, Button, Card, Field, Modal, Select } from '@/components/ui';
import { AuthImage } from '@/components/auth-image';
import { shrinkPhoto } from '@/lib/image';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { day, km, type VehicleSummary } from '@/lib/fleet';
import {
  CAN_OPERATE_LABEL, CONSEQUENCE_LABEL, PRIORITY_LABEL, PRIORITY_TONE, REQUEST_STATUS_LABEL, WO_STATUS_LABEL, WO_TYPE_LABEL, type WorkRequestRow,
} from '@/lib/maintenance';

interface Component { code: string; name: string }
interface Supplier { id: string; name: string }
interface RequestDetail extends WorkRequestRow {
  suggestion: { consequence: FailureConsequence; priority: string };
  openOrders: { id: string; number: string; type: string; status: string; description: string }[];
}

function errorText(e: unknown) {
  if (e instanceof ApiError) {
    const d = e.details as { message: string }[] | undefined;
    return Array.isArray(d) && d.length ? d.map((x) => x.message).join('. ') : e.message;
  }
  return 'No fue posible guardar';
}

function ReportForm({ onDone }: { onDone: (msg: string) => void }) {
  const params = useSearchParams();
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [systems, setSystems] = useState<Component[]>([]);
  const [canOperate, setCanOperate] = useState<'yes' | 'restricted' | 'no'>('yes');
  const [vehicleId, setVehicleId] = useState(params.get('vehiculo') ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    void api<VehicleSummary[]>('/vehicles').then(setVehicles).catch(() => undefined);
    void api<Component[]>('/catalog/components?level=1').then(setSystems).catch(() => undefined);
  }, []);
  const v = vehicles.find((x) => x.id === vehicleId);

  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const fd = new FormData();
        for (const k of ['vehicleId', 'description', 'systemCode', 'odometer']) {
          const val = String(f.get(k) ?? '').trim();
          if (val) fd.append(k, val);
        }
        fd.append('canOperate', canOperate);
        photos.forEach((p) => fd.append('photos', p));
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ number: string; priority: string }>('/work-requests', { method: 'POST', body: fd });
          form.reset();
          setPhotos([]);
          setCanOperate('yes');
          onDone(`Aviso ${r.number} registrado (prioridad sugerida ${r.priority}).${canOperate === 'no' ? ' El vehículo quedó fuera de servicio.' : ''}`);
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      <Select label="Vehículo" name="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
        <option value="" disabled>Seleccione la placa…</option>
        {vehicles.map((x) => <option key={x.id} value={x.id}>{x.plate} · {x.vehicleModel.model} · {x.site.name}</option>)}
      </Select>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">¿Qué pasa?</span>
        <textarea name="description" required minLength={5} rows={3} placeholder="Ej.: Frenos traseros suenan y el pedal se va al fondo" className="w-full rounded-lg border border-line bg-surface p-3 text-base" />
      </label>
      <Select label="Sistema afectado (si lo sabe)" name="systemCode" defaultValue="">
        <option value="">No sé / varios</option>
        {systems.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </Select>
      <div>
        <span className="mb-1 block text-sm font-medium">¿El vehículo puede operar?</span>
        <div className="grid grid-cols-3 gap-2">
          {(['yes', 'restricted', 'no'] as const).map((o) => (
            <button key={o} type="button" onClick={() => setCanOperate(o)}
              className={`min-h-11 rounded-lg border px-2 text-sm ${canOperate === o ? (o === 'no' ? 'border-danger bg-danger text-white' : o === 'restricted' ? 'border-warn bg-warn text-white' : 'border-ok bg-ok text-white') : 'border-line hover:border-brand'}`}>
              {CAN_OPERATE_LABEL[o]}
            </button>
          ))}
        </div>
        {canOperate === 'no' && <p className="mt-1 text-xs text-danger">El vehículo quedará FUERA DE SERVICIO hasta que se repare.</p>}
      </div>
      <Field label={`Kilometraje actual${v?.currentOdometer ? ` (último ${km(v.currentOdometer)})` : ''}`} name="odometer" type="number" inputMode="numeric" min={0} />
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-brand/50 px-3 text-sm text-brand">
        <Camera size={18} /> {photos.length ? `${photos.length} foto(s) lista(s)` : 'Tomar o adjuntar fotos (máx. 3)'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only"
          onChange={async (e) => setPhotos(await Promise.all(Array.from(e.target.files ?? []).slice(0, 3).map((f) => shrinkPhoto(f))))} />
      </label>
      <Button type="submit" disabled={busy || !ready} className="w-full gap-2"><Megaphone size={18} /> {busy ? 'Enviando…' : 'Reportar falla'}</Button>
    </form>
  );
}

function ReviewDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (msg: string, href?: string) => void }) {
  const [r, setR] = useState<RequestDetail | null>(null);
  const [decision, setDecision] = useState<'approve' | 'merge' | 'reject'>('approve');
  const [consequence, setConsequence] = useState<FailureConsequence>('no_impact');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<RequestDetail>(`/work-requests/${id}`).then((d) => { setR(d); setConsequence(d.suggestion.consequence); });
    void api<Supplier[]>('/suppliers').then(setSuppliers).catch(() => undefined);
  }, [id]);
  if (!r) return <p className="text-muted">Cargando…</p>;
  const suggested = suggestPriority(consequence, (r.vehicle.criticality ?? 'B') as Criticality);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-canvas p-3 text-sm">
        <p className="font-semibold">{r.number} · {r.vehicle.plate} · {r.vehicle.site.name}</p>
        <p className="mt-1">{r.description}</p>
        <p className="mt-1 text-muted">{CAN_OPERATE_LABEL[r.canOperate]} · {day(r.reportedAt)}{r.odometer ? ` · ${km(r.odometer)}` : ''} · criticidad {r.vehicle.criticality ?? '—'}</p>
        {r.photos.length > 0 && <div className="mt-2 flex gap-2">{r.photos.map((p) => <AuthImage key={p.id} attachmentId={p.id} alt="Foto del aviso" className="h-20 w-20 rounded-lg" />)}</div>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([['approve', 'Crear OT'], ['merge', 'Agrupar'], ['reject', 'Rechazar']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setDecision(k)} disabled={k === 'merge' && r.openOrders.length === 0}
            className={`h-10 rounded-lg border text-sm disabled:opacity-40 ${decision === k ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand'}`}>{l}</button>
        ))}
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const s = (k: string) => String(f.get(k) ?? '').trim() || undefined;
          const body =
            decision === 'approve'
              ? { decision, type: s('type'), consequence, priority: s('priority'), description: s('description'), workshopType: s('workshopType'), supplierId: s('supplierId') ?? null }
              : decision === 'merge' ? { decision, workOrderId: s('workOrderId') } : { decision, reason: s('reason') };
          setBusy(true);
          setError(null);
          try {
            const res = await api<RequestDetail>(`/work-requests/${id}/review`, { method: 'POST', json: body });
            onDone(
              decision === 'approve' ? `OT ${res.workOrder?.number} creada` : decision === 'merge' ? `Aviso agrupado en la OT ${res.workOrder?.number ?? ''}` : 'Aviso rechazado',
              res.workOrder ? `/ot/${res.workOrder.id}` : undefined,
            );
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Alert>{error}</Alert>}
        {decision === 'approve' && (
          <>
            <Select label="Consecuencia de la falla" value={consequence} onChange={(e) => setConsequence(e.target.value as FailureConsequence)}>
              {Object.entries(CONSEQUENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Select label={`Prioridad (sugerida por la matriz: ${suggested})`} name="priority" defaultValue="" key={suggested}>
              <option value="">Usar la sugerida ({PRIORITY_LABEL[suggested]})</option>
              {Object.entries(PRIORITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Select label="Tipo de OT" name="type" defaultValue={r.canOperate === 'no' ? 'CE' : 'CP'}>
              {['CP', 'CE', 'AUX', 'SIN', 'INS', 'MEJ'].map((t) => <option key={t} value={t}>{WO_TYPE_LABEL[t]}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Taller" name="workshopType" defaultValue="external">
                <option value="external">Externo</option>
                <option value="internal">Interno</option>
              </Select>
              <Select label="Proveedor" name="supplierId" defaultValue="">
                <option value="">—</option>
                {suppliers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <Field label="Descripción de la OT (vacío = la del aviso)" name="description" />
          </>
        )}
        {decision === 'merge' && (
          <Select label="OT abierta del mismo vehículo" name="workOrderId" required defaultValue="">
            <option value="" disabled>Seleccione…</option>
            {r.openOrders.map((o) => <option key={o.id} value={o.id}>{o.number} · {WO_TYPE_LABEL[o.type]} · {WO_STATUS_LABEL[o.status as keyof typeof WO_STATUS_LABEL]}</option>)}
          </Select>
        )}
        {decision === 'reject' && <Field label="Motivo del rechazo" name="reason" required minLength={5} />}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Guardando…' : 'Confirmar'}</Button>
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-line px-4 text-sm">Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function AvisosContent() {
  const { can } = useSession();
  const [rows, setRows] = useState<WorkRequestRow[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; href?: string } | null>(null);
  const canList = can('work_order.view');

  const load = useCallback(() => {
    if (canList) void api<WorkRequestRow[]>(`/work-requests?status=${showAll ? 'all' : 'new,in_review'}`).then(setRows);
  }, [canList, showAll]);
  useEffect(load, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Avisos de falla</h1>
        <p className="text-muted">Reporte cualquier falla o anomalía. El equipo de mantenimiento la revisa y genera la orden de trabajo.</p>
      </div>
      {notice && (
        <Alert tone="ok">
          {notice.text}
          {notice.href && <> · <Link href={notice.href} className="font-semibold underline">Abrir la OT</Link></>}
        </Alert>
      )}
      <div className={`grid gap-5 ${canList ? 'lg:grid-cols-[minmax(0,420px)_1fr]' : ''}`}>
        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">Reportar falla</h2>
          <ReportForm onDone={(m) => { setNotice({ text: m }); load(); }} />
        </Card>
        {canList && (
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{showAll ? 'Todos los avisos' : 'Pendientes por revisar'} {rows && <span className="text-muted">({rows.length})</span>}</h2>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 accent-brand" /> Ver todos</label>
            </div>
            {rows?.length === 0 && <Card><p className="text-muted">No hay avisos pendientes.</p></Card>}
            {rows?.map((r) => (
              <Card key={r.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.priority && <Badge className={PRIORITY_TONE[r.priority]}>{r.priority}</Badge>}
                    <Link href={`/vehiculos/${r.vehicle.id}`} className="font-bold text-brand">{r.vehicle.plate}</Link>
                    <span className="text-sm text-muted">{r.number} · {r.vehicle.site.name} · {day(r.reportedAt)}</span>
                  </div>
                  <Badge className={r.canOperate === 'no' ? 'border-danger/40 text-danger' : r.canOperate === 'restricted' ? 'border-warn/40 text-warn' : 'border-line text-muted'}>{CAN_OPERATE_LABEL[r.canOperate]}</Badge>
                </div>
                <p>{r.description}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted">{r.photos.length ? `${r.photos.length} foto(s) · ` : ''}{REQUEST_STATUS_LABEL[r.status]}{r.workOrder ? ` · ` : ''}
                    {r.workOrder && <Link className="text-brand" href={`/ot/${r.workOrder.id}`}>{r.workOrder.number}</Link>}
                    {r.rejectionReason ? ` · ${r.rejectionReason}` : ''}
                  </span>
                  {can('work_request.review') && (r.status === 'new' || r.status === 'in_review') && (
                    <button className="font-medium text-brand hover:underline" onClick={() => setReviewing(r.id)}>Revisar</button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Modal title="Revisar aviso" open={!!reviewing} onClose={() => setReviewing(null)}>
        {reviewing && <ReviewDialog id={reviewing} onClose={() => setReviewing(null)} onDone={(m, href) => { setReviewing(null); setNotice({ text: m, href }); load(); }} />}
      </Modal>
    </div>
  );
}

export default function AvisosPage() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <AvisosContent />
    </Suspense>
  );
}
