/**
 * Planes de mantenimiento preventivo propuestos para OLAST (doc 10).
 * Fuentes: garantía Chevrolet Colombia Serie N (10.000 km o 6 meses), esquema anterior de rutinas ABC (6.000 km),
 * rutina vigente DISCOLMETS (5.000 km), historial 2024–2026 (409 intervenciones) y criterio RCM: se agregan
 * inspecciones donde el historial muestra fallas repetitivas (frenos, rodamientos, refrigeración, suspensión, EGR).
 * Se crean solo si no existen: los ajustes que haga OLAST en la app no se sobrescriben.
 */
type Task = [description: string, componentCode: string | null, rationale?: string];
interface Routine {
  code: string;
  name: string;
  km: number;
  days: number;
  hours?: number;
  includes: string[];
  tasks: Task[];
}
export interface PlanDef {
  code: string;
  name: string;
  description: string;
  basis: string;
  routines: Routine[];
}

const HIST = 'Falla frecuente en el historial 2024–2026';

// ── Camiones diésel (Serie N / F con motor Isuzu) ──
const truckA: Task[] = [
  ['Cambio de aceite de motor (especificación del fabricante)', 'MOT.LUB.ACE'],
  ['Cambio de filtro de aceite', 'MOT.LUB.FAC'],
  ['Cambio de empaque / arandela del tapón del cárter', 'MOT.LUB.TAP'],
  ['Graduación de frenos y revisión de freno de mano', 'FRN.AJU.GRA', `${HIST}: frenos es el sistema con más eventos correctivos`],
  ['Engrase general de chasis (crucetas, pasadores de muelle, pines y bocines)', 'GEN.LUB.ENG', `${HIST}: crucetas, bujes y splinder`],
  ['Revisión de niveles: refrigerante, líquido de frenos, embrague, dirección', 'REF.LIQ.REF', `${HIST}: refrigeración`],
  ['Inspección de fugas (motor, caja, diferencial, combustible) y mangueras', 'REF.RAD.MAN'],
  ['Revisión de correas y tensores', 'MOT.ACC.COR'],
  ['Revisión de luces, pito y alarma de reversa', 'ILU.LUC.EXT'],
  ['Revisión de presión y estado de llantas (incluida la de repuesto)', 'NEU.NEU.NEU'],
];
const truckB: Task[] = [
  ['Cambio de filtro de combustible y drenaje de trampa de agua', 'COM.FIL.FIL'],
  ['Cambio de filtro de aire (o limpieza según condición)', 'ADM.FIL.AIR'],
  ['Medición de bandas/pastillas y revisión de cilindros y campanas', 'FRN.FRI.BAN', `${HIST}: bandas, cilindros y campanas`],
  ['Revisión de suspensión: hojas de muelle, bujes, amortiguadores', 'SUS.MUE.BUJ', `${HIST}: bujes y hojas de muelle`],
  ['Revisión de dirección: terminales, brazos, pines y bocines (splinder)', 'DIR.EJE.PIV', `${HIST}: splinder y terminales`],
  ['Rotación de llantas y revisión de alineación', 'NEU.ALI.ALI'],
  ['Escaneo electrónico (códigos de falla)', 'ELN.DIA.ESC'],
  ['Revisión de batería, bornes y alternador', 'ELE.BAT.BAT'],
];
const truckC: Task[] = [
  ['Revisión, limpieza y engrase de rodamientos de rueda; cambio de retenedores si hay fuga', 'RUE.ROD.ROD', `${HIST}: rodamientos y retenedores de rueda`],
  ['Inspección de cardán: crucetas, soporte central y balinera', 'TRE.CAR.CRU', `${HIST}: crucetas y soporte de cardán`],
  ['Limpieza / revisión de válvula EGR', 'ESC.EGR.EGR', `${HIST}: mantenimientos correctivos de EGR`],
  ['Revisión de turbo, intercooler y mangueras de admisión', 'ADM.TUR.TUR', `${HIST}: reparaciones de turbo`],
  ['Revisión de radiador, tapa, termostato y ventilador / fan clutch', 'REF.RAD.RAD', `${HIST}: fugas de radiador y termostatos`],
  ['Revisión de embrague (juego del pedal, desgaste) y freno de ahogo', 'EMB.ACC.AJU'],
];
const truckD: Task[] = [
  ['Cambio de aceite de caja de velocidades', 'TRA.CAJ.ACE'],
  ['Cambio de aceite de diferencial', 'TRE.DIF.ACE'],
  ['Cambio de refrigerante (limpieza del sistema)', 'REF.LIQ.REF'],
  ['Cambio de líquido de frenos y purga', 'FRN.HID.LIQ'],
  ['Cambio de correas de accesorios', 'MOT.ACC.COR'],
];

