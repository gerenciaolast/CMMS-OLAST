import path from 'node:path';
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { RegistrationData } from './registration';

/**
 * Hoja de vida del vehículo en PDF (una o varias fichas en un solo archivo, cada vehículo desde una página nueva).
 * Identidad visual del manual de marca OLAST: Poppins, azules corporativos, logo a color sobre blanco.
 */

const ASSETS = [path.join(__dirname, '../../../assets'), path.join(process.cwd(), 'assets'), path.join(process.cwd(), 'apps/api/assets')].find((p) => fs.existsSync(p))!;
const FONT = {
  regular: path.join(ASSETS, 'fonts/Poppins-Regular.ttf'),
  medium: path.join(ASSETS, 'fonts/Poppins-Medium.ttf'),
  semibold: path.join(ASSETS, 'fonts/Poppins-SemiBold.ttf'),
  bold: path.join(ASSETS, 'fonts/Poppins-Bold.ttf'),
};
const LOGO = path.join(ASSETS, 'brand/olast-logo-color.png');
const C = { brand: '#0b5e85', brand600: '#1275a3', dark: '#054e74', sky: '#82ceed', skyBg: '#eaf6fc', ink: '#232323', muted: '#5a6670', line: '#dde4ea', warn: '#b86e00', danger: '#c0392b', ok: '#1f8a4c' };
const M = 40;
const PAGE = { w: 595.28, h: 841.89 };
const W = PAGE.w - 2 * M;

const STATUS_ES: Record<string, string> = {
  operational: 'Operativo', operational_restricted: 'Operativo con restricción', reserve: 'Reserva',
  out_of_service_maintenance: 'Fuera de servicio · mantenimiento', out_of_service_parts: 'Fuera de servicio · espera de repuestos',
  out_of_service_accident: 'Fuera de servicio · siniestro', out_of_service_administrative: 'Fuera de servicio · administrativo', retired: 'Dado de baja',
};
const OWNERSHIP_ES: Record<string, string> = { own: 'Propio', leasing: 'Leasing', rental: 'Renting', third_party: 'Tercero' };
const WO_TYPE_ES: Record<string, string> = { PM: 'Preventivo', INS: 'Inspección', PDM: 'Predictivo', CP: 'Correctivo', CE: 'Emergencia', AUX: 'Auxilio', SIN: 'Siniestro', MEJ: 'Mejora', CAM: 'Campaña' };
const PM_ES: Record<string, string> = { ok: 'Al día', upcoming: 'Próximo', due: 'Vence ya', overdue: 'Vencido' };

export const sheetInclude = {
  site: { select: { name: true } },
  vehicleModel: { include: { vehicleType: { select: { code: true, name: true } } } },
  maintenancePlan: { select: { code: true, name: true } },
  documents: { include: { documentType: { select: { code: true, name: true, isBlocking: true } } } },
  drivers: { include: { driver: { select: { fullName: true, licenseCategory: true, licenseExpiry: true } } }, orderBy: { isPrimary: 'desc' as const } },
  pmSchedules: { include: { routine: { select: { code: true, name: true, intervalDistance: true, intervalDays: true, sequence: true } } } },
} satisfies Prisma.VehicleInclude;
type SheetVehicle = Prisma.VehicleGetPayload<{ include: typeof sheetInclude }>;

