/**
 * Reglas de asignación de plan PM para la flota OLAST (doc 10). OLAST puede cambiar el plan de cada vehículo en la app.
 * - Motocarro → MCA-3K · N400 → VAN-10K · N300 → VAN-5K
 * - Camión diésel con 3 años o menos, o FVZ → CAM-10K (garantía GM) · resto → CAM-6K
 */
export function suggestPlanCode(v: { typeCode: string; model: string; year: number | null }, today = new Date()): string | null {
  const model = v.model.toUpperCase();
  if (v.typeCode === 'MCA') return 'MCA-3K';
  if (model.includes('N400')) return 'VAN-10K';
  if (model.includes('N300')) return 'VAN-5K';
  if (v.typeCode === 'CAR' || v.typeCode === 'CPE') {
    const age = v.year ? today.getUTCFullYear() - v.year : 99;
    return age <= 3 || model.startsWith('FVZ') ? 'CAM-10K' : 'CAM-6K';
  }
  return null;
}