// ── Vans a gasolina (N300 / N400) ──
const vanA: Task[] = [
  ['Cambio de aceite de motor', 'MOT.LUB.ACE'],
  ['Cambio de filtro de aceite y empaque del tapón', 'MOT.LUB.FAC'],
  ['Revisión de frenos (pastillas, discos, bandas) y freno de mano', 'FRN.AJU.GRA'],
  ['Revisión de niveles y fugas; revisión de mangueras de refrigeración', 'REF.LIQ.REF', `${HIST}: motor ventilador, mangueras y termostato en N300`],
  ['Revisión de luces, plumillas y presión de llantas', 'ILU.LUC.EXT'],
];
const vanB: Task[] = [
  ['Cambio de filtro de aire', 'ADM.FIL.AIR'],
  ['Revisión de suspensión delantera (tijeras, barra estabilizadora, bujes) y dirección', 'SUS.DEL.TIJ', `${HIST}: tijeras, terminales y caja de dirección en N300`],
  ['Alineación, balanceo y rotación de llantas', 'NEU.ALI.ALI'],
  ['Revisión de batería, alternador y correa de accesorios', 'ELE.BAT.BAT'],
  ['Revisión del sistema de puertas corredizas (rieles y rodillos)', 'CAR.PUE.PUE', `${HIST}: puertas corredizas N300`],
];
const vanC: Task[] = [
  ['Cambio de bujías', 'MOT.CUL.EMP'],
  ['Cambio de filtro de combustible', 'COM.FIL.FIL'],
  ['Limpieza de cuerpo de aceleración / válvula IAC e inyectores', 'ADM.MUL.CUE', `${HIST}: cuerpo de aceleración e IAC`],
  ['Revisión de embrague y cruceta de cardán', 'EMB.KIT.KIT', `${HIST}: kits de embrague en N300`],
  ['Revisión de rodamientos de rueda', 'RUE.ROD.ROD'],
];
const vanD: Task[] = [
  ['Cambio de refrigerante', 'REF.LIQ.REF'],
  ['Cambio de líquido de frenos', 'FRN.HID.LIQ'],
  ['Cambio de aceite de caja', 'TRA.CAJ.ACE'],
  ['Cambio de correa de accesorios', 'MOT.ACC.COR'],
];