const fmtDay = (d: Date | string | null | undefined) => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
};
const km = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('es-CO')} km`);
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v));

class Sheet {
  /** Placa de la ficha en curso, para el encabezado de las páginas de continuación. */
  plate = '';
  constructor(private readonly doc: PDFKit.PDFDocument) {}

  newPage() {
    const d = this.doc;
    d.addPage();
    d.font(FONT.semibold).fontSize(8).fillColor(C.brand).text(`${this.plate} · hoja de vida (continuación)`, M, M - 14, { width: W, align: 'right' });
    d.y = M + 4;
  }

  ensure(h: number) {
    if (this.doc.y + h > PAGE.h - M - 30) this.newPage();
  }

  header(title: string, generated: string) {
    const d = this.doc;
    if (fs.existsSync(LOGO)) d.image(LOGO, M, M - 6, { height: 30 });
    d.font(FONT.semibold).fontSize(13).fillColor(C.brand).text(title, M, M - 2, { width: W, align: 'right' });
    d.font(FONT.regular).fontSize(7.5).fillColor(C.muted).text(generated, M, M + 16, { width: W, align: 'right' });
    d.moveTo(M, M + 32).lineTo(M + W, M + 32).lineWidth(1.5).strokeColor(C.brand).stroke();
    d.y = M + 42;
  }

  hero(v: SheetVehicle, reg: RegistrationData | undefined) {
    const d = this.doc;
    const y = d.y;
    d.roundedRect(M, y, W, 58, 6).fill(C.skyBg);
    d.font(FONT.bold).fontSize(26).fillColor(C.dark).text(v.plate, M + 14, y + 8, { lineBreak: false });
    const line = [reg?.make ?? v.vehicleModel.make, reg?.line ?? v.vehicleModel.model, v.year].filter(Boolean).join(' · ');
    d.font(FONT.medium).fontSize(10).fillColor(C.ink).text(line, M + 14, y + 40, { width: W / 2, lineBreak: false, ellipsis: true });
    const right = M + W / 2;
    const status = STATUS_ES[v.status] ?? v.status;
    const tone = v.status.startsWith('out_of_service') ? C.danger : v.status === 'retired' ? C.muted : C.ok;
    d.font(FONT.semibold).fontSize(10).fillColor(tone).text(status, right, y + 10, { width: W / 2 - 14, align: 'right' });
    d.font(FONT.regular).fontSize(9).fillColor(C.ink)
      .text(`Sede ${v.site.name} · ${v.vehicleModel.vehicleType.name}`, right, y + 25, { width: W / 2 - 14, align: 'right' })
      .text(`Criticidad ${v.criticality ?? 'sin definir'} · ${km(v.currentOdometer)}${v.lastReadingAt ? ` (${fmtDay(v.lastReadingAt)})` : ''}`, right, y + 38, { width: W / 2 - 14, align: 'right' });
    d.y = y + 70;
  }

  section(title: string) {
    this.ensure(40);
    const d = this.doc;
    const y = d.y + 4;
    d.rect(M, y, 3, 12).fill(C.brand600);
    d.font(FONT.semibold).fontSize(10).fillColor(C.brand).text(title.toUpperCase(), M + 9, y, { characterSpacing: 0.4 });
    d.y = y + 18;
  }

  /** Rejilla de campos etiqueta / valor. */
  grid(items: [string, string][], cols = 4) {
    const d = this.doc;
    const cw = W / cols;
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols);
      const h = Math.max(...row.map(([, v]) => d.font(FONT.medium).fontSize(9).heightOfString(v, { width: cw - 8 }))) + 13;
      this.ensure(h + 2);
      const y = d.y;
      row.forEach(([label, value], k) => {
        const x = M + k * cw;
        d.font(FONT.regular).fontSize(6.8).fillColor(C.muted).text(label.toUpperCase(), x, y, { width: cw - 8, characterSpacing: 0.2 });
        d.font(FONT.medium).fontSize(9).fillColor(C.ink).text(value, x, y + 9, { width: cw - 8 });
      });
      d.y = y + h + 3;
    }
    d.y += 2;
  }

  table(cols: { title: string; width: number; align?: 'left' | 'right' | 'center' }[], rows: (string | { text: string; color?: string })[][], empty: string) {
    const d = this.doc;
    if (!rows.length) {
      d.font(FONT.regular).fontSize(8.5).fillColor(C.muted).text(empty, M, d.y);
      d.y += 6;
      return;
    }
    const total = cols.reduce((a, c) => a + c.width, 0);
    const widths = cols.map((c) => (c.width / total) * W);
    const head = () => {
      this.ensure(34);
      const y = d.y;
      d.rect(M, y, W, 16).fill(C.brand);
      let x = M;
      cols.forEach((c, i) => {
        d.font(FONT.semibold).fontSize(7).fillColor('#ffffff').text(c.title.toUpperCase(), x + 4, y + 4.5, { width: widths[i]! - 8, align: c.align ?? 'left', lineBreak: false });
        x += widths[i]!;
      });
      d.y = y + 16;
    };
    head();
    rows.forEach((r, ri) => {
      const cells = r.map((c) => (typeof c === 'string' ? { text: c } : c));
      const h = Math.max(...cells.map((c, i) => d.font(FONT.regular).fontSize(8).heightOfString(c.text, { width: widths[i]! - 8 }))) + 7;
      if (d.y + h > PAGE.h - M - 30) {
        this.newPage();
        head();
      }
      const y = d.y;
      if (ri % 2) d.rect(M, y, W, h).fill('#f6f9fb');
      let x = M;
      cells.forEach((c, i) => {
        d.font(FONT.regular).fontSize(8).fillColor(c.color ?? C.ink).text(c.text, x + 4, y + 3.5, { width: widths[i]! - 8, align: cols[i]!.align ?? 'left' });
        x += widths[i]!;
      });
      d.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
      d.y = y + h;
    });
    d.y += 8;
  }

  note(text: string, color = C.warn) {
    this.ensure(20);
    const d = this.doc;
    d.font(FONT.regular).fontSize(8).fillColor(color).text(text, M, d.y, { width: W });
    d.y += 4;
  }
}

export interface SheetHistory { orders: { number: string; type: string; date: Date | null; km: number | null; description: string; cost: number }[]; cost12m: number; orders12m: number; costTotal: number; ordersTotal: number }

export async function loadSheetHistory(prisma: PrismaClient, vehicleId: string): Promise<SheetHistory> {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const done = { vehicleId, status: { in: ['completed', 'closed'] as ('completed' | 'closed')[] } };
  const [orders, y, all] = await Promise.all([
    prisma.workOrder.findMany({ where: done, orderBy: [{ actualEnd: 'desc' }, { closedAt: 'desc' }], take: 12, select: { number: true, type: true, actualEnd: true, closedAt: true, odometerIn: true, description: true, totalCost: true } }),
    prisma.workOrder.aggregate({ where: { ...done, OR: [{ actualEnd: { gte: since } }, { actualEnd: null, closedAt: { gte: since } }] }, _sum: { totalCost: true }, _count: true }),
    prisma.workOrder.aggregate({ where: done, _sum: { totalCost: true }, _count: true }),
  ]);
  return {
    orders: orders.map((o) => ({ number: o.number, type: o.type, date: o.actualEnd ?? o.closedAt, km: o.odometerIn, description: o.description, cost: Number(o.totalCost) })),
    cost12m: Number(y._sum.totalCost ?? 0), orders12m: y._count, costTotal: Number(all._sum.totalCost ?? 0), ordersTotal: all._count,
  };
}

export async function renderVehicleSheets(items: { vehicle: SheetVehicle; history: SheetHistory }[], opts: { showCosts: boolean; generatedBy: string; timeZone: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: items.length === 1 ? `Hoja de vida ${items[0]!.vehicle.plate}` : 'Hojas de vida de la flota', Author: 'OLAST · CMMS', Creator: 'CMMS OLAST' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const s = new Sheet(doc);
  const generated = `Generada ${new Date().toLocaleString('es-CO', { timeZone: opts.timeZone, dateStyle: 'short', timeStyle: 'short' })} · ${opts.generatedBy}`;

  items.forEach(({ vehicle: v, history: h }, idx) => {
    if (idx > 0) doc.addPage();
    s.plate = v.plate;
    const reg = (v.attributes as { registration?: RegistrationData }).registration;
    const tires = (v.attributes as { tires?: { frontSize?: string; rearSize?: string; frontQty?: number; rearQty?: number; loadIndex?: number; brand?: string } }).tires;
    s.header('HOJA DE VIDA DEL VEHÍCULO', generated);
    s.hero(v, reg);

    s.section('Identificación');
    s.grid([
      ['Placa', v.plate], ['Marca', dash(reg?.make ?? v.vehicleModel.make)], ['Línea', dash(reg?.line ?? v.vehicleModel.model)], ['Modelo (año)', dash(reg?.year ?? v.year)],
      ['Clase', dash(reg?.vehicleClass)], ['Carrocería', dash(reg?.bodyType)], ['Color', dash(reg?.color ?? v.color)], ['Servicio', dash(reg?.serviceType ?? v.serviceType)],
      ['Combustible', dash(reg?.fuel)], ['Cilindrada', reg?.displacementCc ? `${reg.displacementCc.toLocaleString('es-CO')} cc` : '—'], ['Potencia', reg?.powerHp ? `${reg.powerHp} HP` : '—'],
      ['Capacidad', reg?.capacity ? (/MOTO/i.test(reg.vehicleClass ?? '') ? `${reg.capacity} psj` : `${Number(reg.capacity.replace(/\./g, '')).toLocaleString('es-CO')} kg`) : v.loadCapacityKg ? `${v.loadCapacityKg.toLocaleString('es-CO')} kg` : '—'],
      ['Puertas', dash(reg?.doors)], ['Tipo en el CMMS', v.vehicleModel.vehicleType.name], ['Código interno', dash(v.internalCode)], ['Centro de costo', dash(v.costCenter)],
    ]);

    s.section('Números de identificación');
    s.grid([['VIN', dash(reg?.vin ?? v.vin)], ['Número de motor', dash(reg?.engineNumber ?? v.engineNumber)], ['Número de serie', dash(reg?.serialNumber)], ['Número de chasis', dash(reg?.chassisNumber)]]);

    s.section('Licencia de tránsito');
    if (!reg) s.note('Sin datos de la licencia de tránsito. Regístrelos en la hoja de vida del vehículo.', C.muted);
    else {
      s.grid([
        ['Licencia No.', dash(reg.licenseNumber)], ['Tarjeta', dash(reg.cardNumber)], ['Fecha de matrícula', fmtDay(reg.registeredAt)], ['Expedición de la licencia', fmtDay(reg.issuedAt)],
        ['Organismo de tránsito', dash(reg.authority)], ['Propietario', dash(reg.ownerName)], ['Identificación', dash(reg.ownerId)], ['Propiedad', OWNERSHIP_ES[v.ownership] ?? v.ownership],
        ['Limitación a la propiedad', dash(reg.ownershipLimitation)], ['Declaración de importación', dash(reg.importDeclaration)], ['Fecha de importación', fmtDay(reg.importDate)], ['Blindaje', dash(reg.armor)],
      ]);
      for (const n of reg.reviewNotes ?? []) s.note(`Verificar: ${n}`);
    }

    s.section('Operación');
    s.grid([
      ['Sede', v.site.name], ['Estado', STATUS_ES[v.status] ?? v.status], ['Criticidad', dash(v.criticality)], ['Kilometraje actual', km(v.currentOdometer)],
      ['Plan preventivo', v.maintenancePlan ? `${v.maintenancePlan.code} · ${v.maintenancePlan.name}` : 'Sin plan'], ['Ciudad de matrícula', dash(v.registrationCity)],
      ['Conductores', v.drivers.length ? v.drivers.map((x) => `${x.driver.fullName}${x.isPrimary ? ' (principal)' : ''}`).join(', ') : '—'], ['En servicio desde', fmtDay(v.inServiceDate)],
    ]);
    if (tires?.frontSize || tires?.rearSize)
      s.grid([['Llantas delanteras', `${tires.frontQty ?? '—'} × ${dash(tires.frontSize)}`], ['Llantas traseras', `${tires.rearQty ?? '—'} × ${dash(tires.rearSize)}`], ['Índice de carga', dash(tires.loadIndex)], ['Marca', dash(tires.brand)]], 4);

    s.section('Documentos');
    const today = new Date();
    s.table(
      [{ title: 'Documento', width: 3 }, { title: 'Número', width: 2 }, { title: 'Entidad', width: 2.4 }, { title: 'Vence', width: 1.3, align: 'center' }, { title: 'Estado', width: 1.5, align: 'center' }],
      v.documents.map((doc0) => {
        const left = doc0.expiresAt ? Math.ceil((doc0.expiresAt.getTime() - today.getTime()) / 86_400_000) : null;
        const st = left == null ? { text: '—' } : left < 0 ? { text: 'Vencido', color: C.danger } : left <= 30 ? { text: `${left} días`, color: C.warn } : { text: 'Vigente', color: C.ok };
        return [doc0.documentType.name, dash(doc0.number), dash(doc0.issuer), fmtDay(doc0.expiresAt), st];
      }),
      'Sin documentos registrados.',
    );

    s.section('Mantenimiento preventivo');
    s.table(
      [{ title: 'Rutina', width: 3.2 }, { title: 'Intervalo', width: 1.8 }, { title: 'Última ejecución', width: 2.2 }, { title: 'Próxima', width: 2.2 }, { title: 'Estado', width: 1.3, align: 'center' }],
      [...v.pmSchedules].sort((a, b) => a.routine.sequence - b.routine.sequence).map((p) => [
        `${p.routine.code} · ${p.routine.name}`,
        [p.routine.intervalDistance ? km(p.routine.intervalDistance) : null, p.routine.intervalDays ? `${p.routine.intervalDays} d` : null].filter(Boolean).join(' / ') || '—',
        `${fmtDay(p.lastDoneAt)} · ${km(p.lastDoneMeter)}${p.baselineEstimated ? ' (estimada)' : ''}`,
        [p.nextDueMeter ? km(p.nextDueMeter) : null, p.nextDueDate ? fmtDay(p.nextDueDate) : null].filter(Boolean).join(' / ') || '—',
        { text: PM_ES[p.status] ?? p.status, color: p.status === 'overdue' ? C.danger : p.status === 'due' ? C.warn : C.ink },
      ]),
      'Sin plan preventivo asignado.',
    );

    s.section('Últimas intervenciones');
    if (opts.showCosts)
      s.grid([['Costo últimos 12 meses', money(h.cost12m)], ['OT últimos 12 meses', String(h.orders12m)], ['Costo histórico', money(h.costTotal)], ['OT históricas', String(h.ordersTotal)]]);
    s.table(
      [{ title: 'Fecha', width: 1.55 }, { title: 'OT', width: 2 }, { title: 'Tipo', width: 1.45 }, { title: 'Km', width: 1.2, align: 'right' }, { title: 'Descripción', width: 4.8 }, ...(opts.showCosts ? [{ title: 'Costo', width: 1.5, align: 'right' as const }] : [])],
      h.orders.map((o) => [fmtDay(o.date), o.number, WO_TYPE_ES[o.type] ?? o.type, o.km == null ? '—' : o.km.toLocaleString('es-CO'), o.description.length > 140 ? `${o.description.slice(0, 137)}…` : o.description, ...(opts.showCosts ? [money(o.cost)] : [])]),
      'Sin intervenciones registradas.',
    );
  });

  // Pie de página con numeración (por archivo).
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // escribir en el pie sin que PDFKit abra otra página
    doc.font(FONT.regular).fontSize(7).fillColor(C.muted);
    doc.text('OLAST · CMMS Flota — Documento informativo; la licencia de tránsito original prevalece.', M, PAGE.h - M + 6, { width: W * 0.75, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, M + W * 0.75, PAGE.h - M + 6, { width: W * 0.25, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
