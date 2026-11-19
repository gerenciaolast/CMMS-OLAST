'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Search } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Modal, SecondaryButton, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { daysUntil, day, type Driver } from '@/lib/fleet';

interface Site { code: string; name: string }

function License({ d }: { d: Driver }) {
  if (!d.licenseExpiry) return <span className="text-muted">—</span>;
  const left = daysUntil(d.licenseExpiry);
  const tone = left < 0 ? 'text-danger font-semibold' : left <= 30 ? 'text-warn font-semibold' : '';
  return <span className={tone}>{d.licenseCategory ?? ''} · {left < 0 ? `vencida ${day(d.licenseExpiry)}` : day(d.licenseExpiry)}</span>;
}

export default function DriversPage() {
  const { can } = useSession();
  const [rows, setRows] = useState<Driver[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Driver | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => api<Driver[]>('/drivers?includeInactive=true').then(setRows), []);
  useEffect(() => {
    void load();
    void api<Site[]>('/sites').then(setSites);
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((d) => !t || `${d.fullName} ${d.documentId ?? ''} ${d.vehicles.map((v) => v.vehicle.plate).join(' ')}`.toLowerCase().includes(t));
  }, [rows, q]);

  const current = editing && editing !== 'new' ? editing : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conductores</h1>
          <p className="text-muted">Un vehículo puede tener varios conductores; cualquiera de ellos puede hacer la inspección diaria.</p>
        </div>
        {can('vehicle.edit') && (
          <div className="flex gap-2">
            <Link href="/vehiculos/importar"><SecondaryButton><FileSpreadsheet size={16} /> Cargar desde Excel</SecondaryButton></Link>
            <Button onClick={() => setEditing('new')} className="h-10 gap-1.5"><Plus size={16} /> Nuevo conductor</Button>
          </div>
        )}
      </div>
      {notice && <Alert tone="ok">{notice}</Alert>}
      <label className="relative block max-w-md">
        <Search className="absolute top-3 left-3 text-muted" size={18} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, cédula o placa" className="h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-10" />
      </label>
      {!rows && <p className="text-muted">Cargando…</p>}
      {rows && filtered.length === 0 && <Card><p className="text-muted">No hay conductores. Créelos aquí o súbalos con la plantilla de Excel (hoja «Conductores»).</p></Card>}
      {filtered.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs tracking-wide text-muted uppercase">
              <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Cédula</th><th className="px-4 py-3">Teléfono</th><th className="px-4 py-3">Sede</th><th className="px-4 py-3">Licencia</th><th className="px-4 py-3">Vehículos</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((d) => (
                <tr key={d.id} className={d.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 font-medium">{d.fullName}{!d.active && <Badge className="ml-2 border-line text-muted">Inactivo</Badge>}</td>
                  <td className="px-4 py-3">{d.documentId ?? <span className="text-warn">pendiente</span>}</td>
                  <td className="px-4 py-3">{d.phone ? <a href={`tel:${d.phone}`} className="text-brand">{d.phone}</a> : '—'}</td>
                  <td className="px-4 py-3">{d.site?.name ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><License d={d} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {d.vehicles.map((x) => (
                        <Link key={x.vehicle.id} href={`/vehiculos/${x.vehicle.id}`}>
                          <Badge className={x.isPrimary ? 'border-brand/40 bg-sky/25 text-brand-800' : 'border-line'}>{x.vehicle.plate}</Badge>
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{can('vehicle.edit') && <button className="font-medium text-brand hover:underline" onClick={() => setEditing(d)}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal title={current ? 'Editar conductor' : 'Nuevo conductor'} open={editing !== null} onClose={() => { setEditing(null); setError(null); }}>
        <form
          className="space-y-4"
          key={current?.id ?? 'new'}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const s = (k: string) => (String(f.get(k) ?? '').trim() || null);
            const body = {
              fullName: s('fullName'), documentId: s('documentId'), phone: s('phone'), email: s('email'), licenseNumber: s('licenseNumber'),
              licenseCategory: s('licenseCategory'), licenseExpiry: s('licenseExpiry'), siteCode: s('siteCode'), notes: s('notes'),
              ...(current ? { active: f.get('active') === 'on' } : {}),
            };
            try {
              await api(current ? `/drivers/${current.id}` : '/drivers', { method: current ? 'PATCH' : 'POST', json: body });
              setEditing(null);
              setNotice(current ? 'Conductor actualizado' : 'Conductor creado. Asígnelo a sus vehículos desde la hoja de vida del vehículo.');
              await load();
            } catch (err) {
              const d = err instanceof ApiError ? (err.details as { message: string }[] | undefined) : undefined;
              setError(err instanceof ApiError ? (Array.isArray(d) && d.length ? d.map((x) => x.message).join('. ') : err.code === 'DUPLICATE' ? 'Ya existe un conductor con esa cédula' : err.message) : 'No fue posible guardar');
            }
          }}
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Nombre completo" name="fullName" defaultValue={current?.fullName ?? ''} required minLength={3} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cédula" name="documentId" defaultValue={current?.documentId ?? ''} inputMode="numeric" />
            <Field label="Teléfono" name="phone" type="tel" defaultValue={current?.phone ?? ''} />
          </div>
          <Field label="Correo" name="email" type="email" defaultValue={current?.email ?? ''} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="No. licencia" name="licenseNumber" defaultValue={current?.licenseNumber ?? ''} />
            <Field label="Categoría" name="licenseCategory" defaultValue={current?.licenseCategory ?? ''} placeholder="C2" />
            <Field label="Vence" name="licenseExpiry" type="date" defaultValue={current?.licenseExpiry?.slice(0, 10) ?? ''} />
          </div>
          <Select label="Sede" name="siteCode" defaultValue={current?.site?.code ?? ''}>
            <option value="">—</option>
            {sites.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Select>
          <Field label="Observaciones" name="notes" defaultValue={current?.notes ?? ''} />
          {current && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={current.active} className="h-4 w-4 accent-brand" /> Activo</label>
          )}
          <Button type="submit" className="w-full">Guardar</Button>
        </form>
      </Modal>
    </div>
  );
}
