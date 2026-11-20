'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { Alert, Button, Card, SecondaryButton } from '@/components/ui';
import { PmBadge, PmBar } from '@/components/pm';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { km, shortDay } from '@/lib/fleet';
import type { PmPlan, PmScheduleRow } from '@/lib/maintenance';

interface Site { code: string; name: string }

function Forecast({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<PmScheduleRow[] | null>(null);
  const [filter, setFilter] = useState<'alert' | 'all'>('alert');
  const [site, setSite] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (site) p.set('site', site);
    void api<PmScheduleRow[]>(`/pm/forecast?${p}`).then(setRows);
  }, [site]);
  useEffect(() => {
    load();
    void api<Site[]>('/sites').then(setSites);
  }, [load]);

  const counts = useMemo(() => {
    const c = { overdue: 0, due: 0, upcoming: 0, ok: 0 } as Record<string, number>;
    rows?.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status !== 'ok');
  const estimated = (rows ?? []).filter((r) => r.baselineEstimated).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([['overdue', 'Vencidos', 'text-danger'], ['due', 'Vencen ya (OT generada)', 'text-warn'], ['upcoming', 'Próximos (≥ 80 %)', 'text-brand'], ['ok', 'Al día', 'text-ok']] as const).map(([k, l, t]) => (
          <Card key={k} className="p-4"><p className="text-sm text-muted">{l}</p><p className={`text-2xl font-bold ${counts[k] ? t : ''}`}>{counts[k] ?? 0}</p></Card>
        ))}
      </div>
      {notice && <Alert tone="ok">{notice}</Alert>}
      {estimated > 0 && (
        <Alert tone="warn">
          <span className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {estimated} vencimiento(s) usan una línea base estimada (último preventivo del historial). Confírmela en la hoja de vida de cada vehículo con «Registrar última ejecución» y mantenga el kilometraje al día: las alarmas por km dependen de él.</span>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {([['alert', 'Requieren atención'], ['all', 'Todos']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`h-9 rounded-full border px-4 text-sm ${filter === k ? 'border-brand bg-brand text-white' : 'border-line bg-surface hover:border-brand'}`}>{l}</button>
        ))}
        <select aria-label="Sede" value={site} onChange={(e) => setSite(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm">
          <option value="">Todas las sedes</option>
          {sites.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        {canManage && (
          <SecondaryButton className="ml-auto" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await api<{ generated: string[] }>('/pm/recompute', { method: 'POST' });
              setNotice(r.generated.length ? `OT preventivas generadas: ${r.generated.join(', ')}` : 'Vencimientos recalculados: no hay OT nuevas por generar');
              load();
            } finally {
              setBusy(false);
            }
          }}><RefreshCw size={16} /> Recalcular</SecondaryButton>
        )}
      </div>
      {!rows && <p className="text-muted">Cargando…</p>}
      {rows && shown.length === 0 && <Card><p className="text-muted">{rows.length ? 'Nada requiere atención: todos los preventivos están al día.' : 'Ningún vehículo tiene plan asignado todavía.'}</p></Card>}
      {shown.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs tracking-wide text-muted uppercase">
              <tr><th className="px-4 py-3">Vehículo</th><th className="px-4 py-3">Rutina</th><th className="px-4 py-3">Consumido</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Próximo km</th><th className="px-4 py-3">Límite por tiempo</th><th className="px-4 py-3">Proyección</th><th className="px-4 py-3">OT</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3"><Link href={`/vehiculos/${r.vehicle!.id}`} className="font-semibold text-brand">{r.vehicle!.plate}</Link><p className="text-xs text-muted">{r.vehicle!.site.name} · {km(r.vehicle!.currentOdometer)}</p></td>
                  <td className="px-4 py-3"><p className="font-medium">{r.routine.name}</p><p className="text-xs text-muted">{r.routine.plan?.code}{r.baselineEstimated ? ' · base estimada' : ''}</p></td>
                  <td className="px-4 py-3"><PmBar pct={Number(r.pctConsumed)} status={r.status} /><p className="text-xs text-muted">por {r.drivingDimension === 'days' ? 'tiempo' : 'km'}</p></td>
                  <td className="px-4 py-3"><PmBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{km(r.nextDueMeter)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{shortDay(r.nextDueDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{shortDay(r.projectedDueDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.openWorkOrderId ? <Link href={`/ot/${r.openWorkOrderId}`} className="font-medium text-brand">Ver OT</Link> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Plans({ canManage }: { canManage: boolean }) {
  const [plans, setPlans] = useState<PmPlan[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => void api<PmPlan[]>('/pm/plans').then(setPlans), []);
  useEffect(load, [load]);

  const save = async (path: string, init: RequestInit & { json?: unknown }, msg: string) => {
    try {
      await api(path, init);
      setNotice(msg);
      load();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'No fue posible guardar');
    }
  };

  return (
    <div className="space-y-3">
      {notice && <Alert tone="ok">{notice}</Alert>}
      {plans?.map((p) => (
        <Card key={p.id} className="p-0">
          <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen(open === p.id ? null : p.id)}>
            <ChevronRight size={18} className={`mt-1 shrink-0 transition ${open === p.id ? 'rotate-90' : ''}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.name} <span className="text-sm font-normal text-muted">· {p.code} · {p._count.vehicles} vehículo(s)</span></p>
              <p className="text-sm text-muted">{p.description}</p>
            </div>
          </button>
          {open === p.id && (
            <div className="space-y-4 border-t border-line p-4">
              {p.basis && <p className="rounded-lg bg-sky/15 p-3 text-sm"><strong>Base del plan:</strong> {p.basis}</p>}
              {p.routines.map((r) => (
                <div key={r.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{r.name} {r.includes.length > 0 && <span className="text-xs font-normal text-muted">(incluye {r.includes.join(', ')})</span>}</p>
                    {canManage ? (
                      <form className="flex items-center gap-2 text-sm" onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void save(`/pm/routines/${r.id}`, { method: 'PATCH', json: { intervalDistance: Number(f.get('km')) || null, intervalDays: Number(f.get('days')) || null } }, `Intervalo de ${r.name} actualizado: los vencimientos se recalcularon`);
                      }}>
                        <label>cada <input name="km" type="number" min={100} step={500} defaultValue={r.intervalDistance ?? ''} className="h-9 w-24 rounded border border-line px-2 tabular-nums" /> km</label>
                        <label>o <input name="days" type="number" min={7} defaultValue={r.intervalDays ?? ''} className="h-9 w-16 rounded border border-line px-2 tabular-nums" /> días</label>
                        <SecondaryButton type="submit" className="h-9">Guardar</SecondaryButton>
                      </form>
                    ) : (
                      <p className="text-sm text-muted">cada {r.intervalDistance?.toLocaleString('es-CO')} km o {r.intervalDays} días</p>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {r.tasks.map((t) => (
                      <li key={t.id} className="flex items-start justify-between gap-2">
                        <span>• {t.description}{t.rationale && <span className="block pl-3 text-xs text-warn">{t.rationale}</span>}</span>
                        {canManage && <button aria-label="Quitar tarea" className="text-muted hover:text-danger" onClick={() => void save(`/pm/tasks/${t.id}`, { method: 'DELETE' }, 'Tarea quitada del plan')}><Trash2 size={14} /></button>}
                      </li>
                    ))}
                  </ul>
                  {canManage && (
                    <form className="mt-2 flex gap-2" onSubmit={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.elements.namedItem('task') as HTMLInputElement;
                      if (input.value.trim().length < 3) return;
                      void save(`/pm/routines/${r.id}/tasks`, { method: 'POST', json: { description: input.value.trim() } }, 'Tarea agregada al plan');
                      input.value = '';
                    }}>
                      <input name="task" placeholder="Agregar tarea a esta rutina…" className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm" />
                      <SecondaryButton type="submit" className="h-9">Agregar</SecondaryButton>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function PreventivePage() {
  const { can } = useSession();
  const [tab, setTab] = useState<'forecast' | 'plans'>('forecast');
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = can('pm_plan.manage');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mantenimiento preventivo</h1>
          <p className="text-muted">Kilómetros o tiempo, lo que ocurra primero. Al 90 % del intervalo se genera la OT automáticamente.</p>
        </div>
        {canManage && (
          <Button className="h-10 gap-1.5" onClick={async () => {
            const r = await api<{ assigned: { plate: string; plan: string }[]; skipped: string[] }>('/pm/assign-suggested', { method: 'POST' });
            setNotice(r.assigned.length ? `Planes asignados a ${r.assigned.length} vehículo(s): ${r.assigned.map((a) => `${a.plate} → ${a.plan}`).join(', ')}` : 'Todos los vehículos ya tienen plan asignado');
          }}><Wand2 size={16} /> Asignar planes sugeridos</Button>
        )}
      </div>
      {notice && <Alert tone="ok">{notice}</Alert>}
      <div className="flex gap-2 border-b border-line">
        {([['forecast', 'Pronóstico y alarmas'], ['plans', 'Planes']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      {tab === 'forecast' ? <Forecast canManage={canManage} key={notice ?? ''} /> : <Plans canManage={canManage} />}
    </div>
  );
}
