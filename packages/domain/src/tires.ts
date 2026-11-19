/**
 * Registro de cambio de llantas (fase 1, sin número de serie).
 * Motivos frecuentes en OLAST: desgaste (delanteras / traseras), daño en la vía y robo (sobre todo la de repuesto).
 */
export const TIRE_REASONS = ['wear', 'road_damage', 'theft', 'rotation', 'other', 'unknown'] as const;
export type TireReason = (typeof TIRE_REASONS)[number];
export type TireAxle = 'front' | 'rear' | 'spare';

export const TIRE_REASON_LABEL: Record<TireReason, string> = {
  wear: 'Desgaste',
  road_damage: 'Daño en la vía (pinchazo, estallido, corte)',
  theft: 'Robo',
  rotation: 'Rotación',
  other: 'Otro',
  unknown: 'Sin motivo (histórico)',
};
export const TIRE_AXLE_LABEL: Record<TireAxle, string> = { front: 'Delanteras', rear: 'Traseras', spare: 'Repuesto' };

export interface TireLayout {
  frontQty?: number | null;
  rearQty?: number | null;
  spareQty?: number | null;
}

export interface TireChangeInput {
  axle: TireAxle;
  quantity: number;
  reason: TireReason;
  positions?: string[];
  notes?: string | null;
}

/** Posiciones posibles por eje según la configuración de llantas del vehículo. */
export function tirePositions(layout: TireLayout, axle: TireAxle): string[] {
  if (axle === 'spare') return Array.from({ length: layout.spareQty ?? 1 }, (_, i) => (i === 0 ? 'REPUESTO' : `REPUESTO-${i + 1}`));
  if (axle === 'front') return (layout.frontQty ?? 2) >= 2 ? ['DEL-IZQ', 'DEL-DER'] : ['DEL'];
  const rear = layout.rearQty ?? 2;
  if (rear >= 8) return ['TRAS1-IZQ-EXT', 'TRAS1-IZQ-INT', 'TRAS1-DER-INT', 'TRAS1-DER-EXT', 'TRAS2-IZQ-EXT', 'TRAS2-IZQ-INT', 'TRAS2-DER-INT', 'TRAS2-DER-EXT'];
  if (rear >= 4) return ['TRAS-IZQ-EXT', 'TRAS-IZQ-INT', 'TRAS-DER-INT', 'TRAS-DER-EXT'];
  if (rear === 1) return ['TRAS'];
  return ['TRAS-IZQ', 'TRAS-DER'];
}

export class TireRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TireRuleError';
  }
}

/** Valida un cambio de llantas contra la configuración del vehículo. */
export function validateTireChange(c: TireChangeInput, layout: TireLayout): void {
  if (!Number.isInteger(c.quantity) || c.quantity < 1) throw new TireRuleError('INVALID_QUANTITY', 'Indique cuántas llantas se cambiaron');
  const max = tirePositions(layout, c.axle).length;
  if (c.quantity > max)
    throw new TireRuleError('TOO_MANY_TIRES', `El eje seleccionado tiene ${max} llanta(s); no se pueden cambiar ${c.quantity}`);
  if (c.positions?.length) {
    const valid = new Set(tirePositions(layout, c.axle));
    const bad = c.positions.filter((p) => !valid.has(p));
    if (bad.length) throw new TireRuleError('INVALID_POSITION', `Posición no válida para el eje: ${bad.join(', ')}`);
    if (new Set(c.positions).size !== c.positions.length) throw new TireRuleError('DUPLICATE_POSITION', 'Hay posiciones repetidas');
    if (c.positions.length !== c.quantity)
      throw new TireRuleError('POSITIONS_MISMATCH', 'La cantidad no coincide con las posiciones seleccionadas');
  }
  if (c.reason === 'rotation' && c.axle === 'spare') throw new TireRuleError('INVALID_ROTATION', 'La rotación aplica a llantas montadas, no al repuesto');
  if ((c.reason === 'other' || c.reason === 'theft') && !c.notes?.trim())
    throw new TireRuleError('NOTES_REQUIRED', 'Describa lo ocurrido (para robo: lugar y si hay denuncia)');
}
