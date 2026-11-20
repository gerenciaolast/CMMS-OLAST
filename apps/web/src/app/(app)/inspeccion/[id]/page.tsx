'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Alert, Badge, Card } from '@/components/ui';
import { AuthImage } from '@/components/auth-image';
import { api, ApiError } from '@/lib/api';
import { day, km } from '@/lib/fleet';
import { REQUEST_STATUS_LABEL } from '@/lib/maintenance';
import { RESULT_LABEL, RESULT_TONE, time, type InspectionDetail } from '@/lib/inspection';

const ANSWER: Record<string, { label: string; tone: string }> = {
  ok: { label: 'OK', tone: 'border-ok/40 text-ok' },
  defect: { label: 'Defecto', tone: 'border-danger bg-danger text-white' },
  na: { label: 'N.A.', tone: 'border-line text-muted' },
};

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [i, setI] = useState<InspectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<InspectionDetail>(`/inspections/${id}`).then(setI).catch((e) => setError(e instanceof ApiError ? e.message : 'No fue posible cargar')); }, [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!i) return <p className="text-muted">Cargando…</p>;
  return (
    <div className="space-y-5">
      <Link href={`/vehiculos/${i.vehicle.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><ArrowLeft size={16} /> {i.vehicle.plate}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Inspección {i.vehicle.plate}</h1>
        <Badge className={`text-sm ${RESULT_TONE[i.result]}`}>{RESULT_LABEL[i.result]}</Badge>
      </div>
      <Card className="grid gap-2 text-sm sm:grid-cols-4">
        <p><span className="text-muted">Fecha</span><br />{day(i.performedAt)} {time(i.performedAt)}</p>
        <p><span className="text-muted">Kilometraje</span><br />{km(i.odometer)}</p>
        <p><span className="text-muted">Firma</span><br />{i.signatureName}{i.driver && i.driver.fullName !== i.signatureName ? ` (conductor ${i.driver.fullName})` : ''}</p>
        <p><span className="text-muted">Duración</span><br />{i.durationSeconds != null ? `${Math.floor(i.durationSeconds / 60)} min ${i.durationSeconds % 60} s` : '—'}</p>
      </Card>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {i.results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
              <Badge className={`w-16 justify-center ${ANSWER[r.answer]!.tone}`}>{ANSWER[r.answer]!.label}</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.item.text}{r.item.isCritical && <span className="ml-2 text-xs text-danger">crítico</span>}</p>
                {r.comment && <p className="text-muted">{r.comment}</p>}
                {r.workRequest && (
                  <p className="text-xs"><Link href="/avisos" className="text-brand hover:underline">Aviso {r.workRequest.number}</Link> · {REQUEST_STATUS_LABEL[r.workRequest.status] ?? r.workRequest.status}{r.alreadyReported ? ' · ya estaba reportado' : ''}</p>
                )}
                {(() => {
                  // Defecto nuevo: las fotos van al aviso creado. Ya reportado: se guardan en esta inspección.
                  const photos = r.alreadyReported ? r.photos : [...r.photos, ...(r.workRequest?.photos ?? [])];
                  return photos.length > 0 && <div className="mt-2 flex gap-2">{photos.map((p) => <AuthImage key={p.id} attachmentId={p.id} alt={r.item.text} className="h-20 w-20 rounded-lg" />)}</div>;
                })()}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
