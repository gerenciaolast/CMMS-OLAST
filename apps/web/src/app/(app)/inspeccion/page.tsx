'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, CheckCheck, ClipboardCheck, Truck } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, SecondaryButton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { shrinkPhoto } from '@/lib/image';
import { useSession } from '@/lib/session';
import { km, STATUS_LABEL, STATUS_TONE } from '@/lib/fleet';
import { RESULT_LABEL, RESULT_TONE, time, type Answer, type DailyReport, type MyVehicle, type StartData, type SubmitResult } from '@/lib/inspection';
import type { VehicleStatus } from '@cmms/shared';

interface Row { answer: Answer | null; comment: string; photos: File[] }

const ANSWERS: { value: Answer; label: string; on: string }[] = [
  { value: 'ok', label: 'OK', on: 'border-ok bg-ok text-white' },
  { value: 'defect', label: 'Defecto', on: 'border-danger bg-danger text-white' },
  { value: 'na', label: 'N.A.', on: 'border-ink/60 bg-ink/70 text-white' },
];

function errorText(e: unknown) {
  if (!(e instanceof ApiError)) return 'No fue posible enviar la inspección. Revise la conexión e intente de nuevo.';
  const d = e.details as { message?: string }[] | undefined;
  return Array.isArray(d) && d.length && d[0]?.message ? d.map((x) => x.message).join('. ') : e.message;
}

