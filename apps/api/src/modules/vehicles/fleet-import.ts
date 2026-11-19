import ExcelJS from 'exceljs';
import { PrismaClient, VehicleStatus, Ownership } from '@prisma/client';
import { canonicalPlate, computeCriticality, normalizePlate, plateFormatIssue, validateReading } from '@cmms/domain';

/**
 * Importación de la plantilla de inventario de flota (tools/plantilla_flota.py).
 * - Actualiza por placa (idempotente): se puede correr varias veces.
 * - Las celdas vacías NO borran datos existentes.
 * - Filas con "Incluir" = NO se omiten.
 */

export interface ImportReport {
  created: string[];
  updated: string[];
  skipped: string[];
  readings: number;
  documents: number;
  drivers: number;
  transfers: number;
  criticality: number;
  warnings: string[];
}

const STATUS: Record<string, VehicleStatus> = {
  'operativo': 'operational',
  'operativo con restricción': 'operational_restricted',
  'operativo con restriccion': 'operational_restricted',
  'reserva': 'reserve',
  'fuera de servicio - mantenimiento': 'out_of_service_maintenance',
  'fuera de servicio - siniestro': 'out_of_service_accident',
  'vendido': 'retired',
  'siniestro pérdida total': 'retired',
  'siniestro perdida total': 'retired',
  'dado de baja': 'retired',
};
const OWNERSHIP: Record<string, Ownership> = { propio: 'own', leasing: 'leasing', renting: 'rental', tercero: 'third_party' };

type Row = Record<string, unknown>;

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as { text: string }).text;
  }
  return v;
}

function sheetRows(ws: ExcelJS.Worksheet | undefined): Row[] {
  if (!ws) return [];
  const head: string[] = [];
  ws.getRow(1).eachCell((c, i) => (head[i] = String(cellValue(c.value) ?? '').trim()));
  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Row = {};
    row.eachCell({ includeEmpty: false }, (c, i) => {
      if (head[i]) r[head[i]!] = cellValue(c.value);
    });
    if (Object.values(r).some((x) => x !== null && x !== '')) rows.push(r);
  });
  return rows;
}

