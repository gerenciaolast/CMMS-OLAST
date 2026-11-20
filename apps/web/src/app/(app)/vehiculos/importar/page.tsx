'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CalendarX, Download, History, Upload } from 'lucide-react';
import { useSession } from '@/lib/session';
import { money } from '@/lib/fleet';
import { Alert, Button, Card, SecondaryButton } from '@/components/ui';
import { api, apiDownload, ApiError } from '@/lib/api';

interface Report {
  created: string[]; updated: string[]; skipped: string[]; readings: number; documents: number; drivers: number; transfers: number; criticality: number; warnings: string[];
}

interface HistoryReport {
  dryRun: boolean; created: number; updated: number; skippedExisting: number; approximateDates: number;
  newRows: { plate: string; date: string; km: number | null; type: string; amount: number; description: string }[];
  updatedRows: { plate: string; number: string; changes: string[] }[];
  notInFile: { plate: string; number: string; date: string; description: string }[];
  meterUpdates: { plate: string; km: number; date: string }[];
  warnings: string[];
  pm: { cancelled: { plate: string; number: string; reason: string }[]; baselines: unknown[] } | null;
}

function HistoryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<HistoryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async (dry: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      setReport(await api<HistoryReport>(`/imports/maintenance-history${dry ? '?dryRun=true' : ''}`, { method: 'POST', body: fd }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible leer el historial');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><History size={18} /> Historial de mantenimiento (Excel)</h2>
        <p className="text-sm text-muted">Suba la «Hoja de vida de mantenimiento» actualizada. El sistema reconoce cada intervención por su contenido: solo agrega lo nuevo y aplica las correcciones, sin duplicar. Primero revise los cambios y luego aplíquelos.</p>
      </div>
      <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }}
        className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-sky/30 file:px-3 file:font-medium file:text-brand-800" />
      <div className="flex flex-wrap gap-2">
        <SecondaryButton disabled={!file || busy} onClick={() => send(true)}>1. Revisar cambios</SecondaryButton>
        <Button disabled={!file || busy || !report?.dryRun || report.created + report.updated + report.meterUpdates.length === 0} onClick={() => send(false)} className="h-10">2. Aplicar</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {report && (
        <div className="space-y-3 text-sm">
          <Alert tone={report.dryRun ? 'warn' : 'ok'}>
            {report.dryRun ? 'Simulación (aún no se guardó nada): ' : 'Aplicado: '}
            {report.created} nueva(s) · {report.updated} corregida(s) · {report.skippedExisting} sin cambios · {report.meterUpdates.length} kilometraje(s) actualizado(s)
          </Alert>
          {report.newRows.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-lg border border-line">
              <table className="w-full">
                <thead className="sticky top-0 bg-canvas text-left text-xs text-muted uppercase"><tr><th className="p-2">Placa</th><th className="p-2">Fecha</th><th className="p-2">Tipo</th><th className="p-2 text-right">Km</th><th className="p-2 text-right">Valor</th><th className="p-2">Descripción</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {report.newRows.map((r, i) => (
                    <tr key={i}><td className="p-2 font-medium">{r.plate}</td><td className="p-2 whitespace-nowrap">{r.date}</td><td className="p-2">{r.type === 'PM' ? 'Prev.' : 'Corr.'}</td><td className="p-2 text-right tabular-nums">{r.km?.toLocaleString('es-CO') ?? '—'}</td><td className="p-2 text-right tabular-nums whitespace-nowrap">{money(r.amount)}</td><td className="p-2">{r.description}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report.updatedRows.length > 0 && <div><p className="font-medium">Correcciones</p><ul className="list-disc pl-5">{report.updatedRows.map((u) => <li key={u.number}>{u.plate} {u.number}: {u.changes.join(', ')}</li>)}</ul></div>}
          {report.meterUpdates.length > 0 && <p><span className="font-medium">Kilometraje actualizado: </span>{report.meterUpdates.map((m) => `${m.plate} ${m.km.toLocaleString('es-CO')}`).join(' · ')}</p>}
          {report.notInFile.length > 0 && <div><p className="font-medium text-warn">Están en el sistema pero ya no en el archivo (no se borran)</p><ul className="list-disc pl-5">{report.notInFile.map((u) => <li key={u.number}>{u.plate} {u.number} {u.date} · {u.description.slice(0, 80)}</li>)}</ul></div>}
          {report.pm && report.pm.cancelled.length > 0 && <div><p className="font-medium">OT preventivas canceladas porque el historial ya las resolvió</p><ul className="list-disc pl-5">{report.pm.cancelled.map((c) => <li key={c.number}>{c.plate} {c.number}: {c.reason}</li>)}</ul></div>}
          {report.warnings.length > 0 && <details><summary className="cursor-pointer text-muted">Advertencias ({report.warnings.length})</summary><ul className="list-disc pl-5">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>}
        </div>
      )}
    </Card>
  );
}

interface AvailabilityReport {
  dryRun: boolean; vehicles: number; linkedOrders: number; intervalsCreated: number; intervalsReplaced: number;
  stops: { corrective: number; preventive: number; days: number }; averageDays: { corrective: number | null; preventive: number | null };
  months: { sheet: string; month: string; workdays: number | null; realWorkdays: number; vehicles: number; correctiveDays: number; preventiveDays: number; availability: number | null; availabilityAll: number | null }[];
  byVehicle: { plate: string; stops: number; days: number; longest: { start: string; days: number; kind: string } | null }[];
  warnings: string[];
}
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')} %`);

function AvailabilityImport() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AvailabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async (dry: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      setReport(await api<AvailabilityReport>(`/imports/availability${dry ? '?dryRun=true' : ''}`, { method: 'POST', body: fd }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible leer el cuadro');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><CalendarX size={18} /> Cuadro de disponibilidad de flota (Excel)</h2>
        <p className="text-sm text-muted">El «Cálculo de disponibilidad» mensual (FDS por día). Reconstruye cuándo estuvo cada vehículo fuera de servicio, une las paradas que los domingos y festivos dejan partidas y las liga a su OT. Alimenta la disponibilidad y los días fuera de servicio por parada. Se puede volver a cargar: reemplaza lo cargado antes y no toca los estados registrados en el CMMS.</p>
      </div>
      <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }}
        className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-sky/30 file:px-3 file:font-medium file:text-brand-800" />
      <div className="flex flex-wrap gap-2">
        <SecondaryButton disabled={!file || busy} onClick={() => send(true)}>1. Revisar</SecondaryButton>
        <Button disabled={!file || busy || !report?.dryRun || report.intervalsCreated === 0} onClick={() => send(false)} className="h-10">2. Aplicar</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {report && (
        <div className="space-y-3 text-sm">
          <Alert tone={report.dryRun ? 'warn' : 'ok'}>
            {report.dryRun ? 'Simulación (aún no se guardó nada): ' : 'Aplicado: '}
            {report.vehicles} vehículos · {report.stops.corrective} paradas correctivas (promedio {report.averageDays.corrective?.toFixed(1).replace('.', ',') ?? '—'} d) · {report.stops.preventive} preventivas ({report.averageDays.preventive?.toFixed(1).replace('.', ',') ?? '—'} d) · {report.linkedOrders} ligadas a su OT
          </Alert>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-xs text-muted uppercase"><tr><th className="py-1 pr-3">Mes</th><th className="py-1 pr-3 text-right">Días hábiles</th><th className="py-1 pr-3 text-right">Días correctivo</th><th className="py-1 pr-3 text-right">Días preventivo</th><th className="py-1 pr-3 text-right">Disponibilidad (como el cuadro)</th><th className="py-1 text-right">Con preventivos</th></tr></thead>
              <tbody className="divide-y divide-line">
                {report.months.map((m) => <tr key={m.sheet}><td className="py-1 pr-3">{m.month}</td><td className="py-1 pr-3 text-right tabular-nums">{m.realWorkdays}{m.workdays != null && m.workdays !== m.realWorkdays && <span className="text-warn" title="Días programados que usa el cuadro"> (cuadro: {m.workdays})</span>}</td><td className="py-1 pr-3 text-right tabular-nums">{m.correctiveDays}</td><td className="py-1 pr-3 text-right tabular-nums">{m.preventiveDays}</td><td className="py-1 pr-3 text-right tabular-nums">{pct(m.availability)}</td><td className="py-1 text-right tabular-nums">{pct(m.availabilityAll)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">«Como el cuadro»: (días programados − días de parada correctiva) / días programados, promediado en toda la flota del cuadro. El resumen del archivo promedia solo las primeras filas, por eso puede no coincidir con él.</p>
          {report.byVehicle.length > 0 && <p><span className="font-medium">Más días parados: </span>{report.byVehicle.slice(0, 5).map((v) => `${v.plate} ${v.days} d${v.longest && v.longest.days >= 7 ? ` (parada de ${v.longest.days} d desde ${v.longest.start})` : ''}`).join(' · ')}</p>}
          {report.warnings.length > 0 && <details><summary className="cursor-pointer text-muted">Advertencias ({report.warnings.length})</summary><ul className="list-disc pl-5">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>}
        </div>
      )}
    </Card>
  );
}

export default function ImportPage() {
  const { can } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Link href="/vehiculos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><ArrowLeft size={16} /> Flota</Link>
      <div>
        <h1 className="text-2xl font-bold">Cargas desde Excel</h1>
        <p className="text-muted">Descargue la plantilla con los datos actuales, complete lo pendiente (celdas amarillas) y súbala. Puede repetirlo cuantas veces necesite.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">1. Descargar</h2>
          <p className="text-sm text-muted">Incluye vehículos, conductores (con sus placas), documentos y la lista de pendientes por vehículo.</p>
          <SecondaryButton
            onClick={async () => {
              setError(null);
              try {
                await apiDownload('/imports/fleet-template', 'Plantilla_flota_OLAST.xlsx');
              } catch (e) {
                setError(e instanceof ApiError ? e.message : 'No fue posible descargar');
              }
            }}
          >
            <Download size={16} /> Descargar plantilla
          </SecondaryButton>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">2. Subir la plantilla completada</h2>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }}
            className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-sky/30 file:px-3 file:font-medium file:text-brand-800"
          />
          <Button
            disabled={!file || busy}
            onClick={async () => {
              if (!file) return;
              setBusy(true); setError(null); setReport(null);
              const fd = new FormData();
              fd.append('file', file);
              try {
                setReport(await api<Report>('/imports/fleet', { method: 'POST', body: fd }));
              } catch (e) {
                setError(e instanceof ApiError ? e.message : 'No fue posible importar');
              } finally {
                setBusy(false);
              }
            }}
            className="gap-1.5"
          >
            <Upload size={16} /> {busy ? 'Importando…' : 'Importar'}
          </Button>
        </Card>
      </div>

      {error && <Alert>{error}</Alert>}
      {report && (
        <Card className="space-y-3">
          <Alert tone="ok">Importación terminada.</Alert>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li><strong>{report.created.length}</strong> vehículos nuevos</li>
            <li><strong>{report.updated.length}</strong> vehículos actualizados</li>
            <li><strong>{report.transfers}</strong> traslados de sede</li>
            <li><strong>{report.drivers}</strong> conductores</li>
            <li><strong>{report.readings}</strong> lecturas de km</li>
            <li><strong>{report.documents}</strong> documentos</li>
            <li><strong>{report.criticality}</strong> criticidades</li>
            <li><strong>{report.skipped.length}</strong> omitidos (Incluir = NO)</li>
          </ul>
          {report.warnings.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-warn">Revise ({report.warnings.length})</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      {can('work_order.plan') && <HistoryImport />}
      {can('vehicle.change_status') && <AvailabilityImport />}
    </div>
  );
}
