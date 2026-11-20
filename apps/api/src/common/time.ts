/** Rango [inicio, fin) del día local de una zona horaria (p. ej. America/Bogota) que contiene `at`. */
export function localDayRange(timeZone: string, at = new Date()): { start: Date; end: Date; day: string } {
  const day = at.toLocaleDateString('en-CA', { timeZone }); // AAAA-MM-DD
  const offset = tzOffset(timeZone, at); // p. ej. "-05:00"
  const start = new Date(`${day}T00:00:00${offset}`);
  return { start, end: new Date(start.getTime() + 86_400_000), day };
}

function tzOffset(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00';
}
