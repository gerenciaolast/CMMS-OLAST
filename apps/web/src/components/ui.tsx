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
