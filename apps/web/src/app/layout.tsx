import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/session';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', display: 'swap' });

export const metadata: Metadata = {
  title: 'CMMS OLAST',
  description: 'Gestión de mantenimiento y confiabilidad de la flota OLAST',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = { themeColor: '#054e74', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={poppins.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
