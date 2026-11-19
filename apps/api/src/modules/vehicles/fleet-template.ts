import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { missingVehicleFields, requiresTechnicalInspection, type VehicleRecord } from '@cmms/domain';
import type { Criticality } from '@cmms/shared';

/**
 * Genera la plantilla de inventario con los datos actuales del sistema (para completar y volver a subir).
 * Los encabezados coinciden con los que lee fleet-import.ts.
 */
const BRAND = 'FF0B5E85';
const PENDING = 'FFFFF2B3';
const STATUS_ES: Record<string, string> = {
  operational: 'Operativo',
  operational_restricted: 'Operativo con restricción',
  reserve: 'Reserva',
  out_of_service_maintenance: 'Fuera de servicio - mantenimiento',
  out_of_service_parts: 'Fuera de servicio - mantenimiento',
  out_of_service_accident: 'Fuera de servicio - siniestro',
  out_of_service_administrative: 'Fuera de servicio - mantenimiento',
};
const OWNERSHIP_ES: Record<string, string> = { own: 'Propio', leasing: 'Leasing', rental: 'Renting', third_party: 'Tercero' };
const DOCS = ['SOAT', 'RTM', 'POL', 'SAN', 'EXT'];

type Col = { header: string; width: number; pending?: (v: Record<string, unknown>) => boolean };

const VEHICLE_COLS: Col[] = [
  { header: 'Placa', width: 10 },
  { header: 'Incluir (SI/NO)', width: 9 },
  { header: 'Sede', width: 9 },
  { header: 'Estado', width: 24 },
  { header: 'Motivo del estado', width: 26 },
  { header: 'Marca', width: 12 },
  { header: 'Línea / tipo', width: 36 },
  { header: 'Tipo vehículo (código)', width: 10 },
  { header: 'Año modelo', width: 8, pending: (v) => !v['Año modelo'] },
  { header: 'Servicio', width: 12 },
  { header: 'Matriculado en', width: 14 },
  { header: 'Propiedad', width: 10 },
  { header: 'Titular licencia de tránsito', width: 18 },
  { header: 'Capacidad de carga (kg)', width: 10, pending: (v) => v['Capacidad de carga (kg)'] == null && v['Tipo vehículo (código)'] !== 'MOT' },
  { header: 'VIN / chasis', width: 20, pending: (v) => !v['VIN / chasis'] },
  { header: 'No. motor', width: 16, pending: (v) => !v['No. motor'] },
  { header: 'Color', width: 10, pending: (v) => !v['Color'] },
  { header: 'Kilometraje actual', width: 12, pending: () => true },
  { header: 'Fecha de la lectura (AAAA-MM-DD)', width: 14, pending: () => true },
  { header: 'Fecha inicio de operación', width: 13 },
  { header: 'Centro de costo', width: 12, pending: (v) => !v['Centro de costo'] },
  { header: 'Crit. impacto operacional (1-3)', width: 11, pending: (v) => !v['Crit. impacto operacional (1-3)'] },
  { header: 'Crit. seguridad (1-3)', width: 11, pending: (v) => !v['Crit. seguridad (1-3)'] },
  { header: 'Crit. costo reparación (1-3)', width: 11, pending: (v) => !v['Crit. costo reparación (1-3)'] },
  { header: 'Crit. uso (1-3)', width: 11, pending: (v) => !v['Crit. uso (1-3)'] },
  { header: 'Llanta delantera (medida)', width: 22 },
  { header: 'Cant. delanteras', width: 8 },
  { header: 'Llanta trasera (medida)', width: 22 },
  { header: 'Cant. traseras', width: 8 },
  { header: 'Marca llantas', width: 12 },
  { header: 'Índice de carga', width: 8 },
  { header: 'Observaciones', width: 36 },
];

function header(ws: ExcelJS.Worksheet, cols: { header: string; width: number }[]) {
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
  const row = ws.getRow(1);
  row.height = 42;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
}

function listValidation(ws: ExcelJS.Worksheet, colIndex: number, options: string[], rows = 300) {
  const letter = ws.getColumn(colIndex).letter;
  for (let r = 2; r <= rows; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${options.join(',')}"`] };
  }
}

const pendingFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PENDING } };

