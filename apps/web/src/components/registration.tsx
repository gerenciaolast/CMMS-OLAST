'use client';
import { useState } from 'react';
import { AlertTriangle, IdCard, Pencil } from 'lucide-react';
import { Alert, Button, Card, Field, Modal, SecondaryButton, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { day, OWNERSHIP_LABEL, type Registration } from '@/lib/fleet';

type Key = keyof Registration;
const FIELDS: { key: Key; label: string; kind?: 'number' | 'date'; span?: 2 }[] = [
  { key: 'licenseNumber', label: 'Licencia No.' }, { key: 'cardNumber', label: 'Tarjeta (LT)' },
  { key: 'registeredAt', label: 'Fecha de matrícula', kind: 'date' }, { key: 'issuedAt', label: 'Expedición de la licencia', kind: 'date' },
  { key: 'authority', label: 'Organismo de tránsito', span: 2 }, { key: 'ownerName', label: 'Propietario', span: 2 }, { key: 'ownerId', label: 'Identificación del propietario' },
  { key: 'ownershipLimitation', label: 'Limitación a la propiedad' },
  { key: 'make', label: 'Marca' }, { key: 'line', label: 'Línea' }, { key: 'year', label: 'Modelo (año)', kind: 'number' }, { key: 'color', label: 'Color' },
  { key: 'vehicleClass', label: 'Clase de vehículo' }, { key: 'bodyType', label: 'Tipo de carrocería' }, { key: 'fuel', label: 'Combustible' }, { key: 'capacity', label: 'Capacidad (kg / psj)' },
  { key: 'displacementCc', label: 'Cilindrada (cc)', kind: 'number' }, { key: 'powerHp', label: 'Potencia (HP)', kind: 'number' }, { key: 'doors', label: 'Puertas', kind: 'number' }, { key: 'armor', label: 'Blindaje' },
  { key: 'vin', label: 'VIN' }, { key: 'engineNumber', label: 'Número de motor' }, { key: 'serialNumber', label: 'Número de serie' }, { key: 'chassisNumber', label: 'Número de chasis' },
  { key: 'importDeclaration', label: 'Declaración de importación' }, { key: 'importDate', label: 'Fecha de importación', kind: 'date' },
];

/** Tarjeta «Licencia de tránsito» de la hoja de vida: muestra los datos de la tarjeta de propiedad y permite corregirlos. */
export function RegistrationCard({ vehicleId, registration, ownership, canEdit, onSaved }: {
  vehicleId: string; registration?: Registration; ownership: string; canEdit: boolean; onSaved: (msg: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = registration;
  const show = (k: Key) => {
    const v = r?.[k];
    if (v == null || v === '') return '—';
    return FIELDS.find((f) => f.key === k)?.kind === 'date' ? day(String(v)) : String(v);
  };
  return (
    <Card className="lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><IdCard size={18} /> Licencia de tránsito</h2>
        {canEdit && <SecondaryButton onClick={() => { setError(null); setOpen(true); }}><Pencil size={16} /> {r ? 'Corregir' : 'Registrar'}</SecondaryButton>}
      </div>
      {!r ? (
        <p className="text-sm text-muted">Sin datos de la licencia de tránsito.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
                <dt className="text-xs text-muted">{f.label}</dt>
                <dd className="font-medium break-words">{show(f.key)}</dd>
              </div>
            ))}
            <div><dt className="text-xs text-muted">Propiedad</dt><dd className="font-medium">{OWNERSHIP_LABEL[ownership as keyof typeof OWNERSHIP_LABEL] ?? ownership}</dd></div>
          </dl>
          {(r.reviewNotes?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-warn">
              {r.reviewNotes!.map((n) => <li key={n} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Verificar: {n}</li>)}
            </ul>
          )}
        </>
      )}
      <Modal title="Licencia de tránsito" open={open} onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const body: Record<string, unknown> = {};
            for (const x of FIELDS) {
              const raw = String(f.get(x.key) ?? '').trim();
              body[x.key] = raw === '' ? null : x.kind === 'number' ? Number(raw.replace(/\./g, '')) : x.key === 'vin' ? raw.toUpperCase() : raw;
            }
            body.serviceType = String(f.get('serviceType') ?? '') || null;
            const notes = String(f.get('reviewNotes') ?? '').split('\n').map((n) => n.trim()).filter(Boolean);
            body.reviewNotes = notes;
            try {
              const res = await api<{ changes: { field: string }[] }>(`/vehicles/${vehicleId}/registration`, { method: 'PUT', json: body });
              setOpen(false);
              await onSaved(`Licencia de tránsito guardada${res.changes.length ? ` · ficha actualizada (${res.changes.length} dato(s))` : ''}`);
            } catch (err) {
              const d = err instanceof ApiError ? (err.details as { path?: string[]; message: string }[] | undefined) : undefined;
              setError(err instanceof ApiError ? (Array.isArray(d) && d.length ? d.map((x) => `${FIELDS.find((ff) => ff.key === x.path?.[0])?.label ?? x.path?.join('.')}: ${x.message}`).join('. ') : err.message) : 'No fue posible guardar');
            }
          }}
        >
          {error && <Alert>{error}</Alert>}
          <p className="text-sm text-muted">Copie los datos tal como aparecen en la tarjeta. VIN, motor, año, color, servicio, propietario y capacidad también actualizan la ficha del vehículo; si el propietario es un banco, la propiedad queda como leasing.</p>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((x) => (
              <div key={x.key} className={x.span === 2 ? 'col-span-2' : ''}>
                <Field label={x.label} name={x.key} type={x.kind === 'date' ? 'date' : 'text'} inputMode={x.kind === 'number' ? 'numeric' : undefined}
                  defaultValue={r?.[x.key] == null ? '' : String(r[x.key]).slice(0, x.kind === 'date' ? 10 : undefined)} />
              </div>
            ))}
            <Select label="Servicio" name="serviceType" defaultValue={r?.serviceType ?? ''}>
              <option value="">—</option><option value="PUBLICO">Público</option><option value="PARTICULAR">Particular</option><option value="OFICIAL">Oficial</option>
            </Select>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Datos por verificar (uno por línea)</span>
            <textarea name="reviewNotes" rows={3} defaultValue={(r?.reviewNotes ?? []).join('\n')} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base" />
          </label>
          <Button type="submit" className="w-full">Guardar</Button>
        </form>
      </Modal>
    </Card>
  );
}
