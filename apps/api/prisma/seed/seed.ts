import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { DEFAULT_ROLES } from '@cmms/shared';
import * as C from './catalogs';

const prisma = new PrismaClient();
const CATALOG_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'catalogos');

/** CSV simple con comillas (los patrones regex contienen comas). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ''])));
}

async function seedComponents() {
  const systems = parseCsv(readFileSync(join(CATALOG_DIR, 'sistemas.csv'), 'utf8'));
  const comps = parseCsv(readFileSync(join(CATALOG_DIR, 'componentes.csv'), 'utf8'));
  const ids = new Map<string, string>();
  const upsert = async (code: string, name: string, level: number, parent: string | null, extra: object = {}) => {
    const parentId = parent ? ids.get(parent) ?? null : null;
    const r = await prisma.componentCode.upsert({
      where: { code },
      create: { code, name, level, parentId, ...extra },
      update: { name, level, parentId, ...extra },
    });
    ids.set(code, r.id);
  };
  for (const s of systems) await upsert(s.codigo!, s.nombre!, 1, null, { vmrsCode: s.vmrs_sistema_ref || null });
  for (const c of comps.filter((x) => x.nivel === '2')) await upsert(c.codigo!, c.conjunto!, 2, c.padre!);
  for (const c of comps.filter((x) => x.nivel === '3'))
    await upsert(c.codigo!, c.componente!, 3, c.padre!, { matchPattern: c.patron_clasificacion || null });
  return ids.size;
}

async function main() {
  const org =
    (await prisma.organization.findFirst({ where: { name: 'OLAST' } })) ??
    (await prisma.organization.create({ data: { name: 'OLAST' } }));

  for (const [code, name] of C.SITES)
    await prisma.site.upsert({
      where: { organizationId_code: { organizationId: org.id, code } },
      create: { organizationId: org.id, code, name, city: name },
      update: { name },
    });

  for (const [code, r] of Object.entries(DEFAULT_ROLES))
    await prisma.role.upsert({
      where: { organizationId_code: { organizationId: org.id, code } },
      create: { organizationId: org.id, code, name: r.name, isGlobal: r.global, permissions: r.permissions },
      update: { name: r.name, isGlobal: r.global, permissions: r.permissions },
    });

  const catalogs: [keyof PrismaClient, [string, string][]][] = [
    ['failureMode', C.FAILURE_MODES], ['failureCause', C.FAILURE_CAUSES],
    ['repairAction', C.REPAIR_ACTIONS], ['holdReason', C.HOLD_REASONS],
  ];
  for (const [model, rows] of catalogs) {
    const delegate = prisma[model] as unknown as { upsert: (a: object) => Promise<unknown> };
    for (const [code, name] of rows) await delegate.upsert({ where: { code }, create: { code, name }, update: { name } });
  }
  for (const t of C.WORK_ORDER_TYPES) await prisma.workOrderTypeDef.upsert({ where: { code: t.code }, create: t, update: t });
  for (const p of C.PRIORITIES) await prisma.priorityDef.upsert({ where: { code: p.code }, create: p, update: p });
  for (const d of C.DOCUMENT_TYPES) await prisma.documentType.upsert({ where: { code: d.code }, create: d, update: d });

  for (const vt of C.VEHICLE_TYPES) {
    const t = await prisma.vehicleType.upsert({ where: { code: vt.code }, create: vt, update: vt });
    if (vt.code === 'MAQ' || vt.code === 'REM') continue;
    const tpl = await prisma.checklistTemplate.upsert({
      where: { vehicleTypeId_kind_version: { vehicleTypeId: t.id, kind: 'pre_trip', version: 1 } },
      create: { vehicleTypeId: t.id, name: `Pre-operacional ${vt.name}`, kind: 'pre_trip', version: 1 },
      update: {},
    });
    await prisma.checklistItem.deleteMany({ where: { checklistTemplateId: tpl.id } });
    await prisma.checklistItem.createMany({
      data: C.BASE_CHECKLIST.map(([text, componentCode, isCritical, requiresPhotoOnFail], i) => ({
        checklistTemplateId: tpl.id, sequence: i + 1, text, componentCode, isCritical, requiresPhotoOnFail,
      })),
    });
  }

  const components = await seedComponents();

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@olast.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const existing = await prisma.user.findUnique({ where: { organizationId_email: { organizationId: org.id, email } } });
  if (!existing) {
    if (!password) throw new Error('Defina SEED_ADMIN_PASSWORD para crear el usuario administrador inicial');
    const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code: 'admin' } } });
    await prisma.user.create({
      data: { organizationId: org.id, roleId: role.id, email, fullName: 'Administrador', passwordHash: await hash(password), mustChangePassword: true },
    });
  }
  console.log(`Seed OK · organización OLAST · ${C.SITES.length} sedes · ${Object.keys(DEFAULT_ROLES).length} roles · ${components} códigos de componente`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
