'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';

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
    <main className="grid min-h-dvh place-items-center px-4">
      <form method="post" onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-bold">CMMS OLAST</h1>
            <p className="text-sm text-muted">Mantenimiento de flota</p>
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
        <Field label="Correo" name="email" type="email" autoComplete="username" required />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" disabled={busy || !ready} className="w-full">
          {busy ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </main>
  );
}
