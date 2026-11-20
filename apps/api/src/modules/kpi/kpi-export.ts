import ExcelJS from 'exceljs';
import type { KpiService } from './kpi.service';

type Dash = Awaited<ReturnType<KpiService['dashboard']>>;
type Pareto = Awaited<ReturnType<KpiService['pareto']>>;
type Actors = Awaited<ReturnType<KpiService['badActors']>>;
type Orders = Awaited<ReturnType<KpiService['ordersIn']>>;

const BRAND = 'FF0B5E85';
const LIGHT: Record<string, string> = { ok: 'FFD7F0DD', warn: 'FFFFF2B3', bad: 'FFF8D0CC' };
const TYPE: Record<string, string> = { PM: 'Preventivo', INS: 'Inspección', PDM: 'Predictivo', CP: 'Correctivo programado', CE: 'Correctivo de emergencia', AUX: 'Auxilio en vía', SIN: 'Siniestro', MEJ: 'Mejora', CAM: 'Campaña' };
const FMT = { pct: '0.0%', km: '#,##0', h: '#,##0.0', d: '#,##0.0', cop_km: '"$"#,##0', weeks: '0.0' } as const;

function header(ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number; fmt?: string }[]) {
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }));
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  row.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

/** Libro de Excel del tablero: indicadores con tendencia, Pareto, malos actores y OT del periodo. */
export async function kpiWorkbook(x: { dash: Dash; systems: Pareto; components: Pareto; actors: Actors; orders: Orders; filters: { site: string; type: string } }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CMMS OLAST';
  const period = `${x.dash.period.from.slice(0, 10)} a ${new Date(new Date(x.dash.period.to).getTime() - 1).toISOString().slice(0, 10)}`;

  const k = wb.addWorksheet('Indicadores');
  const months = x.dash.kpis.find((i) => i.trend.length)?.trend.map((t) => t.month) ?? [];
  header(k, [
    { header: '#', key: 'n', width: 4 }, { header: 'Indicador', key: 'name', width: 36 }, { header: 'Valor', key: 'value', width: 12 },
    { header: 'Meta', key: 'target', width: 18 }, { header: 'Detalle', key: 'detail', width: 40 },
    ...months.map((m) => ({ header: m, key: m, width: 10 })), { header: 'Alcance del cálculo', key: 'scope', width: 70 },
  ]);
  for (const i of x.dash.kpis) {
    const row = k.addRow({ n: i.n, name: i.name, value: i.value, target: i.targetLabel, detail: i.detail, scope: i.scope, ...Object.fromEntries(i.trend.map((t) => [t.month, t.value])) });
    const fmt = FMT[i.unit];
    row.getCell('value').numFmt = fmt;
    for (const m of months) row.getCell(m).numFmt = fmt;
    if (i.light) row.getCell('value').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT[i.light]! } };
  }
  k.addRow([]);
  k.addRow(['', `Periodo: ${period} · Sede: ${x.filters.site} · Tipo: ${x.filters.type} · Generado: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`]);

  const c = wb.addWorksheet('Costo por mes');
  const types = [...new Set(x.dash.costByMonth.flatMap((r) => Object.keys(r).filter((key) => key !== 'month' && key !== 'total')))];
  header(c, [{ header: 'Mes', key: 'month', width: 10 }, ...types.map((t) => ({ header: TYPE[t] ?? t, key: t, width: 16, fmt: '"$"#,##0' })), { header: 'Total', key: 'total', width: 16, fmt: '"$"#,##0' }]);
  for (const r of x.dash.costByMonth) c.addRow(r);

  const pareto = (title: string, rows: Pareto, valueHeader: string, fmt: string) => {
    const ws = wb.addWorksheet(title);
    header(ws, [{ header: 'Código', key: 'key', width: 14 }, { header: 'Nombre', key: 'name', width: 40 }, { header: valueHeader, key: 'value', width: 16, fmt }, { header: 'Participación', key: 'share', width: 13, fmt: '0.0%' }, { header: 'Acumulado', key: 'cumulative', width: 12, fmt: '0.0%' }, { header: 'Pocos vitales (80 %)', key: 'vital', width: 12 }, { header: 'OT', key: 'orders', width: 60 }]);
    for (const r of rows) ws.addRow({ ...r, vital: r.vital ? 'SÍ' : '', orders: r.orders.map((o) => o.number).join(', ') });
  };
  pareto('Pareto sistemas (costo)', x.systems, 'Costo', '"$"#,##0');
  pareto('Pareto componentes (fallas)', x.components, 'Fallas', '0');

  const a = wb.addWorksheet('Malos actores');
  header(a, [
    { header: 'Placa', key: 'plate', width: 10 }, { header: 'Sede', key: 'site', width: 14 }, { header: 'Modelo', key: 'model', width: 30 },
    { header: 'OT', key: 'orders', width: 6 }, { header: 'Fallas', key: 'failures', width: 8 }, { header: 'Costo', key: 'cost', width: 16, fmt: '"$"#,##0' },
    { header: 'Km', key: 'km', width: 10, fmt: '#,##0' }, { header: 'Costo/km', key: 'costPerKm', width: 10, fmt: '"$"#,##0' },
    { header: 'Km entre fallas', key: 'kmBetweenFailures', width: 12, fmt: '#,##0' }, { header: 'Disponibilidad', key: 'availability', width: 13, fmt: '0.0%' },
  ]);
  for (const r of x.actors) a.addRow(r);

  const o = wb.addWorksheet('OT del periodo');
  header(o, [
    { header: 'OT', key: 'number', width: 16 }, { header: 'Placa', key: 'plate', width: 10 }, { header: 'Sede', key: 'site', width: 14 }, { header: 'Tipo', key: 'type', width: 22 },
    { header: 'Fecha', key: 'date', width: 11 }, { header: 'Km', key: 'km', width: 10, fmt: '#,##0' }, { header: 'Costo', key: 'cost', width: 14, fmt: '"$"#,##0' },
    { header: 'Componentes', key: 'components', width: 26 }, { header: 'Retrabajo', key: 'rework', width: 9 }, { header: 'Historial Excel', key: 'hist', width: 9 }, { header: 'Descripción', key: 'description', width: 70 },
  ]);
  for (const r of x.orders)
    o.addRow({ number: r.number, plate: r.plate, site: r.site, type: TYPE[r.type] ?? r.type, date: r.doneAt!.toISOString().slice(0, 10), km: r.odometerIn, cost: r.cost, components: r.failures.map((f) => f.componentCode).join(', '), rework: r.isRework ? 'SÍ' : '', hist: r.isHistorical ? 'SÍ' : '', description: r.description });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
