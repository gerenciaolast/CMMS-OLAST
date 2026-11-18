'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function ChangePasswordPage() {
  const { me, logout } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Evita el envío nativo (GET con la contraseña en la URL) antes de que React tome el formulario.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('newPassword') !== f.get('confirm')) return setError('Las contraseñas no coinciden');
    setBusy(true);
    setError(null);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        json: { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') },
      });
      await logout();
      router.replace('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { message: string }[] | undefined;
        setError(d?.length ? d.map((x) => x.message).join('. ') : err.message);
      } else setError('No fue posible cambiar la contraseña');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-1 text-xl font-bold">Cambiar contraseña</h1>
      {me?.mustChangePassword && <p className="mb-4 text-sm text-muted">Por seguridad, defina una contraseña propia antes de continuar.</p>}
      <form method="post" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Contraseña actual" name="currentPassword" type="password" autoComplete="current-password" required />
        <Field label="Nueva contraseña (mín. 10, letras y números)" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
        <Field label="Confirmar nueva contraseña" name="confirm" type="password" autoComplete="new-password" required />
        <Button type="submit" disabled={busy || !ready} className="w-full">{busy ? 'Guardando…' : 'Guardar y volver a ingresar'}</Button>
      </form>
    </Card>
  );
}
