import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: 'CMMS OLAST',
  description: 'Gestión de mantenimiento y confiabilidad de la flota OLAST',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#0f3d5c', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="min-h-dvh font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
