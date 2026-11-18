#!/usr/bin/env python3
"""Clasifica el historial de intervenciones (Excel "Hoja de vida de mantenimiento")
con el catálogo de componentes OLAST.

Uso:
    python3 tools/clasificar_historial.py <archivo.xlsx> <salida.csv>

- Lee cada hoja por vehículo (columnas: Fecha, Sucursal, Placa, Kilometraje,
  Tipo Mantenimiento, Descripcion Intervencion, Valor_Total).
- Asigna códigos de componente (data/catalogos/componentes.csv), acciones,
  modos y causas (data/catalogos/patrones_codificacion.json) por palabras clave.
- La salida sirve como carga inicial (migración) de OT históricas y para
  revisar/ajustar los patrones. La clasificación automática es una propuesta:
  debe validarla el jefe de mantenimiento.

Nota: el historial contiene placas y costos; NO lo suba a este repositorio
(es público). Guarde el CSV de salida fuera del repo.
"""
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
CAT = ROOT / "data" / "catalogos"
SKIP_SHEETS = {"2024", "RutinaMantenimiento", "Hoja2"}

TYPOS = [("aciete", "aceite"), ("aceitte", "aceite"), ("aceito", "aceite"), ("filtors", "filtros"),
         ("filltros", "filtros"), ("fltros", "filtros"), ("isuzo", "isuzu"), ("cambiod e", "cambio de"),
         ("cambiod", "cambio"), ("maguera", "manguera"), ("rodmaientos", "rodamientos"),
         ("delnateros", "delanteros"), ("delnteros", "delanteros"), ("delanterso", "delanteros"),
         ("delnateras", "delanteras"), ("fuegon", "furgon"), ("furgo ", "furgon "), ("bagon", "vagon")]
REWRITES = [(r"corre[ao]s? (del? )?alternador", "correa accesorios"), (r"vacio alternador", "vacio"),
            (r"mangueras? (de )?(agua )?radiador", "manguera refrigeracion"),
            (r"aceite (de )?caja (de )?(velocidades|cambios|transmision)", "aceite de caja"),
            (r"rodillos y bujes", "rodillos"), (r"escobillas y rodamientos", "escobillas"),
            (r"sellos? (de )?aceite", "sello rueda"), (r"motor del arranque", "arranque"),
            (r"guayas de control acelerador", "guaya acelerador"), (r"deposito radiador", "deposito")]


def norm(text: str) -> str:
    t = unicodedata.normalize("NFD", text.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn" or c == "̃")
    t = unicodedata.normalize("NFC", t)
    for a, b in TYPOS:
        t = t.replace(a, b)
    for a, b in REWRITES:
        t = re.sub(a, b, t)
    return t


def load_catalog():
    comps = []
    with open(CAT / "componentes.csv", newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["nivel"] == "3" and row["patron_clasificacion"]:
                comps.append((row["codigo"], re.compile(row["patron_clasificacion"])))
    pats = json.loads((CAT / "patrones_codificacion.json").read_text(encoding="utf-8"))
    compile_list = lambda items: [(code, re.compile(p)) for code, p in items]
    return comps, compile_list(pats["acciones"]), compile_list(pats["modos"]), compile_list(pats["causas"])


def main(xlsx: str, out: str) -> None:
    comps, acts, modes, causes = load_catalog()
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    n = unclassified = 0
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["hoja", "fecha", "sucursal", "placa", "km", "tipo", "descripcion", "valor",
                    "componentes", "sistemas", "acciones", "modos", "causas"])
        for ws in wb.worksheets:
            if ws.title in SKIP_SHEETS:
                continue
            rows = [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]
            if not rows:
                continue
            head = [str(c).strip() if c else "" for c in rows[0]]
            for r in rows[1:]:
                d = dict(zip(head, r))
                desc = d.get("Descripcion Intervencion")
                if not desc:
                    continue
                t = norm(str(desc))
                found = [code for code, rx in comps if rx.search(t)]
                n += 1
                unclassified += not found
                w.writerow([ws.title, d.get("Fecha"), d.get("Sucursal"), d.get("Placa"), d.get("Kilometraje"),
                            d.get("Tipo Mantenimiento"), str(desc).replace("\n", " "), d.get("Valor_Total"),
                            " ".join(found), " ".join(sorted({c[:3] for c in found})),
                            " ".join(c for c, rx in acts if rx.search(t)),
                            " ".join(c for c, rx in modes if rx.search(t)),
                            " ".join(c for c, rx in causes if rx.search(t))])
    print(f"{n} intervenciones, {unclassified} sin clasificar -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
