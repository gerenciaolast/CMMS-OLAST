/**
 * Paradas a partir de un cuadro diario de disponibilidad (días marcados «fuera de servicio»).
 * En el cuadro de OLAST los domingos y festivos quedan en blanco aunque el vehículo siga en el taller,
 * así que una parada larga aparece partida en bloques semanales: aquí se vuelven a unir.
 */

export type DowntimeKind = 'corrective' | 'preventive';
export interface DowntimeBlock {
  /** Primer y último día marcado (AAAA-MM-DD). */
  start: string;
  end: string;
  /** Días calendario de la parada (incluye domingos y festivos intermedios). */
  days: number;
  /** Días marcados en el cuadro (días hábiles perdidos). */
  markedDays: number;
  /** Correctiva si algún día fue correctivo. */
  kind: DowntimeKind;
}

const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => toIso(new Date(toDate(s).getTime() + n * DAY));

/** Domingo de Pascua (algoritmo de Meeus/Butcher). */
function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Festivos de Colombia (Ley 51 de 1983, «Ley Emiliani»: varios se trasladan al lunes siguiente). */
export function colombianHolidays(year: number): Set<string> {
  const out = new Set<string>();
  const fixed = (m: number, d: number) => out.add(toIso(new Date(Date.UTC(year, m - 1, d, 12))));
  const monday = (date: Date) => {
    const dow = date.getUTCDay();
    out.add(toIso(new Date(date.getTime() + (dow === 1 ? 0 : ((8 - dow) % 7)) * DAY)));
  };
  [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].forEach(([m, d]) => fixed(m!, d!));
  [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].forEach(([m, d]) => monday(new Date(Date.UTC(year, m! - 1, d!, 12))));
  const e = easter(year).getTime();
  out.add(toIso(new Date(e - 3 * DAY))); // Jueves Santo
  out.add(toIso(new Date(e - 2 * DAY))); // Viernes Santo
  monday(new Date(e + 39 * DAY)); // Ascensión
  monday(new Date(e + 60 * DAY)); // Corpus Christi
  monday(new Date(e + 68 * DAY)); // Sagrado Corazón
  return out;
}

/** ¿Domingo o festivo en Colombia? */
export function isNonWorkingDay(day: string): boolean {
  return toDate(day).getUTCDay() === 0 || colombianHolidays(Number(day.slice(0, 4))).has(day);
}

/**
 * Une los días marcados en paradas: dos días marcados pertenecen a la misma parada si entre ellos
 * solo hay domingos o festivos (máximo 3 días seguidos sin marcar).
 */
export function buildDowntimeBlocks(marked: Map<string, DowntimeKind>, nonWorking: (day: string) => boolean = isNonWorkingDay): DowntimeBlock[] {
  const days = [...marked.keys()].sort();
  const blocks: DowntimeBlock[] = [];
  let cur: DowntimeBlock | null = null;
  for (const d of days) {
    if (cur) {
      const gap: string[] = [];
      for (let x = addDays(cur.end, 1); x < d && gap.length <= 3; x = addDays(x, 1)) gap.push(x);
      if (gap.length <= 3 && gap.every(nonWorking)) {
        cur.end = d;
        cur.markedDays++;
        if (marked.get(d) === 'corrective') cur.kind = 'corrective';
        continue;
      }
      blocks.push(cur);
    }
    cur = { start: d, end: d, days: 0, markedDays: 1, kind: marked.get(d)! };
  }
  if (cur) blocks.push(cur);
  for (const b of blocks) b.days = Math.round((toDate(b.end).getTime() - toDate(b.start).getTime()) / DAY) + 1;
  return blocks;
}
