import type { VehicleStatus } from '@cmms/shared';

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  operational: 'Operativo',
  operational_restricted: 'Operativo con restricción',
  out_of_service_maintenance: 'Fuera de servicio · mantenimiento',
  out_of_service_parts: 'Fuera de servicio · espera repuesto',
  out_of_service_accident: 'Fuera de servicio · siniestro',
  out_of_service_administrative: 'Fuera de servicio · administrativo',
  reserve: 'Reserva',
  retired: 'Dado de baja',
};

export const STATUS_TONE: Record<VehicleStatus, string> = {
  operational: 'bg-ok/12 text-ok border-ok/30',
  operational_restricted: 'bg-warn/12 text-warn border-warn/30',
  out_of_service_maintenance: 'bg-danger/10 text-danger border-danger/30',
  out_of_service_parts: 'bg-danger/10 text-danger border-danger/30',
  out_of_service_accident: 'bg-danger/10 text-danger border-danger/30',
  out_of_service_administrative: 'bg-danger/10 text-danger border-danger/30',
  reserve: 'bg-sky/25 text-brand-800 border-sky/60',
  retired: 'bg-line text-muted border-line',
};

export const OWNERSHIP_LABEL: Record<string, string> = { own: 'Propio', leasing: 'Leasing', rental: 'Renting', third_party: 'Tercero' };

export interface MissingField { field: string; label: string; critical: boolean }

export interface VehicleSummary {
  id: string;
  plate: string;
  status: VehicleStatus;
  statusReason: string | null;
  criticality: 'A' | 'B' | 'C' | null;
  currentOdometer: number | null;
  accumulatedOdometer: number | null;
  lastReadingAt: string | null;
  year: number | null;
  vin: string | null;
  completeness: number | null;
  missing: MissingField[];
  nextExpiry: { code: string; expiresAt: string } | null;
  site: { code: string; name: string };
  vehicleModel: { id: string; make: string; model: string; vehicleType: { code: string; name: string; primaryMeter: string } };
  drivers: { isPrimary: boolean; driver: { id: string; fullName: string; phone: string | null } }[];
}

export interface Driver {
  id: string;
  fullName: string;
  documentId: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  licenseCategory: string | null;
  licenseExpiry: string | null;
  notes: string | null;
  active: boolean;
  site: { code: string; name: string } | null;
  vehicles: { isPrimary: boolean; vehicle: { id: string; plate: string } }[];
}

export const money = (n: string | number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export interface VehicleDetail extends VehicleSummary {
  rtmRequired: boolean;
  siteHistory: { id: string; startedAt: string; endedAt: string | null; reason: string | null; site: { code: string; name: string } }[];
  tireChanges: {
    id: string; changedAt: string; odometer: number | null; axle: 'front' | 'rear' | 'spare'; quantity: number; positions: string[];
    reason: 'wear' | 'road_damage' | 'theft' | 'rotation' | 'other' | 'unknown'; tireSize: string | null; tireBrand: string | null;
    totalCost: string | null; supplier: string | null; notes: string | null;
  }[];
  engineNumber: string | null;
  color: string | null;
  serviceType: string | null;
  registrationCity: string | null;
  ownership: string;
  titleHolder: string | null;
  loadCapacityKg: number | null;
  costCenter: string | null;
  notes: string | null;
  inServiceDate: string | null;
  odometerOffset: number;
  criticalityScore: { operationalImpact: number; safety: number; repairCost: number; usage: number; score: number } | null;
  attributes: { tires?: { frontSize?: string; frontQty?: number; rearSize?: string; rearQty?: number; brand?: string; loadIndex?: number } };
  readings: { id: string; value: number; accumulatedValue: number; readAt: string; source: string; isFlagged: boolean; flagReason: string | null }[];
  statusLog: { id: string; status: VehicleStatus; reason: string | null; startedAt: string; endedAt: string | null; source: string }[];
  documents: { id: string; number: string | null; issuer: string | null; issuedAt: string | null; expiresAt: string | null; documentType: { code: string; name: string; isBlocking: boolean } }[];
}

export const km = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('es-CO')} km`);
export const day = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
/** Fecha corta para tablas: 09/09/2026. */
export const shortDay = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—';
export const daysUntil = (s: string) => Math.ceil((new Date(s).getTime() - Date.now()) / 86_400_000);
