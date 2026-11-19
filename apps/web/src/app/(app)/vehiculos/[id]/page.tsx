'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRightLeft, CheckCircle2, CircleDot, FileText, Gauge, History, IdCard, MapPin, Pencil, ShieldAlert, Truck } from 'lucide-react';
import { TIRE_AXLE_LABEL, TIRE_REASON_LABEL, tirePositions, type TireAxle } from '@cmms/domain';
import type { VehicleStatus } from '@cmms/shared';
import { Alert, Badge, Button, Card, CriticalityBadge, Field, Modal, Progress, SecondaryButton, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { OWNERSHIP_LABEL, STATUS_LABEL, STATUS_TONE, day, daysUntil, km, money, type Driver, type VehicleDetail } from '@/lib/fleet';

type Dialog = null | 'reading' | 'status' | 'criticality' | 'edit' | 'transfer' | 'drivers' | 'tires' | { doc: string };
interface Site { code: string; name: string }
interface DocType { code: string; name: string; isBlocking: boolean; alertDays: number[] }

const SOURCE_LABEL: Record<string, string> = { manual: 'Manual', import: 'Carga inicial', inspection: 'Inspección', work_order: 'OT', fuel: 'Combustible', gps: 'GPS' };

function errorText(e: unknown) {
  if (e instanceof ApiError) {
    const d = e.details as { message: string }[] | undefined;
    return Array.isArray(d) && d.length ? d.map((x) => x.message).join('. ') : e.message;
  }
  return 'No fue posible guardar';
}

/** Formulario genérico de diálogo: maneja envío, error y cierre. */
function DialogForm({ onSubmit, submitLabel, children }: { onSubmit: (f: FormData) => Promise<void>; submitLabel: string; children: React.ReactNode }) {
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
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Guardando…' : submitLabel}</Button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value ?? '—'}</dd>
    </div>
  );
}

const CRITERIA = [
  ['operationalImpact', 'Impacto operacional si se detiene', ['Hay reemplazo inmediato', 'Reemplazo con demora / afecta parcialmente', 'Sin reemplazo, detiene un servicio']],
  ['safety', 'Seguridad y ambiente', ['Riesgo bajo', 'Carga general', 'Personas o mercancía peligrosa']],
  ['repairCost', 'Costo de reparación típico', ['Bajo', 'Medio', 'Alto']],
  ['usage', 'Exigencia de uso', ['< 3.000 km/mes', '3.000 – 8.000 km/mes', '> 8.000 km/mes o 24/7']],
] as const;

