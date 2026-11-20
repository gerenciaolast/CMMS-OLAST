import { normalizeText, parseHistoryDate } from '../src/modules/maintenance/history-import';

const iso = (r: { date: Date | null }) => r.date?.toISOString().slice(0, 10);

describe('migración del historial: fechas y texto', () => {
  it('fechas de Excel válidas', () => expect(parseHistoryDate(new Date('2025-01-25T00:00:00Z'))).toEqual({ date: new Date('2025-01-25T00:00:00Z'), approximate: false }));
  it('año con un dígito omitido "12/09/204" → 2024-09-12 (aproximada)', () => {
    const r = parseHistoryDate('12/09/204');
    expect(iso(r)).toBe('2024-09-12');
    expect(r.approximate).toBe(true);
  });
  it('formato mes-día-año "02-19-26"', () => expect(iso(parseHistoryDate('02-19-26'))).toBe('2026-02-19'));
  it('dd/mm/aaaa', () => expect(iso(parseHistoryDate('30/09/2025'))).toBe('2025-09-30'));
  it('ilegible "15-15-25" usa el mes de la fila y el año anterior', () => {
    const r = parseHistoryDate('15-15-25', 'Marzo', 2025);
    expect(iso(r)).toBe('2025-03-15');
    expect(r.approximate).toBe(true);
  });
  it('sin datos → null', () => expect(parseHistoryDate('xx')).toEqual({ date: null, approximate: true }));
  it('normaliza tildes y errores frecuentes', () => {
    expect(normalizeText('Cambio de ACIETE y filtors isuzo')).toBe('cambio de aceite y filtros isuzu');
    expect(normalizeText('Cambio correa alternador')).toBe('cambio correa accesorios');
    expect(normalizeText('Cigüeñal')).toBe('cigueñal'); // conserva la ñ, quita la diéresis (como los patrones del catálogo)
  });
});
