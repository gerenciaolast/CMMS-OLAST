'use client';
import { useEffect, useState } from 'react';
import { apiObjectUrl } from '@/lib/api';

/** Imagen protegida por sesión (las fotos de avisos no son públicas). */
export function AuthImage({ attachmentId, alt, className = '' }: { attachmentId: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    apiObjectUrl(`/attachments/${attachmentId}`).then((u) => setSrc((url = u))).catch(() => setSrc(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachmentId]);
  if (!src) return <div className={`animate-pulse bg-line ${className}`} aria-label="Cargando foto" />;
  return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={alt} className={`object-cover ${className}`} /></a>;
}