export default function VehiclePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const [v, setV] = useState<VehicleDetail | null>(null);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [axle, setAxle] = useState<TireAxle>('rear');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => api<VehicleDetail>(`/vehicles/${id}`).then(setV).catch((e) => setLoadError(errorText(e))), [id]);
  useEffect(() => {
    void load();
    void api<DocType[]>('/catalog/document-types').then(setDocTypes).catch(() => undefined);
    void api<Site[]>('/sites').then(setSites).catch(() => undefined);
    void api<Driver[]>('/drivers').then(setAllDrivers).catch(() => undefined);
  }, [load]);

  const done = async (msg: string) => {
    await load(); // primero los datos frescos, luego el aviso
    setDialog(null);
    setNotice(msg);
  };

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!v) return <p className="text-muted">Cargando…</p>;

  const retired = v.status === 'retired';
  const tires = v.attributes?.tires;
  const docByType = new Map(v.documents.map((d) => [d.documentType.code, d]));
  const flagged = v.readings.filter((r) => r.isFlagged);

  return (
    <div className="space-y-5">
      <Link href="/vehiculos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><ArrowLeft size={16} /> Flota</Link>

      {/* Encabezado */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-wide">{v.plate}</h1>
              <CriticalityBadge value={v.criticality} />
              <Badge className={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
            </div>
            <p className="mt-1 text-muted">{v.vehicleModel.make} {v.vehicleModel.model} · {v.year ?? 'año —'} · {v.site.name}</p>
            {v.statusReason && <p className="text-sm text-muted">Motivo: {v.statusReason}</p>}
          </div>
          <div className="w-full sm:w-auto sm:text-right">
            <p className="text-sm text-muted">Kilometraje</p>
            <p className="text-2xl font-bold tabular-nums">{km(v.currentOdometer)}</p>
            <p className="text-xs text-muted">{v.lastReadingAt ? `Última lectura ${day(v.lastReadingAt)}` : 'Sin lectura'}</p>
          </div>
        </div>
        {!retired && (
          <div className="flex flex-wrap gap-2">
            {can('meter.record') && <SecondaryButton onClick={() => setDialog('reading')}><Gauge size={16} /> Registrar km</SecondaryButton>}
            {can('vehicle.change_status') && <SecondaryButton onClick={() => setDialog('status')}><Truck size={16} /> Cambiar estado</SecondaryButton>}
            {can('vehicle.change_status') && <SecondaryButton onClick={() => setDialog('transfer')}><ArrowRightLeft size={16} /> Trasladar de sede</SecondaryButton>}
            {can('meter.record') && <SecondaryButton onClick={() => { setAxle('rear'); setDialog('tires'); }}><CircleDot size={16} /> Cambio de llantas</SecondaryButton>}
            {can('vehicle.edit') && <SecondaryButton onClick={() => setDialog('criticality')}><ShieldAlert size={16} /> Criticidad</SecondaryButton>}
            {can('vehicle.edit') && <SecondaryButton onClick={() => setDialog('edit')}><Pencil size={16} /> Completar datos</SecondaryButton>}
          </div>
        )}
      </Card>

      {notice && <Alert tone="ok">{notice}</Alert>}

      {/* Pendientes */}
      {v.missing.length > 0 && (
        <Card className="border-warn/40 bg-warn/5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle size={18} /> Datos pendientes de la ficha</h2>
            {v.completeness != null && <Progress value={v.completeness} />}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {v.missing.map((m) => (
              <li key={m.field} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                <span>
                  {m.label}
                  {m.critical && <span className="ml-1 text-xs text-danger">(requerido para alarmas)</span>}
                </span>
                {can('vehicle.edit') && (
                  <button
                    className="shrink-0 font-medium text-brand hover:underline"
                    onClick={() =>
                      setDialog(
                        m.field === 'currentOdometer' ? 'reading' : m.field === 'criticality' ? 'criticality' : m.field.startsWith('doc.') ? { doc: m.field.slice(4) } : 'edit',
                      )
                    }
                  >
                    Completar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {flagged.length > 0 && (
        <Alert tone="warn">
          {flagged.length} lectura(s) marcada(s) «a validar» por un salto improbable. No cuentan para las alarmas hasta que un supervisor las valide.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Datos generales */}
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Truck size={18} /> Datos generales</h2>
          <dl>
            <Row label="Tipo" value={v.vehicleModel.vehicleType.name} />
            <Row label="VIN / chasis" value={v.vin} />
            <Row label="No. motor" value={v.engineNumber} />
            <Row label="Color" value={v.color} />
            <Row label="Servicio" value={v.serviceType} />
            <Row label="Matriculado en" value={v.registrationCity} />
            <Row label="Propiedad" value={`${OWNERSHIP_LABEL[v.ownership] ?? v.ownership}${v.titleHolder ? ` · ${v.titleHolder}` : ''}`} />
            <Row label="Capacidad de carga" value={v.loadCapacityKg != null ? `${v.loadCapacityKg.toLocaleString('es-CO')} kg` : null} />
            <Row label="Centro de costo" value={v.costCenter} />
            {v.odometerOffset !== 0 && <Row label="Km acumulado real" value={km(v.accumulatedOdometer)} />}
            {v.criticalityScore && (
              <Row label="Puntaje de criticidad" value={`${v.criticalityScore.score} pts (${v.criticalityScore.operationalImpact}·${v.criticalityScore.safety}·${v.criticalityScore.repairCost}·${v.criticalityScore.usage})`} />
            )}
          </dl>
          {tires && (
            <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">
              <p className="mb-1 font-medium">Llantas</p>
              <p>Delanteras: {tires.frontSize ?? '—'} × {tires.frontQty ?? '—'}</p>
              <p>Traseras: {tires.rearSize ?? '—'} × {tires.rearQty ?? '—'}</p>
              <p className="text-muted">{[tires.brand, tires.loadIndex ? `índice de carga ${tires.loadIndex}` : null].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          )}
          {v.notes && <p className="mt-3 text-sm text-muted">{v.notes}</p>}
        </Card>

        {/* Documentos */}
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><FileText size={18} /> Documentos y vencimientos</h2>
          <ul className="divide-y divide-line">
            {[...docTypes].sort((a, b) => Number(b.isBlocking) - Number(a.isBlocking) || a.name.localeCompare(b.name)).map((t) => {
              const d = docByType.get(t.code);
              const notYet = t.code === 'RTM' && !v.rtmRequired && !d;
              const noExpiry = t.alertDays.length === 0;
              const left = d?.expiresAt ? daysUntil(d.expiresAt) : null;
              const tone = left == null ? 'text-muted' : left < 0 ? 'text-danger font-semibold' : left <= 30 ? 'text-warn font-semibold' : 'text-ok';
              return (
                <li key={t.code} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{t.name}{t.isBlocking && !notYet && <span className="ml-1 text-xs text-danger">obligatorio</span>}</p>
                    <p className={tone}>
                      {notYet
                        ? `Aún no aplica: se exige desde ${(v.year ?? 0) + (v.serviceType === 'PARTICULAR' && v.vehicleModel.vehicleType.code !== 'MOT' ? 6 : 2)}`
                        : d?.expiresAt
                          ? `Vence ${day(d.expiresAt)} · ${left! < 0 ? `vencido hace ${-left!} días` : `faltan ${left} días`}`
                          : d
                            ? `Registrado${d.number ? ` · No. ${d.number}` : ''}`
                            : noExpiry ? 'Sin registrar (no vence)' : 'Sin registrar'}
                    </p>
                  </div>
                  {can('vehicle.edit') && !retired && (
                    <button className="shrink-0 font-medium text-brand hover:underline" onClick={() => setDialog({ doc: t.code })}>
                      {d ? 'Editar' : 'Registrar'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Conductores */}
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><IdCard size={18} /> Conductores habilitados</h2>
            {can('vehicle.edit') && !retired && <button className="text-sm font-medium text-brand hover:underline" onClick={() => setDialog('drivers')}>Asignar</button>}
          </div>
          {v.drivers.length === 0 ? (
            <p className="text-sm text-muted">Sin conductores asignados.</p>
          ) : (
            <ul className="divide-y divide-line">
              {v.drivers.map((d) => (
                <li key={d.driver.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{d.driver.fullName}</span>
                  <span className="flex items-center gap-2 text-muted">
                    {d.driver.phone && <a className="text-brand" href={`tel:${d.driver.phone}`}>{d.driver.phone}</a>}
                    {d.isPrimary && <Badge className="border-brand/30 bg-sky/25 text-brand-800">Principal</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Cualquiera de los conductores habilitados puede hacer la inspección diaria.</p>
        </Card>

        {/* Sedes */}
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><MapPin size={18} /> Historial de sedes</h2>
          <ol className="space-y-3">
            {v.siteHistory.map((h) => (
              <li key={h.id} className="border-l-2 border-sky pl-3 text-sm">
                <p className="font-medium">{h.site.name}{!h.endedAt && <span className="ml-2 text-xs text-ok">actual</span>}</p>
                <p className="text-muted">{h.reason ?? '—'}</p>
                <p className="text-xs text-muted">{day(h.startedAt)} → {h.endedAt ? day(h.endedAt) : 'hoy'}</p>
              </li>
            ))}
          </ol>
        </Card>

        {/* Llantas */}
        <Card className="lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><CircleDot size={18} /> Cambios de llantas</h2>
            <p className="text-sm text-muted">
              {tires ? `Delanteras ${tires.frontSize ?? '—'} × ${tires.frontQty ?? '—'} · Traseras ${tires.rearSize ?? '—'} × ${tires.rearQty ?? '—'}` : 'Configuración de llantas sin registrar'}
            </p>
          </div>
          {v.tireChanges.length === 0 ? (
            <p className="text-sm text-muted">Sin cambios registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted uppercase">
                  <tr><th className="py-2 pr-3">Fecha</th><th className="pr-3">Eje</th><th className="pr-3">Cant.</th><th className="pr-3">Motivo</th><th className="pr-3 text-right">Km</th><th className="pr-3 text-right">Costo</th><th>Detalle</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {v.tireChanges.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">{day(t.changedAt)}</td>
                      <td className="pr-3">{TIRE_AXLE_LABEL[t.axle]}</td>
                      <td className="pr-3">{t.quantity}</td>
                      <td className="pr-3"><Badge className={t.reason === 'theft' || t.reason === 'road_damage' ? 'border-danger/30 text-danger' : 'border-line text-muted'}>{TIRE_REASON_LABEL[t.reason].split(' (')[0]}</Badge></td>
                      <td className="pr-3 text-right tabular-nums whitespace-nowrap">{km(t.odometer)}</td>
                      <td className="pr-3 text-right whitespace-nowrap">{money(t.totalCost)}</td>
                      <td className="text-muted">{[t.positions.join(', '), t.tireBrand, t.supplier, t.notes].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Lecturas */}
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Gauge size={18} /> Lecturas de kilometraje</h2>
          {v.readings.length === 0 ? (
            <p className="text-sm text-muted">Sin lecturas registradas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {v.readings.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="font-medium tabular-nums">{km(r.value)}</p>
                    <p className="text-xs text-muted">{day(r.readAt)} · {SOURCE_LABEL[r.source] ?? r.source}</p>
                  </div>
                  {r.isFlagged ? (
                    can('vehicle.change_status') ? (
                      <SecondaryButton
                        onClick={async () => {
                          try {
                            await api(`/vehicles/${v.id}/readings/${r.id}/validate`, { method: 'POST' });
                            await done('Lectura validada');
                          } catch (e) {
                            setNotice(errorText(e));
                          }
                        }}
                      >
                        <CheckCircle2 size={16} /> Validar
                      </SecondaryButton>
                    ) : (
                      <Badge className="border-warn/40 text-warn">A validar</Badge>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Historial de estados */}
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><History size={18} /> Historial de estados</h2>
          <ol className="space-y-3">
            {v.statusLog.map((l) => (
              <li key={l.id} className="border-l-2 border-sky pl-3 text-sm">
                <Badge className={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                <p className="mt-1">{l.reason ?? '—'}</p>
                <p className="text-xs text-muted">{day(l.startedAt)} → {l.endedAt ? day(l.endedAt) : 'actual'}{l.source === 'import' ? ' · carga inicial' : ''}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* Diálogos */}
      <Modal title="Trasladar de sede" open={dialog === 'transfer'} onClose={() => setDialog(null)}>
        <DialogForm
          submitLabel="Registrar traslado"
          onSubmit={async (f) => {
            await api(`/vehicles/${v.id}/transfer`, {
              method: 'POST',
              json: { siteCode: f.get('siteCode'), reason: f.get('reason'), effectiveAt: f.get('effectiveAt') ? new Date(String(f.get('effectiveAt'))).toISOString() : undefined },
            });
            await done('Traslado registrado');
          }}
        >
          <p className="text-sm text-muted">Sede actual: <strong>{v.site.name}</strong></p>
          <Select label="Nueva sede" name="siteCode" defaultValue="" required>
            <option value="" disabled>Seleccione…</option>
            {sites.filter((s) => s.code !== v.site.code).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Select>
          <Field label="Motivo (necesidad de la operación)" name="reason" required minLength={3} />
          <Field label="Fecha del traslado (vacío = ahora)" name="effectiveAt" type="datetime-local" />
        </DialogForm>
      </Modal>

      <Modal title="Conductores habilitados" open={dialog === 'drivers'} onClose={() => setDialog(null)}>
        <DialogForm
          submitLabel="Guardar conductores"
          onSubmit={async (f) => {
            const driverIds = f.getAll('driverIds').map(String);
            const primary = String(f.get('primary') ?? '') || null;
            await api(`/vehicles/${v.id}/drivers`, { method: 'PUT', json: { driverIds, primaryDriverId: primary && driverIds.includes(primary) ? primary : null } });
            await done('Conductores actualizados');
          }}
        >
          <p className="text-sm text-muted">Marque los conductores que pueden manejar este vehículo y elija el principal.</p>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {allDrivers.length === 0 && <li className="text-sm text-muted">No hay conductores registrados. Créelos en «Conductores».</li>}
            {allDrivers.map((d) => {
              const current = v.drivers.find((x) => x.driver.id === d.id);
              return (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="driverIds" value={d.id} defaultChecked={!!current} className="h-4 w-4 accent-brand" />
                    <span>{d.fullName} <span className="text-muted">{d.site ? `· ${d.site.name}` : ''}</span></span>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input type="radio" name="primary" value={d.id} defaultChecked={current?.isPrimary} className="accent-brand" /> principal
                  </label>
                </li>
              );
            })}
          </ul>
        </DialogForm>
      </Modal>

      <Modal title="Registrar cambio de llantas" open={dialog === 'tires'} onClose={() => setDialog(null)}>
        <DialogForm
          submitLabel="Guardar cambio"
          onSubmit={async (f) => {
            const s = (k: string) => (String(f.get(k) ?? '').trim() || undefined);
            const positions = f.getAll('positions').map(String);
            const r = await api<{ readingStatus: string | null }>(`/vehicles/${v.id}/tire-changes`, {
              method: 'POST',
              json: {
                axle, reason: s('reason'), quantity: positions.length || Number(s('quantity')), positions: positions.length ? positions : undefined,
                changedAt: s('changedAt') ? new Date(String(s('changedAt'))).toISOString() : undefined,
                odometer: s('odometer') ? Number(s('odometer')) : undefined, unitCost: s('unitCost') ? Number(s('unitCost')) : undefined,
                tireBrand: s('tireBrand'), supplier: s('supplier'), notes: s('notes'),
              },
            });
            await done(r.readingStatus === 'flagged' ? 'Cambio registrado; el kilometraje quedó «a validar»' : 'Cambio de llantas registrado');
          }}
        >
          <div>
            <span className="mb-1 block text-sm font-medium">Eje</span>
            <div className="grid grid-cols-3 gap-2">
              {(['front', 'rear', 'spare'] as TireAxle[]).map((a) => (
                <button type="button" key={a} onClick={() => setAxle(a)}
                  className={`h-10 rounded-lg border text-sm ${axle === a ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand'}`}>
                  {TIRE_AXLE_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
          <Select label="Motivo" name="reason" defaultValue={axle === 'spare' ? 'theft' : 'wear'} key={axle} required>
            {(['wear', 'road_damage', 'theft', 'rotation', 'other'] as const).filter((r) => !(r === 'rotation' && axle === 'spare')).map((r) => (
              <option key={r} value={r}>{TIRE_REASON_LABEL[r]}</option>
            ))}
          </Select>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Posiciones cambiadas (o indique solo la cantidad)</legend>
            <div className="grid grid-cols-2 gap-1" key={`pos-${axle}`}>
              {tirePositions({ frontQty: tires?.frontQty, rearQty: tires?.rearQty }, axle).map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" name="positions" value={p} className="h-4 w-4 accent-brand" />{p}</label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad" name="quantity" type="number" min={1} defaultValue={1} key={`q-${axle}`} />
            <Field label={`Km (vigente ${km(v.currentOdometer)})`} name="odometer" type="number" min={0} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo unitario (COP)" name="unitCost" type="number" min={0} />
            <Field label="Marca" name="tireBrand" defaultValue={tires?.brand ?? ''} />
          </div>
          <Field label="Proveedor / montallantas" name="supplier" />
          <Field label="Fecha (vacío = ahora)" name="changedAt" type="datetime-local" />
          <Field label="Observaciones (obligatorio en robo: lugar y denuncia)" name="notes" />
        </DialogForm>
      </Modal>

      <Modal title="Registrar kilometraje" open={dialog === 'reading'} onClose={() => setDialog(null)}>
        <DialogForm
          submitLabel="Guardar lectura"
          onSubmit={async (f) => {
            const r = await api<{ status: string }>(`/vehicles/${v.id}/readings`, {
              method: 'POST',
              json: { value: Number(f.get('value')), readAt: f.get('readAt') ? new Date(String(f.get('readAt'))).toISOString() : undefined },
            });
            await done(r.status === 'flagged' ? 'Lectura guardada y marcada «a validar» por un salto improbable' : 'Lectura registrada');
          }}
        >
          <Field label={`Odómetro (última: ${km(v.currentOdometer)})`} name="value" type="number" inputMode="numeric" min={0} required />
          <Field label="Fecha y hora (vacío = ahora)" name="readAt" type="datetime-local" />
        </DialogForm>
      </Modal>

      <Modal title="Cambiar estado" open={dialog === 'status'} onClose={() => setDialog(null)}>
        <DialogForm
          submitLabel="Cambiar estado"
          onSubmit={async (f) => {
            await api(`/vehicles/${v.id}/status`, { method: 'POST', json: { status: f.get('status'), reason: f.get('reason') } });
            await done('Estado actualizado');
          }}
        >
          <Select label="Nuevo estado" name="status" defaultValue="">
            <option value="" disabled>Seleccione…</option>
            {(Object.keys(STATUS_LABEL) as VehicleStatus[]).filter((s) => s !== v.status).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
          <Field label="Motivo" name="reason" required />
          <p className="text-xs text-muted">«Dado de baja» es definitivo: el historial se conserva.</p>
        </DialogForm>
      </Modal>

      <Modal title="Criticidad del vehículo" open={dialog === 'criticality'} onClose={() => setDialog(null)}>
        <DialogForm
          submitLabel="Calcular y guardar"
          onSubmit={async (f) => {
            const body = Object.fromEntries(CRITERIA.map(([k]) => [k, Number(f.get(k))]));
            const r = await api<{ criticality: string }>(`/vehicles/${v.id}/criticality`, { method: 'PUT', json: body });
            await done(`Criticidad calculada: ${r.criticality}`);
          }}
        >
          {CRITERIA.map(([k, label, opts]) => (
            <Select key={k} label={label} name={k} defaultValue={v.criticalityScore?.[k] ?? ''} required>
              <option value="" disabled>Seleccione…</option>
              {opts.map((o, i) => <option key={o} value={i + 1}>{i + 1} · {o}</option>)}
            </Select>
          ))}
          <p className="text-xs text-muted">A: 10–12 puntos o seguridad = 3 · B: 7–9 · C: 4–6 (doc 03 §2).</p>
        </DialogForm>
      </Modal>

      <Modal title="Completar datos" open={dialog === 'edit'} onClose={() => setDialog(null)}>
        <DialogForm
          submitLabel="Guardar"
          onSubmit={async (f) => {
            const s = (k: string) => (String(f.get(k) ?? '').trim() || undefined);
            const n = (k: string) => (s(k) ? Number(s(k)) : undefined);
            await api(`/vehicles/${v.id}`, {
              method: 'PATCH',
              json: {
                vin: s('vin'), engineNumber: s('engineNumber'), color: s('color'), year: n('year'), loadCapacityKg: n('loadCapacityKg'),
                costCenter: s('costCenter'), serviceType: s('serviceType'), notes: s('notes'),
              },
            });
            await done('Datos actualizados');
          }}
        >
          <Field label="VIN / chasis" name="vin" defaultValue={v.vin ?? ''} />
          <Field label="No. motor" name="engineNumber" defaultValue={v.engineNumber ?? ''} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Año modelo" name="year" type="number" defaultValue={v.year ?? ''} />
            <Field label="Color" name="color" defaultValue={v.color ?? ''} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacidad (kg)" name="loadCapacityKg" type="number" defaultValue={v.loadCapacityKg ?? ''} />
            <Field label="Centro de costo" name="costCenter" defaultValue={v.costCenter ?? ''} />
          </div>
          <Select label="Servicio" name="serviceType" defaultValue={v.serviceType ?? ''}>
            <option value="">—</option>
            <option value="PUBLICO">Público</option>
            <option value="PARTICULAR">Particular</option>
          </Select>
          <Field label="Observaciones" name="notes" defaultValue={v.notes ?? ''} />
        </DialogForm>
      </Modal>

      <Modal
        title={typeof dialog === 'object' && dialog ? docTypes.find((t) => t.code === dialog.doc)?.name ?? 'Documento' : 'Documento'}
        open={typeof dialog === 'object' && dialog !== null}
        onClose={() => setDialog(null)}
      >
        {typeof dialog === 'object' && dialog && (
          <DialogForm
            submitLabel="Guardar documento"
            onSubmit={async (f) => {
              const s = (k: string) => (String(f.get(k) ?? '').trim() || undefined);
              await api(`/vehicles/${v.id}/documents/${dialog.doc}`, {
                method: 'PUT',
                json: { number: s('number'), issuer: s('issuer'), issuedAt: s('issuedAt'), expiresAt: s('expiresAt') },
              });
              await done('Documento guardado');
            }}
          >
            {(() => {
              const d = docByType.get(dialog.doc);
              return (
                <>
                  {(docTypes.find((t) => t.code === dialog.doc)?.alertDays.length ?? 1) > 0 && (
                    <Field label="Fecha de vencimiento" name="expiresAt" type="date" defaultValue={d?.expiresAt?.slice(0, 10) ?? ''} required />
                  )}
                  <Field label="Número" name="number" defaultValue={d?.number ?? ''} />
                  <Field label="Entidad / aseguradora" name="issuer" defaultValue={d?.issuer ?? ''} />
                  <Field label="Fecha de expedición" name="issuedAt" type="date" defaultValue={d?.issuedAt?.slice(0, 10) ?? ''} />
                </>
              );
            })()}
          </DialogForm>
        )}
      </Modal>
    </div>
  );
}