export const PM_PLANS: PlanDef[] = [
  {
    code: 'CAM-6K',
    name: 'Camión diésel en operación · 6.000 km',
    description: 'NHR, NKR, NQR, NPR y FRR fuera de garantía.',
    basis: 'Esquema de rutinas ABC cada 6.000 km de la red Chevrolet; historial OLAST: mediana real 6.500 km entre cambios de aceite.',
    routines: [
      { code: 'A', name: 'Servicio A', km: 6_000, days: 182, includes: [], tasks: truckA },
      { code: 'B', name: 'Servicio B', km: 12_000, days: 365, includes: ['A'], tasks: truckB },
      { code: 'C', name: 'Servicio C', km: 24_000, days: 365, includes: ['A', 'B'], tasks: truckC },
      { code: 'D', name: 'Servicio D · cambio de fluidos', km: 48_000, days: 730, includes: ['A', 'B', 'C'], tasks: truckD },
    ],
  },
  {
    code: 'CAM-10K',
    name: 'Camión diésel nuevo / en garantía · 10.000 km',
    description: 'NPR y FVZ 2026, NKR 2023 y vehículos con garantía GM vigente.',
    basis: 'Garantía Chevrolet Colombia Serie N: revisión cada 10.000 km o 6 meses (tolerancia 1.000 km o 1 mes). Revisiones del historial a 10, 20, 30 y 40 mil km; cambio total de fluidos a 40.000 km.',
    routines: [
      { code: 'A', name: 'Revisión 10.000', km: 10_000, days: 182, includes: [], tasks: truckA },
      { code: 'B', name: 'Revisión 20.000', km: 20_000, days: 365, includes: ['A'], tasks: [...truckB, ...truckC.slice(0, 2)] },
      { code: 'C', name: 'Revisión 40.000 · cambio de fluidos', km: 40_000, days: 730, includes: ['A', 'B'], tasks: [...truckC.slice(2), ...truckD] },
    ],
  },
  {
    code: 'VAN-5K',
    name: 'Van a gasolina N300 · 5.000 km',
    description: 'Chevrolet N300 Cargo / Move.',
    basis: 'Rutina DISCOLMETS vigente (5.000 km) y red Chevrolet Colombia (5.000 / 10.000 / 20.000 km); historial OLAST: 5.500–5.800 km entre cambios.',
    routines: [
      { code: 'A', name: 'Servicio 5.000', km: 5_000, days: 182, includes: [], tasks: vanA },
      { code: 'B', name: 'Servicio 10.000', km: 10_000, days: 365, includes: ['A'], tasks: vanB },
      { code: 'C', name: 'Servicio 20.000', km: 20_000, days: 365, includes: ['A', 'B'], tasks: vanC },
      { code: 'D', name: 'Servicio 40.000 · fluidos', km: 40_000, days: 730, includes: ['A', 'B', 'C'], tasks: vanD },
    ],
  },
  {
    code: 'VAN-10K',
    name: 'Van a gasolina en garantía (N400) · 10.000 km',
    description: 'Chevrolet N400 con revisiones de fabricante.',
    basis: 'Revisiones de fabricante del historial (7.400 / 15.600 / 25.300 / 35.100 km): plan de garantía a 10.000 km o 6 meses.',
    routines: [
      { code: 'A', name: 'Revisión 10.000', km: 10_000, days: 182, includes: [], tasks: [...vanA, ['Cambio de filtro de aire acondicionado', 'HVA.AAC.AAC']] },
      { code: 'B', name: 'Revisión 20.000', km: 20_000, days: 365, includes: ['A'], tasks: [...vanB, ...vanC] },
      { code: 'C', name: 'Revisión 40.000 · fluidos', km: 40_000, days: 730, includes: ['A', 'B'], tasks: vanD },
    ],
  },
  {
    code: 'MCA-3K',
    name: 'Motocarro Bajaj RE Maxima C · 3.000 km',
    description: 'Motocarros de carga (motor monocilíndrico a gasolina).',
    basis: 'Historial OLAST: cambios de aceite cada 2.400–3.500 km; referencia general de motores de moto 3.000–5.000 km o 6 meses. Pendiente confirmar con el manual Bajaj.',
    routines: [
      {
        code: 'A', name: 'Servicio 3.000', km: 3_000, days: 120, includes: [],
        tasks: [
          ['Cambio de aceite de motor', 'MOT.LUB.ACE'],
          ['Limpieza de filtro de aire', 'ADM.FIL.AIR'],
          ['Ajuste de guaya de embrague y de frenos', 'EMB.ACC.GUA', `${HIST}: guayas de embrague`],
          ['Revisión de luces, pito y presión de llantas', 'ILU.LUC.EXT'],
        ],
      },
      {
        code: 'B', name: 'Servicio 6.000', km: 6_000, days: 240, includes: ['A'],
        tasks: [
          ['Cambio de aceite de transmisión (valvulina)', 'TRA.CAJ.ACE'],
          ['Cambio de filtro de aceite / malla y filtro de aire', 'MOT.LUB.FAC'],
          ['Cambio o calibración de bujía', 'MOT.CUL.EMP'],
          ['Revisión de caja de cambios y selector (pin de reversa)', 'TRA.CAJ.CAJ', `${HIST}: pin de reversa`],
          ['Revisión de rodamientos de ruedas y frenos', 'RUE.ROD.ROD'],
        ],
      },
    ],
  },
];

export { suggestPlanCode } from '../../src/modules/pm/plan-suggestion';