/** Checklist pre-operacional (doc 02 P3): pensado para completarse en menos de 3 minutos desde el celular. */
function InspectionForm({ vehicleId, onClose }: { vehicleId: string; onClose: (submitted: boolean) => void }) {
  const { me } = useSession();
  const [data, setData] = useState<StartData | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [odometer, setOdometer] = useState('');
  const [signature, setSignature] = useState(me?.fullName ?? '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const started = useRef(Date.now());
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<StartData>(`/inspections/start/${vehicleId}`)
      .then((d) => {
        setData(d);
        setRows(Object.fromEntries(d.template.items.map((i) => [i.id, { answer: null, comment: '', photos: [] }])));
      })
      .catch((e) => setError(errorText(e)));
  }, [vehicleId]);

  const open = useMemo(() => new Map((data?.openDefects ?? []).map((d) => [d.itemId, d])), [data]);
  if (error && !data) return <div className="space-y-3"><Alert>{error}</Alert><SecondaryButton onClick={() => onClose(false)}><ArrowLeft size={16} /> Volver</SecondaryButton></div>;
  if (!data) return <p className="text-muted">Cargando checklist…</p>;

  const items = data.template.items;
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const pending = items.filter((i) => !rows[i.id]?.answer).length;
  const odo = Number(odometer);
  const odoLow = odometer !== '' && data.vehicle.currentOdometer != null && odo < data.vehicle.currentOdometer;
  const missingDetail = items.filter((i) => rows[i.id]?.answer === 'defect' && (!rows[i.id]!.comment.trim() || (i.requiresPhotoOnFail && rows[i.id]!.photos.length === 0)));
  const criticalDefect = items.some((i) => i.isCritical && rows[i.id]?.answer === 'defect');
  const ready = pending === 0 && odometer !== '' && !odoLow && missingDetail.length === 0 && signature.trim().length >= 3 && confirm;

  if (result)
    return (
      <div className="space-y-4">
        <div className={`rounded-2xl border-2 p-6 text-center ${RESULT_TONE[result.result]}`}>
          <p className="text-sm font-medium opacity-90">{data.vehicle.plate}</p>
          <p className="text-3xl font-bold">{result.resultLabel}</p>
          {result.result === 'unfit' && <p className="mt-2 text-sm">El vehículo quedó FUERA DE SERVICIO. No lo opere. Mantenimiento ya fue notificado.</p>}
          {result.result === 'fit_with_observations' && <p className="mt-2 text-sm">Puede operar. Los defectos quedaron reportados a mantenimiento.</p>}
          {result.result === 'fit' && <p className="mt-2 text-sm">Buen viaje.</p>}
        </div>
        {(result.createdRequests.length > 0 || result.linkedRequests.length > 0) && (
          <Card className="text-sm">
            {result.createdRequests.length > 0 && <p>Avisos de falla creados: <strong>{result.createdRequests.join(', ')}</strong></p>}
            {result.linkedRequests.length > 0 && <p className="text-muted">Ya estaban reportados (no se duplicaron): {result.linkedRequests.join(', ')}</p>}
          </Card>
        )}
        <Button className="w-full" onClick={() => onClose(true)}>Terminar</Button>
      </div>
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('data', JSON.stringify({
      vehicleId, odometer: odo, signatureName: signature.trim(), durationSeconds: Math.round((Date.now() - started.current) / 1000),
      answers: items.map((i) => ({ itemId: i.id, answer: rows[i.id]!.answer, comment: rows[i.id]!.answer === 'defect' ? rows[i.id]!.comment.trim() || null : null })),
    }));
    for (const i of items) if (rows[i.id]!.answer === 'defect') rows[i.id]!.photos.forEach((p) => fd.append(`photo:${i.id}`, p));
    try {
      setResult(await api<SubmitResult>('/inspections', { method: 'POST', body: fd }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => onClose(false)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><ArrowLeft size={16} /> Mis vehículos</button>
      <div>
        <h1 className="text-2xl font-bold">{data.vehicle.plate}</h1>
        <p className="text-muted">{data.vehicle.model} · Inspección pre-operacional</p>
      </div>
      <Card className="space-y-3">
        <Field label={`Kilometraje del tablero${data.vehicle.currentOdometer != null ? ` (último ${km(data.vehicle.currentOdometer)})` : ''}`}
          type="number" inputMode="numeric" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value)}
          error={odoLow ? 'Es menor que el último registrado. Revise el tablero.' : undefined} />
        <SecondaryButton className="w-full"
          onClick={() => { setRows((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.answer ? v : { ...v, answer: 'ok' }]))); setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), 50); }}>
          <CheckCheck size={18} /> Marcar todo lo pendiente como OK
        </SecondaryButton>
      </Card>

      <ol className="space-y-2">
        {items.map((i, n) => {
          const r = rows[i.id]!;
          const prev = open.get(i.id);
          return (
            <li key={i.id} className={`rounded-xl border bg-surface p-3 ${r.answer === 'defect' ? 'border-danger/50' : 'border-line'}`}>
              <div className="flex items-start gap-2">
                <span className="w-5 shrink-0 text-sm text-muted tabular-nums">{n + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug font-medium">{i.text}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.isCritical && <Badge className="border-danger/40 text-danger">Crítico</Badge>}
                    {i.requiresPhotoOnFail && <Badge className="border-line text-muted">Foto si hay defecto</Badge>}
                  </div>
                  {prev?.workRequest && (
                    <p className="mt-1 text-xs text-warn">Ya reportado: aviso {prev.workRequest.number}{prev.workRequest.workOrder ? ` · OT ${prev.workRequest.workOrder.number}` : ''}{prev.comment ? ` — ${prev.comment}` : ''}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label={i.text}>
                {ANSWERS.map((a) => (
                  <button key={a.value} type="button" role="radio" aria-checked={r.answer === a.value}
                    onClick={() => set(i.id, { answer: a.value })}
                    className={`h-11 rounded-lg border text-sm font-semibold ${r.answer === a.value ? a.on : 'border-line bg-surface text-ink'}`}>
                    {a.label}
                  </button>
                ))}
              </div>
              {r.answer === 'defect' && (
                <div className="mt-2 space-y-2">
                  <textarea value={r.comment} onChange={(e) => set(i.id, { comment: e.target.value })} rows={2} placeholder="¿Qué encontró?"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base" />
                  <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-sm ${i.requiresPhotoOnFail && !r.photos.length ? 'border-danger/60 text-danger' : 'border-brand/50 text-brand'}`}>
                    <Camera size={18} /> {r.photos.length ? `${r.photos.length} foto(s) lista(s)` : i.requiresPhotoOnFail ? 'Tomar foto (obligatoria)' : 'Tomar foto (opcional)'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only"
                      onChange={async (e) => { const f = Array.from(e.target.files ?? []).slice(0, 3); set(i.id, { photos: await Promise.all(f.map((x) => shrinkPhoto(x))) }); }} />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Card className="space-y-3">
        <div ref={bottom} />
        {criticalDefect && <Alert>Hay un defecto en un ítem crítico: al enviar, el vehículo quedará FUERA DE SERVICIO y se avisará a mantenimiento.</Alert>}
        <Field label="Firma (nombre de quien inspecciona)" value={signature} onChange={(e) => setSignature(e.target.value)} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
          Declaro que revisé personalmente el vehículo y que la información es verdadera.
        </label>
        {error && <Alert>{error}</Alert>}
        {!ready && (
          <p className="text-sm text-muted">
            {[pending > 0 && `${pending} ítem(s) sin responder`, odometer === '' && 'falta el kilometraje', missingDetail.length > 0 && `${missingDetail.length} defecto(s) sin descripción o foto`, !confirm && 'falta la declaración']
              .filter(Boolean).join(' · ')}
          </p>
        )}
        <Button className="w-full" disabled={!ready || busy} onClick={submit}>{busy ? 'Enviando…' : 'Enviar inspección'}</Button>
      </Card>
    </div>
  );
}

function MyVehicles({ onStart }: { onStart: (id: string) => void }) {
  const [rows, setRows] = useState<MyVehicle[] | null>(null);
  useEffect(() => { void api<MyVehicle[]>('/inspections/my-vehicles').then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <p className="text-muted">Cargando…</p>;
  if (rows.length === 0)
    return <Card><p className="text-muted">No tiene vehículos asignados. Pida al jefe de mantenimiento que lo habilite como conductor del vehículo.</p></Card>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((v) => {
        const today = v.inspections[0];
        return (
          <li key={v.id}>
            <button onClick={() => onStart(v.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left hover:border-brand">
              <Truck className="shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{v.plate}</p>
                <p className="truncate text-sm text-muted">{v.vehicleModel.model} · {v.site.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {v.status !== 'operational' && <Badge className={STATUS_TONE[v.status as VehicleStatus]}>{STATUS_LABEL[v.status as VehicleStatus]}</Badge>}
                  {today ? <Badge className={RESULT_TONE[today.result]}>Hoy {time(today.performedAt)}: {RESULT_LABEL[today.result]}</Badge> : <Badge className="border-warn/40 text-warn">Sin inspección hoy</Badge>}
                </div>
              </div>
              <span className="text-sm font-semibold text-brand">{today ? 'Repetir' : 'Inspeccionar'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Daily() {
  const [date, setDate] = useState('');
  const [r, setR] = useState<DailyReport | null>(null);
  const load = useCallback(() => api<DailyReport>(`/inspections/daily${date ? `?date=${date}` : ''}`).then(setR).catch(() => undefined), [date]);
  useEffect(() => { void load(); }, [load]);
  if (!r) return <p className="text-muted">Cargando…</p>;
  const missing = r.vehicles.filter((v) => (v.status === 'operational' || v.status === 'operational_restricted') && v.inspections.length === 0);
  const pct = r.compliance == null ? '—' : `${Math.round(r.compliance * 100)} %`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-sm font-medium">Día</span>
          <input type="date" value={date || r.day} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-3" /></label>
        <Card className="flex-1 py-3"><p className="text-sm text-muted">Cumplimiento (meta ≥ 98 %)</p><p className={`text-2xl font-bold ${r.compliance != null && r.compliance < 0.98 ? 'text-warn' : 'text-ok'}`}>{pct} <span className="text-base font-normal text-muted">· {r.done} de {r.expected} vehículos operativos</span></p></Card>
      </div>
      {missing.length > 0 && <Alert tone="warn">Sin inspección: {missing.map((v) => v.plate).join(', ')}</Alert>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs tracking-wide text-muted uppercase">
            <tr><th className="px-4 py-3">Placa</th><th className="px-4 py-3">Sede</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Inspecciones del día</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.vehicles.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 font-medium"><Link href={`/vehiculos/${v.id}`} className="text-brand hover:underline">{v.plate}</Link></td>
                <td className="px-4 py-3">{v.site.name}</td>
                <td className="px-4 py-3"><Badge className={STATUS_TONE[v.status as VehicleStatus]}>{STATUS_LABEL[v.status as VehicleStatus]}</Badge></td>
                <td className="px-4 py-3">
                  {v.inspections.length === 0 ? <span className="text-muted">—</span> : (
                    <div className="flex flex-wrap gap-1">
                      {v.inspections.map((i) => (
                        <Link key={i.id} href={`/inspeccion/${i.id}`}><Badge className={RESULT_TONE[i.result]}>{time(i.performedAt)} · {RESULT_LABEL[i.result]}{i.results.length ? ` (${i.results.length})` : ''}</Badge></Link>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function InspectionPage() {
  const { can } = useSession();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const inspect = can('inspection.perform');
  const supervise = can('work_order.view');
  const [tab, setTab] = useState<'mine' | 'daily'>(inspect ? 'mine' : 'daily');

  if (vehicleId) return <InspectionForm vehicleId={vehicleId} onClose={(sent) => { setVehicleId(null); if (sent) setKey((k) => k + 1); }} />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck /> Inspección diaria</h1>
        <p className="text-muted">Antes de salir, cada vehículo se revisa con el checklist. Un defecto en un ítem crítico deja el vehículo fuera de servicio hasta que mantenimiento lo repare.</p>
      </div>
      {inspect && supervise && (
        <div className="flex gap-2">
          <SecondaryButton className={tab === 'mine' ? 'border-brand text-brand' : ''} onClick={() => setTab('mine')}>Inspeccionar</SecondaryButton>
          <SecondaryButton className={tab === 'daily' ? 'border-brand text-brand' : ''} onClick={() => setTab('daily')}>Cumplimiento del día</SecondaryButton>
        </div>
      )}
      {tab === 'mine' && inspect && <MyVehicles key={key} onStart={setVehicleId} />}
      {tab === 'daily' && supervise && <Daily />}
      {!inspect && !supervise && <Alert tone="warn"><AlertTriangle size={16} className="inline" /> Su rol no tiene acceso a inspecciones.</Alert>}
    </div>
  );
}
