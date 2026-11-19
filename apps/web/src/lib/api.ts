/** Cliente HTTP de la API con renovación automática del token de acceso. */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const KEY = 'cmms.session';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

// Sesión en sessionStorage: se cierra con la pestaña. Endurecer a cookie httpOnly antes de producción (doc 07 §4).
export const tokenStore = {
  get(): Tokens | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(t: Tokens | null) {
    try {
      if (t) window.sessionStorage.setItem(KEY, JSON.stringify(t));
      else window.sessionStorage.removeItem(KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

let refreshing: Promise<Tokens | null> | null = null;

async function refresh(): Promise<Tokens | null> {
  const t = tokenStore.get();
  if (!t) return null;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: t.refreshToken }),
  })
    .then(async (r) => (r.ok ? ((await r.json()) as Tokens) : null))
    .catch(() => null)
    .then((n) => {
      tokenStore.set(n);
      return n;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  const t = tokenStore.get();
  if (t) headers.set('authorization', `Bearer ${t.accessToken}`);
  if (json !== undefined) headers.set('content-type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No hay conexión con el servidor');
  }
  if (res.status === 401 && retry && t && !path.startsWith('/auth/login')) {
    if (await refresh()) return api<T>(path, init, false);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? 'Error inesperado', body.details);
  return body as T;
}

/** Descarga binaria autenticada (p. ej. plantillas Excel). */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const t = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, { headers: t ? { authorization: `Bearer ${t.accessToken}` } : {} });
  if (res.status === 401 && t && (await refresh())) return apiDownload(path, fallbackName);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? 'No fue posible descargar');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
