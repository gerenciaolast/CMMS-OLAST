import Image from 'next/image';

/**
 * Logo OLAST según el manual de marca:
 * - "color": SOLO sobre fondo blanco.
 * - "blanco": sobre fondos oscuros o de color corporativo.
 * Nunca deformar, rotar, contornear ni encerrar en círculos (usos incorrectos del manual).
 */
export function OlastLogo({ variant = 'color', height = 32, className = '' }: { variant?: 'color' | 'blanco'; height?: number; className?: string }) {
  const ratio = 1100 / 278; // proporción del logotipo horizontal
  return (
    <Image
      src={variant === 'color' ? '/brand/olast-logo-color.png' : '/brand/olast-logo-blanco.png'}
      alt="OLAST"
      width={Math.round(height * ratio)}
      height={height}
      priority
      // object-contain: aunque un contenedor lo estire, la imagen conserva su proporción (deformarla está prohibido).
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