export async function buildFleetTemplate(prisma: PrismaClient, organizationId: string): Promise<Buffer> {
  const [vehicles, sites, docTypes, drivers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { organizationId, status: { not: 'retired' } },
      include: { site: true, vehicleModel: { include: { vehicleType: true } }, documents: { include: { documentType: true } } },
      orderBy: [{ site: { name: 'asc' } }, { plate: 'asc' }],
    }),
    prisma.site.findMany({ where: { organizationId, active: true }, orderBy: { code: 'asc' } }),
    prisma.documentType.findMany({ where: { code: { in: DOCS } } }),
    prisma.driver.findMany({
      where: { organizationId },
      include: { site: true, vehicles: { include: { vehicle: { select: { plate: true } } } } },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CMMS OLAST';

  const ins = wb.addWorksheet('Instrucciones');
  ins.getColumn(1).width = 120;
  [
    'Plantilla de inventario de flota · CMMS OLAST',
    '',
    '1. Complete las celdas en AMARILLO (datos pendientes). Las celdas vacías NO borran lo que ya está en el sistema.',
    '2. «Kilometraje actual»: escriba el odómetro de hoy y su fecha. Si es menor que el último registrado, se rechaza.',
    '3. «Sede»: si cambia la sede de un vehículo, el sistema registra el traslado en su historial.',
    '4. Criticidad: califique los 4 criterios de 1 a 3. Impacto: 1 hay reemplazo · 2 con demora · 3 detiene servicio. Seguridad: 1 bajo · 2 carga general · 3 personas o mercancía peligrosa. Costo: 1 bajo · 2 medio · 3 alto. Uso: 1 <3.000 km/mes · 2 3.000–8.000 · 3 >8.000.',
    '5. Hoja «Conductores»: un conductor por fila. En «Placas asignadas» escriba las placas que puede manejar, separadas por coma. Un vehículo puede tener varios conductores.',
    '6. Hoja «Documentos»: fecha de vencimiento de SOAT, técnico-mecánica, póliza, concepto sanitario y extintor.',
    '7. Placas de motocarro: formato 123ABC (números primero).',
    '8. No agregue comentarios/notas de celda: use la columna «Observaciones».',
    '',
    `Generada el ${new Date().toISOString().slice(0, 10)}. Información interna de OLAST: no la publique.`,
  ].forEach((t, i) => {
    const c = ins.getCell(i + 1, 1);
    c.value = t;
    c.alignment = { wrapText: true };
    if (i === 0) c.font = { bold: true, size: 14, color: { argb: 'FF054E74' } };
  });

  // Vehículos
  const ws = wb.addWorksheet('Vehiculos');
  header(ws, VEHICLE_COLS);
  const today = new Date();
  for (const v of vehicles) {
    const tires = ((v.attributes as { tires?: Record<string, unknown> }).tires ?? {}) as Record<string, string | number | undefined>;
    const score = (v.criticalityScore ?? {}) as Record<string, number>;
    const row: Record<string, unknown> = {
      'Placa': v.plate,
      'Incluir (SI/NO)': 'SI',
      'Sede': v.site.code,
      'Estado': STATUS_ES[v.status] ?? 'Operativo',
      'Motivo del estado': v.status === 'operational' ? null : v.statusReason,
      'Marca': v.vehicleModel.make,
      'Línea / tipo': v.vehicleModel.model,
      'Tipo vehículo (código)': v.vehicleModel.vehicleType.code,
      'Año modelo': v.year,
      'Servicio': v.serviceType,
      'Matriculado en': v.registrationCity,
      'Propiedad': OWNERSHIP_ES[v.ownership],
      'Titular licencia de tránsito': v.titleHolder,
      'Capacidad de carga (kg)': v.loadCapacityKg,
      'VIN / chasis': v.vin,
      'No. motor': v.engineNumber,
      'Color': v.color,
      'Kilometraje actual': null,
      'Fecha de la lectura (AAAA-MM-DD)': null,
      'Fecha inicio de operación': v.inServiceDate,
      'Centro de costo': v.costCenter,
      'Crit. impacto operacional (1-3)': score.operationalImpact ?? null,
      'Crit. seguridad (1-3)': score.safety ?? null,
      'Crit. costo reparación (1-3)': score.repairCost ?? null,
      'Crit. uso (1-3)': score.usage ?? null,
      'Llanta delantera (medida)': tires.frontSize ?? null,
      'Cant. delanteras': tires.frontQty ?? null,
      'Llanta trasera (medida)': tires.rearSize ?? null,
      'Cant. traseras': tires.rearQty ?? null,
      'Marca llantas': tires.brand ?? null,
      'Índice de carga': tires.loadIndex ?? null,
      'Observaciones': v.notes,
    };
    const added = ws.addRow(VEHICLE_COLS.map((c) => row[c.header] ?? null));
    VEHICLE_COLS.forEach((c, i) => {
      if (c.pending?.(row)) added.getCell(i + 1).fill = pendingFill;
    });
  }
  const idx = (h: string) => VEHICLE_COLS.findIndex((c) => c.header === h) + 1;
  listValidation(ws, idx('Incluir (SI/NO)'), ['SI', 'NO']);
  listValidation(ws, idx('Sede'), sites.map((s) => s.code));
  listValidation(ws, idx('Estado'), ['Operativo', 'Operativo con restricción', 'Reserva', 'Fuera de servicio - mantenimiento', 'Fuera de servicio - siniestro', 'Vendido', 'Siniestro pérdida total', 'Dado de baja']);
  listValidation(ws, idx('Propiedad'), ['Propio', 'Leasing', 'Renting', 'Tercero']);
  listValidation(ws, idx('Tipo vehículo (código)'), ['CAR', 'CPE', 'LIV', 'MCA', 'MOT', 'BUS', 'TRC', 'REM', 'MAQ']);
  listValidation(ws, idx('Servicio'), ['PUBLICO', 'PARTICULAR']);
  for (const h of ['Crit. impacto operacional (1-3)', 'Crit. seguridad (1-3)', 'Crit. costo reparación (1-3)', 'Crit. uso (1-3)']) listValidation(ws, idx(h), ['1', '2', '3']);

  // Conductores
  const cs = wb.addWorksheet('Conductores');
  const driverCols = [
    { header: 'Nombre completo', width: 28 }, { header: 'Cédula', width: 14 }, { header: 'Teléfono', width: 14 }, { header: 'Correo', width: 24 },
    { header: 'No. licencia', width: 14 }, { header: 'Categoría licencia', width: 10 }, { header: 'Vence licencia', width: 13 },
    { header: 'Sede', width: 9 }, { header: 'Placas asignadas', width: 24 }, { header: 'Activo (SI/NO)', width: 9 },
  ];
  header(cs, driverCols);
  for (const d of drivers) {
    const r = cs.addRow([d.fullName, d.documentId, d.phone, d.email, d.licenseNumber, d.licenseCategory, d.licenseExpiry, d.site?.code ?? null,
      d.vehicles.map((x) => x.vehicle.plate).join(', '), d.active ? 'SI' : 'NO']);
    [2, 3, 5, 6, 7].forEach((i) => { if (!r.getCell(i).value) r.getCell(i).fill = pendingFill; });
  }
  listValidation(cs, 8, sites.map((s) => s.code));
  listValidation(cs, 10, ['SI', 'NO']);
  listValidation(cs, 6, ['B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'A2']);
  cs.getColumn(7).numFmt = 'yyyy-mm-dd';

  // Documentos
  const ds = wb.addWorksheet('Documentos');
  header(ds, [
    { header: 'Placa', width: 10 }, { header: 'Documento (código)', width: 11 }, { header: 'Documento', width: 34 }, { header: 'Número', width: 18 },
    { header: 'Entidad / aseguradora', width: 22 }, { header: 'Fecha expedición', width: 14 }, { header: 'Fecha vencimiento', width: 14 },
  ]);
  for (const v of vehicles) {
    const rtm = requiresTechnicalInspection({ year: v.year, serviceType: v.serviceType, vehicleTypeCode: v.vehicleModel.vehicleType.code }, today);
    for (const code of DOCS) {
      if (code === 'RTM' && !rtm) continue;
      const t = docTypes.find((x) => x.code === code);
      const d = v.documents.find((x) => x.documentType.code === code);
      const r = ds.addRow([v.plate, code, t?.name ?? code, d?.number ?? null, d?.issuer ?? null, d?.issuedAt ?? null, d?.expiresAt ?? null]);
      if (!d?.expiresAt) r.getCell(7).fill = pendingFill;
    }
  }
  ds.getColumn(6).numFmt = 'yyyy-mm-dd';
  ds.getColumn(7).numFmt = 'yyyy-mm-dd';

  // Resumen de pendientes por vehículo
  const ps = wb.addWorksheet('Pendientes');
  header(ps, [{ header: 'Placa', width: 10 }, { header: 'Sede', width: 9 }, { header: 'Datos pendientes', width: 90 }]);
  for (const v of vehicles) {
    const rec: VehicleRecord = {
      plate: v.plate, vin: v.vin, year: v.year, serviceType: v.serviceType, vehicleTypeCode: v.vehicleModel.vehicleType.code,
      criticality: v.criticality as Criticality | null, currentOdometer: v.currentOdometer, loadCapacityKg: v.loadCapacityKg,
      documentsWithExpiry: v.documents.filter((d) => d.expiresAt).map((d) => d.documentType.code),
    };
    const m = missingVehicleFields(rec, today);
    if (m.length) ps.addRow([v.plate, v.site.code, m.map((x) => x.label).join(' · ')]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
