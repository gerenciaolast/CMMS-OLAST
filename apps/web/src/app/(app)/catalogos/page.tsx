'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';

interface Component { code: string; name: string; level: number; vmrsCode: string | null; parent: { code: string } | null }

/** Catálogo de componentes OLAST (doc 09): sistema → conjunto → componente. */
export default function CatalogPage() {
  const [all, setAll] = useState<Component[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>('FRN');

  useEffect(() => {
    void api<Component[]>('/catalog/components').then(setAll);
  }, []);

  const children = useMemo(() => {
    const m = new Map<string, Component[]>();
    for (const c of all) if (c.parent) m.set(c.parent.code, [...(m.get(c.parent.code) ?? []), c]);
    return m;
  }, [all]);

  const term = q.trim().toLowerCase();
  const matches = term ? all.filter((c) => c.level === 3 && `${c.code} ${c.name}`.toLowerCase().includes(term)) : [];
  const systems = all.filter((c) => c.level === 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Catálogo de componentes</h1>
        <p className="text-muted">{systems.length} sistemas · {all.filter((c) => c.level === 3).length} componentes · estructura VMRS</p>
      </div>
      <label className="relative block">
        <Search className="absolute top-3 left-3 text-muted" size={18} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar componente (p. ej. bandas, turbo, splinder)"
          className="h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-10"
        />
      </label>
      {term ? (
        <Card>
          {matches.length === 0 && <p className="text-muted">Sin resultados</p>}
          <ul className="divide-y divide-line">
            {matches.map((c) => (
              <li key={c.code} className="flex gap-3 py-2">
                <code className="w-28 shrink-0 text-sm text-muted">{c.code}</code>
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <div className="space-y-2">
          {systems.map((s) => (
            <Card key={s.code} className="p-0">
              <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(open === s.code ? null : s.code)}>
                <ChevronRight size={18} className={`transition ${open === s.code ? 'rotate-90' : ''}`} aria-hidden />
                <code className="w-12 font-semibold">{s.code}</code>
                <span className="flex-1 font-medium">{s.name}</span>
                {s.vmrsCode && <span className="text-xs text-muted">VMRS {s.vmrsCode}</span>}
              </button>
              {open === s.code && (
                <div className="space-y-3 border-t border-line p-4">
                  {(children.get(s.code) ?? []).map((a) => (
                    <div key={a.code}>
                      <p className="text-sm font-semibold">{a.name} <code className="text-muted">{a.code}</code></p>
                      <ul className="mt-1 ml-4 list-disc text-sm">
                        {(children.get(a.code) ?? []).map((c) => (
                          <li key={c.code}>{c.name} <code className="text-muted">{c.code}</code></li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
