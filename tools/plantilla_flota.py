#!/usr/bin/env python3
"""Genera la plantilla de inventario de flota OLAST (Excel) pre-llenada.

Uso:
    python3 -I tools/plantilla_flota.py <LLANTAS_VEHICULOS.xlsx> <salida.xlsx> [HOJA_DE_VIDA_MANTTO.xlsx]

- Toma el inventario de la hoja "Vehiculos propios" (fuente principal, la más reciente),
  completa con "vehiculos" (conductor, siniestros) y "VEHICULO TERCEROS".
- Si se pasa el historial de mantenimiento, pre-llena el último kilometraje conocido y su fecha.
- Deja en amarillo los campos pendientes para que OLAST los complete y luego se importen con:
      pnpm --filter @cmms/api fleet:import <plantilla.xlsx>

La plantilla contiene placas y nombres de conductores: NO la suba al repositorio (es público).
"""
import datetime as dt
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

BRAND = "0B5E85"
DARK = "054E74"
SKY = "D9F0FA"
PENDING = "FFF2B3"
GRAY = "EEF1F4"

SITES = {"BOGOTA": "BOG", "CALI": "CAL", "NEIVA": "NEI", "PEREIRA": "PER", "TUNJA": "TUN",
         "VILLAVICENCIO": "VIL", "PITALITO": "PIT"}
ESTADOS = ["Operativo", "Operativo con restricción", "Reserva", "Fuera de servicio - mantenimiento",
           "Fuera de servicio - siniestro", "Vendido", "Siniestro pérdida total", "Dado de baja"]
PROPIEDAD = ["Propio", "Leasing", "Renting", "Tercero"]
TIPOS = ["CAR", "CPE", "LIV", "MCA", "MOT", "BUS", "TRC", "REM", "MAQ"]
DOCS = [("SOAT", "SOAT"), ("RTM", "Revisión técnico-mecánica"), ("POL", "Póliza todo riesgo / RC"),
        ("SAN", "Concepto sanitario (transporte de medicamentos)")]

# (encabezado, ancho, pendiente_si_vacío, nota)
COLUMNS = [
    ("Placa", 10, False, "Sin espacios ni guiones"),
    ("Incluir (SI/NO)", 9, False, "NO = no se importa (p. ej. vehículos de terceros que OLAST no mantiene)"),
    ("Sede", 15, False, None),
    ("Estado", 22, False, None),
    ("Motivo del estado", 26, False, "Obligatorio si está vendido, de baja o fuera de servicio"),
    ("Marca", 12, False, None),
    ("Línea / tipo", 38, False, None),
    ("Tipo vehículo (código)", 10, False, "CAR carga liviana/mediana · CPE carga pesada >10 t · MCA motocarro · MOT motocicleta · LIV liviano"),
    ("Año modelo", 8, True, None),
    ("Servicio", 12, False, "PUBLICO / PARTICULAR"),
    ("Matriculado en", 14, False, None),
    ("Propiedad", 10, False, "Propio · Leasing (licencia a nombre del banco) · Renting · Tercero"),
    ("Titular licencia de tránsito", 18, False, None),
    ("Capacidad de carga (kg)", 10, True, None),
    ("Conductor asignado", 20, True, "Tomado del listado de traspaso; confirmar"),
    ("VIN / chasis", 20, True, None),
    ("No. motor", 16, True, None),
    ("Color", 10, True, None),
    ("Kilometraje actual", 12, True, "Si viene pre-llenado es el último km del historial de mantenimiento: actualícelo"),
    ("Fecha de la lectura (AAAA-MM-DD)", 14, True, None),
    ("Fecha inicio de operación", 13, True, None),
    ("Centro de costo", 12, True, None),
    ("Crit. impacto operacional (1-3)", 11, True, "1 hay reemplazo inmediato · 2 reemplazo con demora · 3 sin reemplazo, detiene servicio"),
    ("Crit. seguridad (1-3)", 11, True, "1 riesgo bajo · 2 carga general · 3 personas o mercancía peligrosa"),
    ("Crit. costo reparación (1-3)", 11, True, "1 bajo · 2 medio · 3 alto"),
    ("Crit. uso (1-3)", 11, True, "1 < 3.000 km/mes · 2 3.000–8.000 · 3 > 8.000 o 24/7"),
    ("Llanta delantera (medida)", 22, False, None),
    ("Cant. delanteras", 8, False, None),
    ("Llanta trasera (medida)", 22, False, None),
    ("Cant. traseras", 8, False, None),
    ("Marca llantas", 12, False, None),
    ("Índice de carga", 8, False, None),
    ("Observaciones", 40, False, None),
]


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def plate(v):
    return re.sub(r"[^A-Z0-9]", "", str(v).upper()) if v else None


