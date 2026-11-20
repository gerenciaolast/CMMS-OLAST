/** Datos semilla: catálogos de docs/03-catalogos-y-codificacion.md y docs/09 (componentes en data/catalogos). */

export const FAILURE_MODES: [string, string][] = [
  ['DES', 'Desgaste'], ['ROT', 'Rotura / fractura'], ['FUG', 'Fuga (aceite, refrigerante, aire, combustible)'],
  ['SOB', 'Sobrecalentamiento'], ['RUI', 'Ruido / vibración anormal'], ['ELC', 'Falla eléctrica'],
  ['BLQ', 'Bloqueo / atascamiento'], ['DSJ', 'Desajuste / flojo / desalineado'], ['CON', 'Contaminación'],
  ['COR', 'Corrosión'], ['BAJ', 'Bajo rendimiento'], ['INT', 'Intermitente'], ['NOF', 'No funciona'],
  ['SHF', 'Sin hallazgo'],
];

export const FAILURE_CAUSES: [string, string][] = [
  ['DNO', 'Desgaste normal por uso'], ['FMA', 'Falta o deficiencia de mantenimiento'],
  ['OPE', 'Mala operación / abuso del conductor'], ['INS', 'Instalación o reparación incorrecta'],
  ['REP', 'Defecto de repuesto / calidad del proveedor'], ['FAB', 'Defecto de diseño o fabricación'],
  ['ACC', 'Accidente / daño externo / terceros'], ['AMB', 'Condición ambiental u operativa severa'],
  ['VAN', 'Vandalismo / robo'], ['DES', 'Desconocida (requiere análisis)'],
];

export const REPAIR_ACTIONS: [string, string][] = [
  ['REE', 'Reemplazar'], ['REP', 'Reparar'], ['AJU', 'Ajustar / calibrar / apretar'], ['LUB', 'Lubricar / completar nivel'],
  ['LIM', 'Limpiar'], ['INS', 'Inspeccionar / diagnosticar'], ['REC', 'Reacondicionar / reconstruir'],
  ['PRG', 'Reprogramar / actualizar software'], ['GAR', 'Enviado a garantía'], ['DIF', 'Diferido'],
];

export const HOLD_REASONS: [string, string][] = [
  ['REPUESTO', 'Sin repuesto / en compra'], ['PROVEEDOR', 'En taller externo'], ['APROBACION', 'Presupuesto por aprobar'],
  ['TECNICO', 'Sin personal disponible'], ['VEHICULO', 'Operaciones no libera el vehículo'],
  ['DIAGNOSTICO', 'Esperando diagnóstico especializado'], ['GARANTIA', 'Esperando respuesta del fabricante'],
];

export const WORK_ORDER_TYPES: { code: string; name: string; isPlanned: boolean; requiresFailureCoding: boolean }[] = [
  { code: 'PM', name: 'Preventivo', isPlanned: true, requiresFailureCoding: false },
  { code: 'INS', name: 'Inspección', isPlanned: true, requiresFailureCoding: false },
  { code: 'PDM', name: 'Predictivo / por condición', isPlanned: true, requiresFailureCoding: false },
  { code: 'CP', name: 'Correctivo planificado', isPlanned: true, requiresFailureCoding: true },
  { code: 'CE', name: 'Correctivo de emergencia', isPlanned: false, requiresFailureCoding: true },
  { code: 'AUX', name: 'Auxilio vial', isPlanned: false, requiresFailureCoding: true },
  { code: 'SIN', name: 'Siniestro / colisión', isPlanned: false, requiresFailureCoding: false },
  { code: 'MEJ', name: 'Mejora / modificación', isPlanned: true, requiresFailureCoding: false },
  { code: 'CAM', name: 'Campaña / recall', isPlanned: true, requiresFailureCoding: false },
];

export const PRIORITIES = [
  { code: 'P1', name: 'Emergencia', targetResponseHours: 2, targetResolutionHours: 24 },
  { code: 'P2', name: 'Urgente', targetResponseHours: 24, targetResolutionHours: 72 },
  { code: 'P3', name: 'Normal', targetResponseHours: 168, targetResolutionHours: 360 },
  { code: 'P4', name: 'Oportunidad', targetResponseHours: 720, targetResolutionHours: 720 },
];

