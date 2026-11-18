'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useSession } from '@/lib/session';
import { NAV } from '@/lib/nav';
import { OlastLogo } from '@/components/brand';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, loading, logout, can } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (me.mustChangePassword && path !== '/cambiar-clave') router.replace('/cambiar-clave');
  }, [me, loading, path, router]);

  if (loading || !me)
    return (
      <div className="grid min-h-dvh place-items-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <OlastLogo layout="vertical" height={120} className="h-28 w-auto" />
          <div className="h-1 w-32 overflow-hidden rounded-full bg-sky/30" role="progressbar" aria-label="Cargando">
            <div className="h-full w-1/3 animate-[loading_1.2s_ease-in-out_infinite] rounded-full bg-brand" />
          </div>
        </div>
      </div>
    );

  const items = NAV.filter((n) => !n.permission || can(n.permission));
  const nav = (
    <nav className="space-y-1">
      {items.map((n) => {
        const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
        const Icon = n.icon;
        const content = (
          <>
            <Icon size={18} aria-hidden />
            <span className="flex-1">{n.label}</span>
            {n.sprint && <span className="rounded bg-white/15 px-1.5 text-[11px] text-white/80">{n.sprint}</span>}
          </>
        );
        const cls = `flex h-10 items-center gap-3 rounded-lg border-l-4 px-3 text-sm ${
          active ? 'border-sky bg-white/15 font-semibold text-white' : 'border-transparent text-white/85 hover:bg-white/10'
        }`;
        return n.sprint ? (
          <span key={n.href} className={`${cls} cursor-not-allowed opacity-60`} title={`Disponible en el sprint ${n.sprint}`}>
            {content}
          </span>
        ) : (
          <Link key={n.href} href={n.href} className={cls} onClick={() => setOpen(false)}>
            {content}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden bg-gradient-to-b from-brand-800 to-brand p-4 md:block">
        <div className="mb-2 px-2 pt-1">
          <OlastLogo variant="blanco" height={30} className="h-8 w-auto" />
        </div>
        <p className="mb-6 px-2 text-xs tracking-wide text-sky uppercase">CMMS · Flota</p>
        {nav}
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-white px-4">
          <button className="md:hidden" aria-label="Menú" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
          <OlastLogo variant="color" height={22} className="h-6 w-auto md:hidden" />
          <div className="min-w-0 flex-1 truncate text-right text-sm md:text-left">
            <span className="font-semibold">{me.fullName}</span>
            <span className="text-muted"> · {me.role.name}</span>
          </div>
          <button
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
          >
            <LogOut size={16} /> Salir
          </button>
        </header>
        {open && <div className="bg-brand-800 p-3 md:hidden">{nav}</div>}
        <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
