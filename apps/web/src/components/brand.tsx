import Image from 'next/image';

/**
 * Logo OLAST según el manual de marca:
 * - variant "color": SOLO sobre fondo blanco.
 * - variant "blanco": sobre fondos oscuros o de color corporativo.
 * - layout "horizontal" (símbolo + texto) o "vertical" (símbolo arriba, texto abajo) para espacios cuadrados.
 * Nunca deformar, rotar, contornear ni encerrar en círculos (usos incorrectos del manual).
 */
const ASSETS = {
  horizontal: { color: '/brand/olast-logo-color.png', blanco: '/brand/olast-logo-blanco.png', ratio: 1100 / 278 },
  vertical: { color: '/brand/olast-logo-vertical-color.png', blanco: '/brand/olast-logo-vertical-blanco.png', ratio: 700 / 581 },
} as const;

export function OlastLogo({
  variant = 'color',
  layout = 'horizontal',
  height = 32,
  className = '',
}: {
  variant?: 'color' | 'blanco';
  layout?: 'horizontal' | 'vertical';
  height?: number;
  className?: string;
}) {
  const a = ASSETS[layout];
  return (
    <Image
      src={a[variant]}
      alt="OLAST"
      width={Math.round(height * a.ratio)}
      height={height}
      priority
      // object-contain: aunque un contenedor lo estire, la imagen conserva su proporción (deformarla está prohibido).
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
