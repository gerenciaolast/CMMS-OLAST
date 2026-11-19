import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60 ${className}`}
      {...p}
    />
  );
}

export function Field({ label, error, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        {...p}
      />
      {error && <span className="mt-1 block text-sm text-danger">{error}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Alert({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'warn' | 'ok' }) {
  const c = { danger: 'border-danger/30 bg-danger/10 text-danger', warn: 'border-warn/30 bg-warn/10 text-warn', ok: 'border-ok/30 bg-ok/10 text-ok' }[tone];
  return <div role="alert" className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}>{children}</span>;
}

export function CriticalityBadge({ value }: { value: 'A' | 'B' | 'C' | null }) {
  if (!value) return <Badge className="border-dashed border-warn/50 text-warn">Sin criticidad</Badge>;
  const tone = { A: 'bg-danger text-white border-danger', B: 'bg-warn text-white border-warn', C: 'bg-brand-600 text-white border-brand-600' }[value];
  return <Badge className={tone}>Crit. {value}</Badge>;
}

export function Progress({ value }: { value: number }) {
  const tone = value >= 100 ? 'bg-ok' : value >= 60 ? 'bg-brand-600' : 'bg-warn';
  return (
    <div className="flex items-center gap-2" title={`Ficha ${value}% completa`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <div className={`h-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted tabular-nums">{value}%</span>
    </div>
  );
}

export function Select({ label, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base" {...p}>
        {children}
      </select>
    </label>
  );
}

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SecondaryButton({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:border-brand hover:text-brand disabled:opacity-60 ${className}`}
      {...p}
    />
  );
}
