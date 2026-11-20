import type { VehicleStatus } from '@cmms/shared';

/** Inspección pre-operacional (doc 02 P3) y control de documentos (doc 02 P9). */

export type InspectionAnswer = 'ok' | 'defect' | 'na';
export interface ChecklistItemRule {
  id: string;
  text: string;
  isCritical: boolean;
  requiresPhotoOnFail: boolean;
}
export interface AnswerInput {
  itemId: string;
  answer: InspectionAnswer;
  comment?: string | null;
  photos?: number;
}

export class InspectionRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'InspectionRuleError';
  }
}

/** Valida que se respondan todos los ítems y que cada defecto tenga evidencia suficiente. */
export function validateInspectionAnswers(items: ChecklistItemRule[], answers: AnswerInput[]): void {
  const byId = new Map(answers.map((a) => [a.itemId, a]));
  const missing = items.filter((i) => !byId.has(i.id));
  if (missing.length)
    throw new InspectionRuleError('ITEMS_MISSING', `Faltan ${missing.length} ítem(s) por revisar`, { items: missing.map((m) => m.text) });
  const unknown = answers.filter((a) => !items.some((i) => i.id === a.itemId));
  if (unknown.length) throw new InspectionRuleError('UNKNOWN_ITEM', 'Hay respuestas que no pertenecen al checklist');
  for (const i of items) {
    const a = byId.get(i.id)!;
    if (a.answer !== 'defect') continue;
    if (i.requiresPhotoOnFail && !(a.photos && a.photos > 0))
      throw new InspectionRuleError('PHOTO_REQUIRED', `«${i.text}»: tome una foto del defecto`, { itemId: i.id });
    if (!a.comment?.trim() && !(a.photos && a.photos > 0))
      throw new InspectionRuleError('DEFECT_DETAIL_REQUIRED', `«${i.text}»: describa el defecto o tome una foto`, { itemId: i.id });
  }
}

/** Defecto en ítem crítico → NO APTO (vehículo fuera de servicio). Otros defectos → APTO CON OBSERVACIONES. */
export function inspectionOutcome(items: ChecklistItemRule[], answers: AnswerInput[]): 'fit' | 'fit_with_observations' | 'unfit' {
  const critical = new Set(items.filter((i) => i.isCritical).map((i) => i.id));
  const defects = answers.filter((a) => a.answer === 'defect');
  if (defects.some((d) => critical.has(d.itemId))) return 'unfit';
  return defects.length ? 'fit_with_observations' : 'fit';
}

// ───── Documentos ─────

export type DocumentAlert = 'expired' | 'urgent' | 'soon' | 'notice' | null;

/**
 * Nivel de alerta según días al vencimiento y los umbrales del tipo de documento (p. ej. [30, 15, 7]):
 * vencido · urgente (≤ menor umbral) · pronto (≤ umbral intermedio) · aviso (≤ mayor umbral).
 */
export function documentAlert(expiresAt: Date, alertDays: number[], today: Date): { level: DocumentAlert; daysLeft: number } {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const end = Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth(), expiresAt.getUTCDate());
  const daysLeft = Math.round((end - start) / 86_400_000);
  if (daysLeft < 0) return { level: 'expired', daysLeft };
  const t = [...alertDays].sort((a, b) => a - b);
  if (!t.length) return { level: null, daysLeft };
  if (daysLeft <= t[0]!) return { level: 'urgent', daysLeft };
  if (t.length > 2 && daysLeft <= t[1]!) return { level: 'soon', daysLeft };
  if (daysLeft <= t[t.length - 1]!) return { level: t.length > 2 ? 'notice' : 'soon', daysLeft };
  return { level: null, daysLeft };
}

/**
 * Documento obligatorio vencido → vehículo FUERA DE SERVICIO · ADMINISTRATIVO; al renovarlo vuelve a OPERATIVO
 * (solo si el bloqueo era administrativo). No toca vehículos en taller, siniestro ni de baja.
 */
export function vehicleStatusForDocuments(current: VehicleStatus, expiredBlocking: number): VehicleStatus | null {
  if (expiredBlocking > 0 && (current === 'operational' || current === 'operational_restricted' || current === 'reserve')) return 'out_of_service_administrative';
  if (expiredBlocking === 0 && current === 'out_of_service_administrative') return 'operational';
  return null;
}
