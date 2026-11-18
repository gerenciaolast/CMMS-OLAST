'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { OlastLogo } from '@/components/brand';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';

/** Curva decorativa del manual de marca (línea celeste sobre fondo corporativo). */
function BrandWave() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden>
      <path d="M0 140 C 180 150, 360 120, 600 20 L600 160 L0 160 Z" fill="#054e74" opacity="0.55" />
      <path d="M0 140 C 180 150, 360 120, 600 20" fill="none" stroke="#82ceed" strokeWidth="4" />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Evita el envío nativo (GET con la contraseña en la URL) antes de que React tome el formulario.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const me = await login(String(f.get('email')), String(f.get('password')));
      router.replace(me.mustChangePassword ? '/cambiar-clave' : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible ingresar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-white md:grid md:grid-cols-[1.1fr_1fr]">
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand to-brand-600 px-6 pt-8 pb-24 text-white md:flex md:flex-col md:items-start md:justify-center md:px-14 md:pb-14">
        <OlastLogo variant="blanco" height={44} className="h-9 w-auto md:h-14" />
        <h1 className="mt-6 max-w-md text-2xl font-semibold leading-tight md:mt-10 md:text-4xl">Mantenimiento y confiabilidad de la flota</h1>
        <p className="mt-3 hidden max-w-md text-white/80 md:block">
          Disponibilidad segura, preventivo a tiempo y costos bajo control en todas las sedes.
        </p>
        <BrandWave />
      </section>
      <section className="-mt-14 px-4 pb-10 md:mt-0 md:flex md:items-center md:justify-center md:px-10">
        <form method="post" onSubmit={onSubmit} className="relative mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-6 shadow-lg md:shadow-none md:border-0">
          <div className="hidden md:block">
            <OlastLogo variant="color" height={36} className="h-9 w-auto" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Ingresar</h2>
            <p className="text-sm text-muted">CMMS · Gestión de mantenimiento</p>
          </div>
          {error && <Alert>{error}</Alert>}
          <Field label="Correo" name="email" type="email" autoComplete="username" required />
          <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
          <Button type="submit" disabled={busy || !ready} className="w-full">
            {busy ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </section>
    </main>
  );
}
