'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Permission } from '@cmms/shared';
import { api, tokenStore, type Tokens } from './api';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  mustChangePassword: boolean;
  role: { code: string; name: string };
  permissions: Permission[];
  siteIds: string[] | null;
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tokenStore.get()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>('/auth/me'));
    } catch {
      tokenStore.set(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const t = await api<Tokens>('/auth/login', { method: 'POST', json: { email, password } });
    tokenStore.set(t);
    const m = await api<Me>('/auth/me');
    setMe(m);
    return m;
  }, []);

  const logout = useCallback(async () => {
    const t = tokenStore.get();
    if (t) await api('/auth/logout', { method: 'POST', json: { refreshToken: t.refreshToken } }).catch(() => undefined);
    tokenStore.set(null);
    setMe(null);
  }, []);

  const can = useCallback((p: Permission) => !!me?.permissions.includes(p), [me]);

  return <Ctx.Provider value={{ me, loading, login, logout, reload, can }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fuera de SessionProvider');
  return v;
}