const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
};
const int = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : undefined;
};
const date = (v: unknown): Date | undefined => {
  if (v instanceof Date) return v;
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const score = (v: unknown): 1 | 2 | 3 | undefined => {
  const n = int(v);
  return n === 1 || n === 2 || n === 3 ? n : undefined;
};
/** Quita las claves undefined para no sobrescribir con vacío. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function importFleetWorkbook(prisma: PrismaClient, file: string | Buffer, organizationName = 'OLAST'): Promise<ImportReport> {
  const wb = new ExcelJS.Workbook();
  try {
    if (typeof file === 'string') await wb.xlsx.readFile(file);
    else await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch (e) {
    if (e instanceof TypeError && /comments/.test(e.message))
      throw new Error('La plantilla tiene comentarios/notas de celda que no se pueden leer. Elimínelos (use la columna «Observaciones») y vuelva a importar.');
    throw e;
  }
  const report: ImportReport = { created: [], updated: [], skipped: [], readings: 0, documents: 0, drivers: 0, transfers: 0, criticality: 0, warnings: [] };
  const org = await prisma.organization.findFirstOrThrow({ where: { name: organizationName } });

  for (const r of sheetRows(wb.getWorksheet('Vehiculos'))) {
    const typeCodeRaw = str(r['Tipo vehículo (código)']) ?? 'CAR';
    const plate = canonicalPlate(str(r['Placa']) ?? '', typeCodeRaw);
    if (!plate) continue;
    if ((str(r['Incluir (SI/NO)']) ?? 'SI').toUpperCase() !== 'SI') {
      report.skipped.push(plate);
      continue;
    }
    const where = `[${plate}]`;
    if (plate !== normalizePlate(str(r['Placa']) ?? '')) report.warnings.push(`${where} placa corregida al formato del tipo (${str(r['Placa'])} → ${plate})`);
    const fmt = plateFormatIssue(plate, typeCodeRaw);
    if (fmt) report.warnings.push(`${where} ${fmt}`);
    const site = await prisma.site.findUnique({ where: { organizationId_code: { organizationId: org.id, code: str(r['Sede']) ?? '' } } });
    if (!site) { report.warnings.push(`${where} sede desconocida "${str(r['Sede'])}": fila omitida`); continue; }
    const typeCode = typeCodeRaw;
    const vtype = await prisma.vehicleType.findUnique({ where: { code: typeCode } });
    if (!vtype) { report.warnings.push(`${where} tipo de vehículo desconocido "${typeCode}": fila omitida`); continue; }
    const make = (str(r['Marca']) ?? 'SIN MARCA').toUpperCase();
    const modelName = (str(r['Línea / tipo']) ?? 'SIN LÍNEA').toUpperCase();
    const model = await prisma.vehicleModel.upsert({
      where: { make_model: { make, model: modelName } },
      create: { make, model: modelName, vehicleTypeId: vtype.id },
      update: {},
    });

    const statusText = (str(r['Estado']) ?? 'Operativo').toLowerCase();
    const status = STATUS[statusText];
    if (!status) { report.warnings.push(`${where} estado desconocido "${str(r['Estado'])}": fila omitida`); continue; }
    const reason = str(r['Motivo del estado']) ?? (status === 'operational' ? 'Carga inicial del inventario' : str(r['Estado']));

    let driverId: string | undefined;
    const driverName = str(r['Conductor asignado']);
    if (driverName) {
      const name = driverName.replace(/\s+/g, ' ').toUpperCase();
      const existing = await prisma.driver.findFirst({ where: { organizationId: org.id, fullName: name } });
      driverId = (existing ?? (await prisma.driver.create({ data: { organizationId: org.id, siteId: site.id, fullName: name } }))).id;
    }

    const tires = defined({
      frontSize: str(r['Llanta delantera (medida)']),
      frontQty: int(r['Cant. delanteras']),
      rearSize: str(r['Llanta trasera (medida)']),
      rearQty: int(r['Cant. traseras']),
      brand: str(r['Marca llantas']),
      loadIndex: int(r['Índice de carga']),
    });

    const data = defined({
      vehicleModelId: model.id,
      vin: str(r['VIN / chasis']),
      engineNumber: str(r['No. motor']),
      color: str(r['Color']),
      year: int(r['Año modelo']),
      serviceType: str(r['Servicio'])?.toUpperCase(),
      registrationCity: str(r['Matriculado en']),
      ownership: OWNERSHIP[(str(r['Propiedad']) ?? '').toLowerCase()],
      titleHolder: str(r['Titular licencia de tránsito']),
      loadCapacityKg: int(r['Capacidad de carga (kg)']),
      inServiceDate: date(r['Fecha inicio de operación']),
      costCenter: str(r['Centro de costo']),
      notes: str(r['Observaciones']),
    });

    const existing = await prisma.vehicle.findUnique({ where: { organizationId_plate: { organizationId: org.id, plate } } });
    const now = new Date();
    const vehicle = await prisma.$transaction(async (tx) => {
      const attributes = { ...((existing?.attributes as object) ?? {}), ...(Object.keys(tires).length ? { tires: { ...(((existing?.attributes as { tires?: object })?.tires) ?? {}), ...tires } } : {}) };
      const v = existing
        ? await tx.vehicle.update({ where: { id: existing.id }, data: { ...data, attributes } })
        : await tx.vehicle.create({ data: { ...data, organizationId: org.id, siteId: site.id, vehicleModelId: model.id, plate, status, statusReason: reason, attributes, ...(status === 'retired' ? { retiredAt: now, retirementReason: reason } : {}) } });
      if (!existing) {
        await tx.vehicleStatusLog.create({ data: { vehicleId: v.id, status, reason, startedAt: now, source: 'import' } });
        await tx.vehicleSiteLog.create({ data: { vehicleId: v.id, siteId: site.id, startedAt: now, reason: 'Carga inicial del inventario' } });
      } else if (existing.siteId !== site.id && status !== 'retired') {
        // Reubicación registrada desde la plantilla: queda en el historial de sedes.
        await tx.vehicleSiteLog.updateMany({ where: { vehicleId: v.id, endedAt: null }, data: { endedAt: now } });
        await tx.vehicleSiteLog.create({ data: { vehicleId: v.id, siteId: site.id, startedAt: now, reason: 'Traslado registrado en plantilla' } });
        await tx.vehicle.update({ where: { id: v.id }, data: { siteId: site.id } });
        report.transfers++;
      }
      if (existing && existing.status !== status) {
        await tx.vehicleStatusLog.updateMany({ where: { vehicleId: v.id, endedAt: null }, data: { endedAt: now } });
        await tx.vehicleStatusLog.create({ data: { vehicleId: v.id, status, reason, startedAt: now, source: 'import' } });
        await tx.vehicle.update({ where: { id: v.id }, data: { status, statusReason: reason, ...(status === 'retired' ? { retiredAt: now, retirementReason: reason } : {}) } });
      }
      if (driverId) {
        const hasPrimary = await tx.vehicleDriver.count({ where: { vehicleId: v.id, isPrimary: true } });
        await tx.vehicleDriver.upsert({
          where: { vehicleId_driverId: { vehicleId: v.id, driverId } },
          create: { vehicleId: v.id, driverId, isPrimary: hasPrimary === 0 },
          update: {},
        });
      }
      return v;
    });
    (existing ? report.updated : report.created).push(plate);

    // Criticidad
    const c = { operationalImpact: score(r['Crit. impacto operacional (1-3)']), safety: score(r['Crit. seguridad (1-3)']), repairCost: score(r['Crit. costo reparación (1-3)']), usage: score(r['Crit. uso (1-3)']) };
    if (Object.values(c).every((x) => x !== undefined)) {
      const res = computeCriticality(c as { operationalImpact: 1 | 2 | 3; safety: 1 | 2 | 3; repairCost: 1 | 2 | 3; usage: 1 | 2 | 3 });
      await prisma.vehicle.update({ where: { id: vehicle.id }, data: { criticality: res.category, criticalityScore: { ...c, score: res.score, assessedAt: now.toISOString(), source: 'import' } } });
      report.criticality++;
    } else if (Object.values(c).some((x) => x !== undefined)) {
      report.warnings.push(`${where} criticidad incompleta: califique los 4 criterios (1-3)`);
    }

    // Lectura de kilometraje
    const km = int(r['Kilometraje actual']);
    if (km !== undefined && status !== 'retired') {
      const readAt = date(r['Fecha de la lectura (AAAA-MM-DD)']) ?? now;
      const prev = await prisma.meterReading.findFirst({ where: { vehicleId: vehicle.id, meterType: 'odometer' }, orderBy: { readAt: 'desc' } });
      if (prev && prev.value === km && prev.readAt.getTime() === readAt.getTime()) {
        // ya cargada
      } else {
        const check = validateReading(km + vehicle.odometerOffset, readAt, prev ? { value: prev.accumulatedValue, readAt: prev.readAt } : null, vtype.maxDailyUsage);
        if (check.status === 'rejected') {
          report.warnings.push(`${where} lectura ${km} rechazada (${check.reason}); la última registrada es ${prev?.value}`);
        } else {
          await prisma.meterReading.create({
            data: { vehicleId: vehicle.id, value: km, accumulatedValue: km + vehicle.odometerOffset, readAt, source: 'import', isFlagged: check.status === 'flagged', flagReason: check.status === 'flagged' ? 'Salto improbable en importación' : null },
          });
          if (check.status === 'accepted') await prisma.vehicle.update({ where: { id: vehicle.id }, data: { currentOdometer: km, lastReadingAt: readAt } });
          else report.warnings.push(`${where} lectura ${km} marcada "a validar" (salto improbable)`);
          report.readings++;
        }
      }
    }
  }

  // Conductores (uno o varios por vehículo; cualquiera puede hacer la inspección diaria)
  for (const r of sheetRows(wb.getWorksheet('Conductores'))) {
    const name = str(r['Nombre completo'])?.replace(/\s+/g, ' ').toUpperCase();
    if (!name) continue;
    const doc = str(r['Cédula'])?.replace(/[^\dA-Za-z]/g, '');
    const siteCode = str(r['Sede']);
    const site = siteCode ? await prisma.site.findUnique({ where: { organizationId_code: { organizationId: org.id, code: siteCode } } }) : null;
    if (siteCode && !site) report.warnings.push(`Conductor ${name}: sede desconocida "${siteCode}"`);
    const data = defined({
      fullName: name,
      documentId: doc,
      phone: str(r['Teléfono']),
      email: str(r['Correo']),
      licenseNumber: str(r['No. licencia']),
      licenseCategory: str(r['Categoría licencia'])?.toUpperCase(),
      licenseExpiry: date(r['Vence licencia']),
      siteId: site?.id,
      active: str(r['Activo (SI/NO)']) ? str(r['Activo (SI/NO)'])!.toUpperCase() !== 'NO' : undefined,
    });
    const existing =
      (doc ? await prisma.driver.findFirst({ where: { organizationId: org.id, documentId: doc } }) : null) ??
      (await prisma.driver.findFirst({ where: { organizationId: org.id, fullName: name } }));
    const driver = existing
      ? await prisma.driver.update({ where: { id: existing.id }, data })
      : await prisma.driver.create({ data: { ...data, fullName: name, organizationId: org.id } });
    report.drivers++;
    for (const raw of (str(r['Placas asignadas']) ?? '').split(/[,;/\s]+/).filter(Boolean)) {
      const plate = normalizePlate(raw);
      const v =
        (await prisma.vehicle.findUnique({ where: { organizationId_plate: { organizationId: org.id, plate } } })) ??
        (await prisma.vehicle.findUnique({ where: { organizationId_plate: { organizationId: org.id, plate: canonicalPlate(plate, 'MCA') } } }));
      if (!v) { report.warnings.push(`Conductor ${name}: placa ${plate} no existe`); continue; }
      const hasPrimary = await prisma.vehicleDriver.count({ where: { vehicleId: v.id, isPrimary: true } });
      await prisma.vehicleDriver.upsert({
        where: { vehicleId_driverId: { vehicleId: v.id, driverId: driver.id } },
        create: { vehicleId: v.id, driverId: driver.id, isPrimary: hasPrimary === 0 },
        update: {},
      });
    }
  }

  // Documentos
  for (const r of sheetRows(wb.getWorksheet('Documentos'))) {
    const plate = normalizePlate(str(r['Placa']) ?? '');
    const code = str(r['Documento (código)']);
    const payload = defined({
      number: str(r['Número']),
      issuer: str(r['Entidad / aseguradora']),
      issuedAt: date(r['Fecha expedición']),
      expiresAt: date(r['Fecha vencimiento']),
    });
    if (!plate || !code || Object.keys(payload).length === 0) continue;
    const v = await prisma.vehicle.findUnique({ where: { organizationId_plate: { organizationId: org.id, plate } } });
    const type = await prisma.documentType.findUnique({ where: { code } });
    if (!v || !type) { report.warnings.push(`[${plate}] documento ${code}: vehículo o tipo desconocido`); continue; }
    await prisma.vehicleDocument.upsert({
      where: { vehicleId_documentTypeId: { vehicleId: v.id, documentTypeId: type.id } },
      create: { vehicleId: v.id, documentTypeId: type.id, ...payload },
      update: payload,
    });
    report.documents++;
  }
  return report;
}
