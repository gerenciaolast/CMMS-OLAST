import { describe, expect, it } from 'vitest';
import { validateInspectionAnswers, inspectionOutcome, documentAlert, vehicleStatusForDocuments, InspectionRuleError } from '../src';

const items = [
  { id: 'frenos', text: 'Frenos', isCritical: true, requiresPhotoOnFail: false },
  { id: 'llantas', text: 'Neumáticos', isCritical: true, requiresPhotoOnFail: true },
  { id: 'aseo', text: 'Limpieza', isCritical: false, requiresPhotoOnFail: false },
];
const allOk = items.map((i) => ({ itemId: i.id, answer: 'ok' as const }));
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as InspectionRuleError).code; }
  return null;
};

describe('inspección pre-operacional (doc 02 P3)', () => {
  it('todo OK → APTO', () => {
    expect(() => validateInspectionAnswers(items, allOk)).not.toThrow();
    expect(inspectionOutcome(items, allOk)).toBe('fit');
  });
  it('exige responder todos los ítems', () => expect(code(() => validateInspectionAnswers(items, allOk.slice(1)))).toBe('ITEMS_MISSING'));
  it('rechaza ítems ajenos al checklist', () => expect(code(() => validateInspectionAnswers(items, [...allOk, { itemId: 'x', answer: 'ok' }]))).toBe('UNKNOWN_ITEM'));
  it('defecto no crítico → APTO CON OBSERVACIONES', () => {
    const a = allOk.map((x) => (x.itemId === 'aseo' ? { ...x, answer: 'defect' as const, comment: 'Cabina sucia' } : x));
    expect(inspectionOutcome(items, a)).toBe('fit_with_observations');
  });
  it('defecto crítico → NO APTO', () => {
    const a = allOk.map((x) => (x.itemId === 'frenos' ? { ...x, answer: 'defect' as const, comment: 'Pedal largo' } : x));
    expect(inspectionOutcome(items, a)).toBe('unfit');
  });
  it('defecto sin detalle ni foto se rechaza', () => {
    const a = allOk.map((x) => (x.itemId === 'aseo' ? { ...x, answer: 'defect' as const } : x));
    expect(code(() => validateInspectionAnswers(items, a))).toBe('DEFECT_DETAIL_REQUIRED');
  });
  it('ítems que exigen foto', () => {
    const a = allOk.map((x) => (x.itemId === 'llantas' ? { ...x, answer: 'defect' as const, comment: 'Corte lateral' } : x));
    expect(code(() => validateInspectionAnswers(items, a))).toBe('PHOTO_REQUIRED');
    expect(() => validateInspectionAnswers(items, a.map((x) => (x.itemId === 'llantas' ? { ...x, photos: 1 } : x)))).not.toThrow();
  });
  it('N.A. no es defecto', () => expect(inspectionOutcome(items, allOk.map((x) => ({ ...x, answer: 'na' as const })))).toBe('fit'));
});

describe('alertas de documentos (doc 02 P9)', () => {
  const today = new Date('2026-11-20T15:00:00Z');
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  it('niveles con umbrales 30/15/7', () => {
    expect(documentAlert(d('2026-11-19'), [30, 15, 7], today)).toEqual({ level: 'expired', daysLeft: -1 });
    expect(documentAlert(d('2026-11-20'), [30, 15, 7], today)).toEqual({ level: 'urgent', daysLeft: 0 });
    expect(documentAlert(d('2026-11-27'), [30, 15, 7], today).level).toBe('urgent');
    expect(documentAlert(d('2026-11-28'), [30, 15, 7], today).level).toBe('soon');
    expect(documentAlert(d('2026-12-05'), [30, 15, 7], today).level).toBe('soon');
    expect(documentAlert(d('2026-12-06'), [30, 15, 7], today).level).toBe('notice');
    expect(documentAlert(d('2026-12-20'), [30, 15, 7], today).level).toBe('notice');
    expect(documentAlert(d('2026-12-21'), [30, 15, 7], today)).toEqual({ level: null, daysLeft: 31 });
  });
  it('documento sin umbrales solo alerta si vence', () => {
    expect(documentAlert(d('2026-11-25'), [], today).level).toBeNull();
    expect(documentAlert(d('2026-11-01'), [], today).level).toBe('expired');
  });
  it('dos umbrales', () => {
    expect(documentAlert(d('2026-11-25'), [30, 7], today).level).toBe('urgent');
    expect(documentAlert(d('2026-12-10'), [30, 7], today).level).toBe('soon');
  });
  it('bloqueo administrativo por documento obligatorio vencido y desbloqueo al renovar', () => {
    expect(vehicleStatusForDocuments('operational', 1)).toBe('out_of_service_administrative');
    expect(vehicleStatusForDocuments('reserve', 2)).toBe('out_of_service_administrative');
    expect(vehicleStatusForDocuments('out_of_service_maintenance', 1)).toBeNull();
    expect(vehicleStatusForDocuments('out_of_service_administrative', 0)).toBe('operational');
    expect(vehicleStatusForDocuments('operational', 0)).toBeNull();
    expect(vehicleStatusForDocuments('retired', 1)).toBeNull();
  });
});
