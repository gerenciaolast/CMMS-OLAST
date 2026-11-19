import type { Criticality, VehicleStatus } from '@cmms/shared';

/**
 * Reglas del registro de vehículos (doc 02 P1 y P8).
 */

export interface VehicleRecord {
  plate: string;
  vin?: string | null;
  year?: number | null;
  serviceType?: string | null; // 'PUBLICO' | 'PARTICULAR'
  vehicleTypeCode?: string | null;
  criticality?: Criticality | null;
  currentOdometer?: number | null;
  currentHourmeter?: number | null;
  primaryMeter?: 'odometer' | 'hourmeter';
  loadCapacityKg?: number | null;
  /** Códigos de documentos registrados con fecha de vencimiento. */
  documentsWithExpiry: string[];
}

export interface MissingField {
  field: string;
  label: string;
  /** Bloquea alarmas o cumplimiento (no solo información). */
  critical: boolean;
}

/**
 * Revisión técnico-mecánica (Colombia, Ley 769/2002 art. 52, ref. a validar con la norma vigente):
 * vehículos de servicio público y motocicletas a partir de los 2 años de matrícula; particulares a partir de 6.
 * Se aproxima con el año modelo.
 */
export function requiresTechnicalInspection(v: Pick<VehicleRecord, 'year' | 'serviceType' | 'vehicleTypeCode'>, today: Date): boolean {
  if (!v.year) return true; // sin año no se puede eximir
  const age = today.getUTCFullYear() - v.year;
  const isPublic = (v.serviceType ?? '').toUpperCase().startsWith('PUBLIC');
  const threshold = isPublic || v.vehicleTypeCode === 'MOT' || v.vehicleTypeCode === 'MCA' ? 2 : 6;
  return age >= threshold;
}

/** Campos pendientes de la ficha. La ficha está completa cuando la lista está vacía. */
export function missingVehicleFields(v: VehicleRecord, today: Date = new Date()): MissingField[] {
  const m: MissingField[] = [];
  const meter = v.primaryMeter === 'hourmeter' ? v.currentHourmeter : v.currentOdometer;
  if (meter == null)
    m.push({ field: 'currentOdometer', label: v.primaryMeter === 'hourmeter' ? 'Horómetro actual' : 'Kilometraje actual', critical: true });
  if (!v.criticality) m.push({ field: 'criticality', label: 'Criticidad A/B/C', critical: true });
  if (!v.documentsWithExpiry.includes('SOAT')) m.push({ field: 'doc.SOAT', label: 'Vencimiento SOAT', critical: true });
  if (requiresTechnicalInspection(v, today) && !v.documentsWithExpiry.includes('RTM'))
    m.push({ field: 'doc.RTM', label: 'Vencimiento revisión técnico-mecánica', critical: true });
  if (!v.vin) m.push({ field: 'vin', label: 'VIN / número de chasis', critical: false });
  if (!v.year) m.push({ field: 'year', label: 'Año modelo', critical: false });
  if (v.loadCapacityKg == null && v.vehicleTypeCode !== 'MOT') m.push({ field: 'loadCapacityKg', label: 'Capacidad de carga', critical: false });
  return m;
}

/** Porcentaje de completitud sobre los 7 campos evaluados (o 6 si la RTM aún no aplica). */
export function vehicleCompleteness(v: VehicleRecord, today: Date = new Date()): number {
  const total = 6 + (requiresTechnicalInspection(v, today) ? 1 : 0) - (v.vehicleTypeCode === 'MOT' ? 1 : 0);
  const missing = missingVehicleFields(v, today).length;
  return Math.round(((total - missing) / total) * 100);
}

export class VehicleRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VehicleRuleError';
  }
}

/**
 * Cambio manual de estado (doc 02 P1/P8):
 * - Exige motivo.
 * - "Dado de baja" es definitivo (el historial se conserva).
 * - Para pasar a OPERATIVO se exige criticidad y lectura inicial.
 */
export function validateStatusChange(
  current: VehicleStatus,
  next: VehicleStatus,
  ctx: { reason?: string | null; criticality?: Criticality | null; hasReading: boolean },
): void {
  if (current === next) throw new VehicleRuleError('SAME_STATUS', 'El vehículo ya está en ese estado');
  if (current === 'retired') throw new VehicleRuleError('RETIRED', 'Un vehículo dado de baja no puede cambiar de estado');
  if (!ctx.reason?.trim()) throw new VehicleRuleError('REASON_REQUIRED', 'Indique el motivo del cambio de estado');
  if ((next === 'operational' || next === 'operational_restricted') && (!ctx.criticality || !ctx.hasReading)) {
    throw new VehicleRuleError(
      'INCOMPLETE_FOR_OPERATION',
      'Para operar, el vehículo necesita criticidad asignada y una lectura de kilometraje',
    );
  }
}

/** Normaliza placas: mayúsculas, sin espacios ni guiones ("L JW938" → "LJW938"). */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Formatos de placa en Colombia (referencia; validar con la ficha técnica vigente del Ministerio de Transporte):
 * - Automotores: ABC123 · Motocicletas: ABC12D (o ABC12 antiguas) · Motocarros: 123ABC.
 */
export const PLATE_FORMATS: Record<string, { pattern: RegExp; example: string }> = {
  default: { pattern: /^[A-Z]{3}\d{3}$/, example: 'ABC123' },
  MOT: { pattern: /^[A-Z]{3}\d{2}[A-Z]?$/, example: 'ABC12D' },
  MCA: { pattern: /^\d{3}[A-Z]{3}$/, example: '123ABC' },
};

/**
 * Placa canónica según el tipo de vehículo. Corrige el error frecuente de escribir la placa de un
 * motocarro con las letras primero ("AFB591" → "591AFB").
 */
export function canonicalPlate(raw: string, vehicleTypeCode?: string | null): string {
  const p = normalizePlate(raw);
  if (vehicleTypeCode === 'MCA') {
    const m = /^([A-Z]{3})(\d{3})$/.exec(p);
    if (m) return `${m[2]}${m[1]}`;
  }
  return p;
}

/** null si la placa cumple el formato del tipo; si no, mensaje para el usuario. */
export function plateFormatIssue(plate: string, vehicleTypeCode?: string | null): string | null {
  const f = PLATE_FORMATS[vehicleTypeCode ?? ''] ?? PLATE_FORMATS.default!;
  return f.pattern.test(plate) ? null : `La placa ${plate} no tiene el formato esperado para este tipo (${f.example})`;
}
