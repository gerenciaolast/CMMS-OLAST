import { Badge } from '@/components/ui';
import { PM_STATUS_LABEL, PM_STATUS_TONE } from '@/lib/maintenance';

export function PmBar({ pct, status }: { pct: number; status: string }) {
  const tone = status === 'overdue' ? 'bg-danger' : status === 'due' ? 'bg-warn' : status === 'upcoming' ? 'bg-brand-600' : 'bg-ok';
  return (
    <div className="flex items-center gap-2" title={`${Math.round(pct * 100)} % del intervalo consumido`}>
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-line">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} />
        <div className="absolute top-0 left-[90%] h-full w-px bg-ink/40" aria-hidden />
      </div>
      <span className="text-xs tabular-nums">{Math.round(pct * 100)}%</span>
    </div>
  );
}

export function PmBadge({ status }: { status: string }) {
  return <Badge className={PM_STATUS_TONE[status]}>{PM_STATUS_LABEL[status] ?? status}</Badge>;
}
