'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Component { code: string; name: string; level: number }
interface Site { id: string; code: string; name: string }

const ROADMAP = [
  ['S1', 'Flota y lecturas', 'Hoja de vida del vehículo, criticidad A/B/C, estados y odómetro con validaciones'],
  ['S2', 'Avisos y órdenes de trabajo', 'Ciclo completo de la OT, costos, esperas y codificación de fallas'],
  ['S3', 'Preventivo y alarmas', 'Planes por km/horas/tiempo, OT automática al 90 %, previsión de 4 semanas'],
  ['S4', 'Inspección diaria y documentos', 'Checklist en el celular, bloqueo por defecto crítico, SOAT y técnico-mecánica'],
  ['S5', 'Indicadores', '14 KPI, Pareto de fallas y vehículos con más fallas'],
] as const;

export default function Home() {
  const { me } = useSession();
  const [systems, setSystems] = useState<Component[]>([]);
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    void api<Component[]>('/catalog/components?level=1').then(setSystems).catch(() => undefined);
    void api<Site[]>('/sites').then(setSites).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {me?.fullName.split(' ')[0]}</h1>
        <p className="text-muted">Sistema de gestión de mantenimiento de la flota OLAST.</p>
      </div>
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
              <span className="h-6 shrink-0 rounded bg-accent/20 px-2 text-sm font-semibold text-warn">{s}</span>
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
