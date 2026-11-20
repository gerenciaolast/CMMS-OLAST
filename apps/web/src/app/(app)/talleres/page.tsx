'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert, Button, Card, Field, Modal, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { money } from '@/lib/fleet';

interface Supplier { id: string; name: string; kind: string; city: string | null; phone: string | null; contact: string | null; taxId: string | null }
interface Technician { id: string; name: string; level: string; hourlyCost: string }
interface Site { code: string; name: string }
const KIND: Record<string, string> = { workshop: 'Taller', dealer: 'Concesionario', parts: 'Repuestos', tires: 'Llantas', other: 'Otro' };

export default function WorkshopsPage() {
  const { can } = useSession();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [dialog, setDialog] = useState<null | 'supplier' | 'technician'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    void api<Supplier[]>('/suppliers').then(setSuppliers);
    void api<Technician[]>('/technicians').then(setTechnicians);
  }, []);
  useEffect(() => {
    load();
    void api<Site[]>('/sites').then(setSites);
  }, [load]);

  const submit = async (path: string, body: object, msg: string) => {
    setError(null);
    try {
      await api(path, { method: 'POST', json: body });
      setDialog(null);
      setNotice(msg);
      load();
    } catch (e) {
      const d = e instanceof ApiError ? (e.details as { message: string }[] | undefined) : undefined;
      setError(e instanceof ApiError ? (e.code === 'DUPLICATE' ? 'Ya existe con ese nombre' : Array.isArray(d) && d.length ? d.map((x) => x.message).join('. ') : e.message) : 'No fue posible guardar');
    }
  };
  const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim() || null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Talleres y técnicos</h1>
        <p className="text-muted">Proveedores externos (talleres, concesionarios, llanteras) y técnicos propios con su costo por hora.</p>
      </div>
      {notice && <Alert tone="ok">{notice}</Alert>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Proveedores ({suppliers.length})</h2>
            {can('work_order.plan') && <Button className="h-9 gap-1 px-3" onClick={() => setDialog('supplier')}><Plus size={16} /> Nuevo</Button>}
          </div>
          <ul className="divide-y divide-line text-sm">
            {suppliers.map((x) => (
              <li key={x.id} className="py-2">
                <p className="font-medium">{x.name}</p>
                <p className="text-muted">{[KIND[x.kind] ?? x.kind, x.city, x.contact, x.phone, x.taxId ? `NIT ${x.taxId}` : null].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
            {suppliers.length === 0 && <li className="py-2 text-muted">Sin proveedores.</li>}
          </ul>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Técnicos ({technicians.length})</h2>
            {can('work_order.plan') && <Button className="h-9 gap-1 px-3" onClick={() => setDialog('technician')}><Plus size={16} /> Nuevo</Button>}
          </div>
          <ul className="divide-y divide-line text-sm">
            {technicians.map((t) => (
              <li key={t.id} className="flex justify-between py-2"><span className="font-medium">{t.name} <span className="text-muted">· {t.level}</span></span><span className="tabular-nums">{money(t.hourlyCost)}/h</span></li>
            ))}
            {technicians.length === 0 && <li className="py-2 text-muted">Sin técnicos. Si todo el mantenimiento es externo, registre el costo como servicio externo en la OT.</li>}
          </ul>
        </Card>
      </div>

      <Modal title="Nuevo proveedor" open={dialog === 'supplier'} onClose={() => setDialog(null)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void submit('/suppliers', { name: s(f, 'name'), kind: s(f, 'kind'), taxId: s(f, 'taxId'), city: s(f, 'city'), contact: s(f, 'contact'), phone: s(f, 'phone') }, 'Proveedor creado'); }}>
          {error && <Alert>{error}</Alert>}
          <Field label="Nombre" name="name" required minLength={2} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo" name="kind" defaultValue="workshop">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Field label="NIT" name="taxId" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ciudad" name="city" />
            <Field label="Teléfono" name="phone" type="tel" />
          </div>
          <Field label="Contacto" name="contact" />
          <Button type="submit" className="w-full">Guardar</Button>
        </form>
      </Modal>
      <Modal title="Nuevo técnico" open={dialog === 'technician'} onClose={() => setDialog(null)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void submit('/technicians', { name: s(f, 'name'), level: s(f, 'level'), hourlyCost: Number(f.get('hourlyCost') || 0), siteCode: s(f, 'siteCode') }, 'Técnico creado'); }}>
          {error && <Alert>{error}</Alert>}
          <Field label="Nombre" name="name" required minLength={3} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Nivel" name="level" defaultValue="N2"><option value="N2">N2 Taller básico</option><option value="N3">N3 Especializado</option><option value="N4">N4 Overhaul</option></Select>
            <Field label="Costo por hora (COP)" name="hourlyCost" type="number" min={0} required />
          </div>
          <Select label="Sede" name="siteCode" defaultValue=""><option value="">—</option>{sites.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select>
          <Button type="submit" className="w-full">Guardar</Button>
        </form>
      </Modal>
    </div>
  );
}