def kg(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    m = re.match(r"\s*([\d.,]+)\s*(KG|TN|T)?", str(v).upper())
    if not m:
        return None
    n = float(m.group(1).replace(",", "."))
    return int(n * 1000) if m.group(2) in ("TN", "T") else int(n)


def vtype(make, model):
    m = (model or "").upper()
    if (make or "").upper() == "BAJAJ":
        return "MCA"  # motocarro de carga (placa 123ABC)
    if m.startswith("FVZ"):
        return "CPE"
    return "CAR"


def rows_of(ws):
    return [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]


def history_last_km(path):
    """Último km y fecha por placa del historial de mantenimiento (hojas por vehículo)."""
    fix = {"AFB591": "591AFB", "AFB592": "592AFB", "AFB593": "593AFB", "539AFB": "593AFB"}
    out = {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for ws in wb.worksheets:
        rows = rows_of(ws)
        if not rows or "Placa" not in [str(c).strip() if c else "" for c in rows[0]]:
            continue
        head = [str(c).strip() if c else "" for c in rows[0]]
        for r in rows[1:]:
            d = dict(zip(head, r))
            p = plate(d.get("Placa"))
            p = fix.get(p, p)
            km, fecha = d.get("Kilometraje"), d.get("Fecha")
            if not p or not isinstance(km, (int, float)) or not isinstance(fecha, dt.datetime):
                continue
            if fecha > dt.datetime.now():  # fechas futuras = error de digitación en el historial
                continue
            if p not in out or km > out[p][0]:
                out[p] = (int(km), fecha.date())
    return out


def main(src, dst, history=None):
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    last_km = history_last_km(history) if history else {}

    # Conductores y datos de la hoja de traspaso
    transfer = {}
    for r in rows_of(wb["vehiculos"])[3:]:
        p = plate(r[1])
        if p:
            transfer[p] = {"site": clean(r[2]), "driver": clean(r[3]), "holder": clean(r[4]), "city": clean(r[6]),
                           "service": clean(r[7]), "make": clean(r[8]), "model": clean(r[9]), "year": clean(r[10])}

    # Llantas (cantidades) de la hoja de reencauche
    qty = {}
    for r in rows_of(wb["Reencauche"])[2:]:
        p = plate(r[0])
        if p:
            qty[p] = (r[10], r[12])

    vehicles = []
    for r in rows_of(wb["Vehiculos propios"])[2:]:
        _, ubic, p, holder, city, service, make, model, year, cap, tf, tr, li, tbrand = r[:14]
        p = plate(p)
        if not p:
            continue
        sold = str(ubic).upper().startswith("Z_VENDIDO")
        t = transfer.get(p, {})
        site_name = (t.get("site") if sold else ubic) or ""
        holder = clean(holder)
        if sold:
            holder = t.get("holder") or None
        ownership = "Leasing" if holder and holder.upper() in ("BANCOLOMBIA", "BANCO DE BOGOTA") else "Propio"
        vehicles.append({
            "Placa": p, "Incluir (SI/NO)": "SI", "Sede": SITES.get(str(site_name).upper().strip(), site_name),
            "Estado": "Vendido" if sold else "Operativo", "Motivo del estado": "Vendido (inventario 2025)" if sold else None,
            "Marca": clean(make), "Línea / tipo": clean(model), "Tipo vehículo (código)": vtype(make, model),
            "Año modelo": year, "Servicio": clean(service), "Matriculado en": clean(city), "Propiedad": ownership,
            "Titular licencia de tránsito": holder, "Capacidad de carga (kg)": kg(cap),
            "Conductor asignado": t.get("driver"),
            "Llanta delantera (medida)": clean(tf), "Cant. delanteras": qty.get(p, (None, None))[0],
            "Llanta trasera (medida)": clean(tr), "Cant. traseras": qty.get(p, (None, None))[1],
            "Marca llantas": None if clean(tbrand) in (None, "N/A") else clean(tbrand), "Índice de carga": li,
        })

    known = {v["Placa"] for v in vehicles}
    # Vehículos de la hoja de traspaso que no están en el inventario (p. ej. siniestros)
    for p, t in transfer.items():
        if p in known:
            continue
        vehicles.append({
            "Placa": p, "Incluir (SI/NO)": "SI", "Sede": SITES.get((t["site"] or "").upper(), t["site"]),
            "Estado": "Siniestro pérdida total" if p == "WDS494" else "Dado de baja",
            "Motivo del estado": "Siniestro pérdida total (cronograma de llantas)" if p == "WDS494" else "No figura en el inventario 2025",
            "Marca": t["make"], "Línea / tipo": t["model"], "Tipo vehículo (código)": vtype(t["make"], t["model"]),
            "Año modelo": t["year"], "Servicio": t["service"], "Matriculado en": t["city"], "Propiedad": "Leasing",
            "Titular licencia de tránsito": t["holder"], "Conductor asignado": t["driver"],
        })

    for r in rows_of(wb["VEHICULO TERCEROS"])[2:]:
        p = plate(r[0])
        if not p:
            continue
        vehicles.append({
            "Placa": p, "Incluir (SI/NO)": "NO", "Sede": SITES.get(str(r[1]).upper(), r[1]), "Estado": "Operativo",
            "Marca": clean(r[3]), "Línea / tipo": clean(r[4]), "Tipo vehículo (código)": vtype(r[3], r[4]),
            "Año modelo": r[5], "Servicio": clean(r[2]), "Propiedad": "Tercero", "Capacidad de carga (kg)": kg(r[6]),
            "Observaciones": "Vehículo de tercero: cambie a SI solo si OLAST gestiona su mantenimiento",
        })

    for v in vehicles:
        if v["Placa"] in last_km and v.get("Estado") == "Operativo":
            km, fecha = last_km[v["Placa"]]
            v["Kilometraje actual"], v["Fecha de la lectura (AAAA-MM-DD)"] = km, fecha
            v["_km_from_history"] = True

    order = {"Operativo": 0}
    vehicles.sort(key=lambda v: (order.get(v.get("Estado"), 1), v.get("Incluir (SI/NO)") != "SI", str(v.get("Sede")), v["Placa"]))
    write(dst, vehicles)
    active = sum(1 for v in vehicles if v["Estado"] == "Operativo" and v["Incluir (SI/NO)"] == "SI")
    print(f"{len(vehicles)} vehículos en la plantilla ({active} operativos propios/leasing) -> {dst}")


def write(dst, vehicles):
    out = openpyxl.Workbook()
    thin = Side(style="thin", color="C9D3DC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    head_font = Font(bold=True, color="FFFFFF", name="Calibri")
    head_fill = PatternFill("solid", fgColor=BRAND)
    pend_fill = PatternFill("solid", fgColor=PENDING)
    hist_fill = PatternFill("solid", fgColor=SKY)

    # Instrucciones
    ins = out.active
    ins.title = "Instrucciones"
    lines = [
        ("Plantilla de inventario de flota · CMMS OLAST", True),
        ("", False),
        ("1. Hoja «Vehiculos»: una fila por vehículo. Las celdas en AMARILLO están pendientes: complételas cuando tenga el dato.", False),
        ("2. Las celdas en AZUL CLARO vienen del historial de mantenimiento (último km conocido): actualícelas con el odómetro de hoy.", False),
        ("3. Hoja «Documentos»: fecha de vencimiento de SOAT, técnico-mecánica, póliza y concepto sanitario por vehículo.", False),
        ("4. Criticidad: califique los 4 criterios de 1 a 3 (ver notas en los encabezados). El sistema calcula A/B/C.", False),
        ("5. Puede importar la plantilla varias veces: los datos se actualizan por placa y las celdas vacías NO borran lo ya cargado.", False),
        ("6. «Incluir» = NO deja la fila fuera de la importación (vehículos de terceros).", False),
        ("7. No agregue comentarios/notas de celda: use la columna «Observaciones».", False),
        ("", False),
        ("Fuente: LLANTAS_VEHICULOS_DISCOLMETS_2025.xlsx (hoja «Vehiculos propios») + historial de mantenimiento.", False),
        ("Este archivo contiene placas y nombres: es información interna de OLAST, no lo publique.", False),
    ]
    for i, (t, b) in enumerate(lines, 1):
        c = ins.cell(row=i, column=1, value=t)
        c.font = Font(bold=b, size=14 if b else 11, color=DARK if b else "232323")
    ins.column_dimensions["A"].width = 120
    # Guía de columnas (en vez de comentarios de celda, que el importador no puede leer)
    start = len(lines) + 2
    ins.cell(row=start, column=1, value="Guía de columnas (hoja «Vehiculos»)").font = Font(bold=True, size=12, color=DARK)
    row = start + 1
    for h, _, pending, note in COLUMNS:
        if note or pending:
            txt = f"• {h}: {note or ''}{' (pendiente si está vacío)' if pending else ''}"
            ins.cell(row=row, column=1, value=txt)
            row += 1

    ws = out.create_sheet("Vehiculos")
    for j, (h, w, _, note) in enumerate(COLUMNS, 1):
        c = ws.cell(row=1, column=j, value=h)
        c.font, c.fill, c.border = head_font, head_fill, border
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.row_dimensions[1].height = 48
    for i, v in enumerate(vehicles, 2):
        for j, (h, _, pending, _) in enumerate(COLUMNS, 1):
            val = v.get(h)
            c = ws.cell(row=i, column=j, value=val)
            c.border = border
            if h.startswith("Fecha") and isinstance(val, (dt.date, dt.datetime)):
                c.number_format = "yyyy-mm-dd"
            relevant = v.get("Incluir (SI/NO)") == "SI" and v.get("Estado") == "Operativo"
            if h in ("Kilometraje actual", "Fecha de la lectura (AAAA-MM-DD)") and v.get("_km_from_history"):
                c.fill = hist_fill
            elif pending and val in (None, "") and relevant:
                if h == "Capacidad de carga (kg)" and v.get("Tipo vehículo (código)") == "MOT":
                    continue
                c.fill = pend_fill
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{len(vehicles) + 1}"

    def dv(col_name, options):
        col = get_column_letter([c[0] for c in COLUMNS].index(col_name) + 1)
        d = DataValidation(type="list", formula1='"' + ",".join(options) + '"', allow_blank=True)
        ws.add_data_validation(d)
        d.add(f"{col}2:{col}500")

    dv("Incluir (SI/NO)", ["SI", "NO"])
    dv("Sede", list(SITES.values()))
    dv("Estado", ESTADOS)
    dv("Propiedad", PROPIEDAD)
    dv("Tipo vehículo (código)", TIPOS)
    dv("Servicio", ["PUBLICO", "PARTICULAR"])
    for crit in [c[0] for c in COLUMNS if c[0].startswith("Crit.")]:
        dv(crit, ["1", "2", "3"])

    # Documentos
    ds = out.create_sheet("Documentos")
    dheads = [("Placa", 10), ("Documento (código)", 12), ("Documento", 34), ("Número", 18), ("Entidad / aseguradora", 22),
              ("Fecha expedición", 14), ("Fecha vencimiento", 14)]
    for j, (h, w) in enumerate(dheads, 1):
        c = ds.cell(row=1, column=j, value=h)
        c.font, c.fill, c.border = head_font, head_fill, border
        ds.column_dimensions[get_column_letter(j)].width = w
    r = 2
    for v in vehicles:
        if v.get("Incluir (SI/NO)") != "SI" or v.get("Estado") != "Operativo":
            continue
        for code, name in DOCS:
            for j, val in enumerate([v["Placa"], code, name, None, None, None, None], 1):
                c = ds.cell(row=r, column=j, value=val)
                c.border = border
                if j >= 4:
                    c.fill = pend_fill if j == 7 else PatternFill("solid", fgColor=GRAY)
                    if j >= 6:
                        c.number_format = "yyyy-mm-dd"
            r += 1
    ds.freeze_panes = "A2"
    out.save(dst)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(*sys.argv[1:])