export const VEHICLE_TYPES = [
  { code: 'LIV', name: 'Liviano (automóvil, camioneta)', primaryMeter: 'odometer', maxDailyUsage: 1000 },
  { code: 'CAR', name: 'Carga liviana/mediana (furgón)', primaryMeter: 'odometer', maxDailyUsage: 1200 },
  { code: 'CPE', name: 'Carga pesada (camión rígido > 10 t)', primaryMeter: 'odometer', maxDailyUsage: 1500 },
  { code: 'TRC', name: 'Tractocamión', primaryMeter: 'odometer', maxDailyUsage: 1500 },
  { code: 'REM', name: 'Remolque / semirremolque', primaryMeter: 'odometer', maxDailyUsage: 1500 },
  { code: 'BUS', name: 'Bus / van de pasajeros', primaryMeter: 'odometer', maxDailyUsage: 1000 },
  { code: 'MOT', name: 'Motocicleta', primaryMeter: 'odometer', maxDailyUsage: 600 },
  { code: 'MCA', name: 'Motocarro (tres ruedas, carga)', primaryMeter: 'odometer', maxDailyUsage: 400 },
  { code: 'MAQ', name: 'Maquinaria / montacargas', primaryMeter: 'hourmeter', maxDailyUsage: 24 },
];

/** Colombia (doc 08 §0). */
export const DOCUMENT_TYPES = [
  { code: 'SOAT', name: 'SOAT (seguro obligatorio)', isBlocking: true },
  { code: 'RTM', name: 'Revisión técnico-mecánica y de emisiones', isBlocking: true },
  { code: 'TPR', name: 'Licencia de tránsito (tarjeta de propiedad)', isBlocking: false, alertDays: [] },
  { code: 'POL', name: 'Póliza todo riesgo / responsabilidad civil', isBlocking: false },
  { code: 'EXT', name: 'Recarga de extintor', isBlocking: false },
  { code: 'SAN', name: 'Concepto sanitario del vehículo (transporte de medicamentos/alimentos)', isBlocking: false },
];

/** Checklist pre-operacional base (doc 03 §7). [texto, componente, crítico, foto al fallar, tipos excluidos] */
export const BASE_CHECKLIST: [string, string | null, boolean, boolean, string[]?][] = [
  ['Frenos de servicio y estacionamiento', 'FRN', true, false],
  ['Dirección (juego, ruidos)', 'DIR', true, false],
  ['Neumáticos: estado, presión visual, cortes', 'NEU', true, true],
  ['Luces: delanteras, freno, direccionales, reversa', 'ILU', true, false],
  ['Cinturones de seguridad', 'SEG', true, false, ['MOT', 'MCA']],
  ['Sin fugas de combustible ni de líquido de frenos', 'COM', true, true],
  ['Fugas de aceite o refrigerante', 'MOT', false, true],
  ['Limpiaparabrisas y vidrios / visibilidad', 'CAR', true, false],
  ['Espejos retrovisores', 'CAR', false, false],
  ['Niveles: aceite, refrigerante, líquido de frenos, lavaparabrisas', 'MOT', false, false],
  ['Testigos del tablero apagados', 'ELN', false, true],
  ['Bocina y alarma de reversa', 'ILU', false, false],
  ['Equipo de seguridad: extintor vigente, botiquín, triángulos', 'SEG', false, false, ['MOT', 'MCA']],
  ['Guayas de embrague y freno: ajuste y estado', 'EMB', true, false, ['LIV', 'CAR', 'CPE', 'TRC', 'BUS', 'REM', 'MAQ']],
  ['Documentos del vehículo a bordo', null, false, false],
  ['Carrocería y furgón: daños nuevos', 'CAR', false, true],
  ['Limpieza general de cabina', null, false, false],
];

/** Sedes del historial (doc 09). */
export const SITES: [string, string][] = [
  ['BOG', 'Bogotá'], ['TUN', 'Tunja'], ['NEI', 'Neiva'], ['VIL', 'Villavicencio'],
  ['CAL', 'Cali'], ['PER', 'Pereira'], ['PIT', 'Pitalito'],
];
