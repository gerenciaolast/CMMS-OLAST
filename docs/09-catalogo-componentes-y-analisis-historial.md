# 09 · Catálogo de componentes OLAST y análisis del historial

> Versión 0.2 · Construido a partir del historial real de intervenciones de OLAST (409 registros, 22 vehículos, 2024–2026) y la estructura del estándar VMRS.
> Este documento es **público**: no incluye placas ni montos. El informe detallado por vehículo se entrega a gerencia por separado.

## 1. Conclusión

**Sí, se puede construir un catálogo propio a partir del historial, y ya está hecho.** El catálogo OLAST v0.2 tiene:

| Nivel | Cantidad | Ejemplo |
|---|---|---|
| 1 · Sistema | 22 | `FRN` Frenos |
| 2 · Conjunto | 74 | `FRN.FRI` Fricción |
| 3 · Componente | 106 | `FRN.FRI.BAN` Bandas / zapatas |

- **Cobertura:** las 409 intervenciones históricas quedaron clasificadas en al menos un componente (100 %). Los 106 componentes del catálogo aparecen por lo menos una vez en el historial, así que no hay códigos "de relleno".
- **Compatibilidad VMRS:** se usa la jerarquía Sistema → Conjunto → Componente de VMRS, y cada sistema trae una referencia al código de sistema VMRS (Code Key 31) donde la equivalencia es clara. Los códigos VMRS de los niveles 2 y 3 se pueden agregar si OLAST licencia el estándar (ATA/TMC), sin cambiar la estructura.
- **Vocabulario OLAST:** el catálogo usa los términos que se usan en los talleres de OLAST (bandas, splinder / pines y bocines, freno de ahogo, guaya, cocullos, pacha, valvulina…), así que los técnicos lo reconocen.

Archivos:
- [`data/catalogos/sistemas.csv`](../data/catalogos/sistemas.csv): los 22 sistemas con su referencia VMRS.
- [`data/catalogos/componentes.csv`](../data/catalogos/componentes.csv): conjuntos y componentes, frecuencia histórica y patrón de clasificación automática.
- [`data/catalogos/patrones_codificacion.json`](../data/catalogos/patrones_codificacion.json): patrones de texto para detectar acción, modo y causa.
- [`tools/clasificar_historial.py`](../tools/clasificar_historial.py): script que clasifica cualquier archivo con el mismo formato. Sirve para la migración de datos al CMMS.

Reemplaza la lista preliminar de 18 sistemas del [doc 03 §4.1](03-catalogos-y-codificacion.md#41-jerarquía-de-ubicación-técnica-sistema--conjunto--componente).

## 2. Sistemas del catálogo

| Código | Sistema | Ref. VMRS (sistema)* |
|---|---|---|
| `MOT` | Motor | 045 |
| `ADM` | Admisión y sobrealimentación (filtro de aire, turbo, múltiple) | 041 |
| `ESC` | Escape, emisiones y freno de motor (EGR, DPF, freno de ahogo) | 043 |
| `COM` | Combustible (tanque, inyección, filtros) | 044 |
| `REF` | Refrigeración | 042 |
| `ELE` | Eléctrico: arranque, carga y cableado | 031 / 032 |
| `ELN` | Electrónica y diagnóstico (ECU, sensores, escáner) | — |
| `ILU` | Iluminación y señalización (incluye pito, sirena) | 034 |
| `EMB` | Embrague | 023 |
| `TRA` | Caja de velocidades | 026 |
| `TRE` | Tren motriz (cardán, diferencial, semiejes) | — |
| `FRN` | Frenos | 013 |
| `DIR` | Dirección (incluye pivotes del eje delantero) | 015 |
| `SUS` | Suspensión | 016 |
| `RUE` | Ruedas, cubos y rodamientos | 018 |
| `NEU` | Neumáticos, alineación y balanceo | 017 |
| `CAR` | Carrocería y cabina | 002 |
| `FUR` | Furgón / carrocería de carga | — |
| `CHA` | Chasis | 014 |
| `HVA` | Climatización | 001 |
| `SEG` | Equipos de seguridad | — |
| `GEN` | General / servicios (engrase, lavado, revisiones, técnico-mecánica, grúa) | — |

\* La referencia VMRS es orientativa y **debe validarse contra la tabla oficial** al licenciar el estándar. Donde dice "—" no hay una equivalencia clara a nivel de sistema.

## 3. Lo que muestra el historial (resumen agregado)

| Indicador | Valor | Lectura |
|---|---|---|
| Intervenciones | 409 (209 preventivas, 200 correctivas) | Casi 1 a 1: lo correctivo pesa demasiado |
| **Costo correctivo / costo total** | **72 %** | La meta internacional es ≤ 20–30 %. El preventivo cuesta poco y lo correctivo cuesta mucho |
| Intervalo real entre cambios de aceite (mediana) | **≈ 6 500 km** (p25 5 600 · p75 8 200; máximo observado > 12 000) | La rutina vigente dice 5 000 km: **en la práctica no se cumple** |
| Componentes por intervención (promedio) | 2,8 | Un solo registro mezcla varios trabajos y varios sistemas |
| Correctivas que tocan ≥ 3 sistemas | 49 de 200 (25 %) | Se acumulan fallas hasta que el vehículo entra al taller |

**Pareto del costo correctivo por sistema** (el costo de cada registro se reparte entre los sistemas que menciona):

| # | Sistema | % costo correctivo | Eventos correctivos | % acumulado |
|---|---|---|---|---|
| 1 | Motor | 15,9 % | 32 | 15,9 % |
| 2 | Frenos | 12,9 % | 57 | 28,8 % |
| 3 | Refrigeración | 7,4 % | 32 | 36,2 % |
| 4 | Ruedas, cubos y rodamientos | 6,8 % | 24 | 43,0 % |
| 5 | Suspensión | 5,8 % | 23 | 48,8 % |
| 6 | Admisión / turbo | 5,0 % | 12 | 53,8 % |
| 7 | Caja de velocidades | 4,9 % | 12 | 58,7 % |
| 8 | Dirección | 4,7 % | 18 | 63,4 % |
| 9 | Combustible | 4,6 % | 14 | 68,0 % |
| 10 | Carrocería y cabina | 4,5 % | 17 | 72,5 % |

**Componentes correctivos más frecuentes:** bandas/zapatas de freno (28), refrigerante/fugas (24), bombillos y luces (22), rodamientos de rueda (17), retenedores de rueda (16), correas (13), crucetas de cardán (12), bujes de muelle (12), kit de embrague (11), cilindros de freno (11).

**Fallas repetitivas:** hay vehículos con el **mismo sistema (frenos) intervenido varias veces en menos de 90 días**. Eso cumple el disparador de RCA del [doc 01 §8](01-marco-y-principios.md#8-disparadores-de-análisis-de-causa-raíz-rca).

## 4. Problemas de calidad del dato encontrados (y cómo los resuelve el CMMS)

| Hallazgo en el Excel | Casos | Regla del CMMS que lo evita |
|---|---|---|
| Fechas inválidas o escritas como texto (`12/09/204`, `15-15-25`, `02-19-26`) | 8 | Campo fecha con calendario; no se acepta texto |
| Fechas que no cuadran con el kilometraje (fecha anterior con km mayor, años 2006 o futuros) | 14 | Validación cruzada de fecha y lectura (P2) |
| Kilometraje que retrocede | 3 | Lectura menor a la anterior se rechaza (P2) |
| Placa mal escrita (`539AFB` en vez de `593AFB`; `AFB592` / `592AFB`) | 3 | La placa se elige de la lista de vehículos, no se escribe |
| Sucursal mal escrita (`Villavicneico`) | 17 | Sede elegida de un catálogo |
| Preventivos que incluyen trabajo correctivo (baterías, bandas, sensores, bombillos) | 18 | Un hallazgo durante un preventivo genera aviso/OT correctiva aparte (P7) |
| Correctivos que incluyen el cambio de aceite y filtros | 7 | Las tareas PM se registran en su propia OT, para no inflar el costo correctivo |
| Valor 0 sin explicación (revisiones en garantía) | 3 | Campo "cubierto por garantía / proveedor" |
| Taller / proveedor sin registrar | 390 de 409 | Proveedor obligatorio en OT externa |
| **Causa de la falla registrada** | **7 de 200 correctivos** | **Codificación obligatoria (modo, causa, acción) para cerrar la OT** |
| Costo total sin desglose (mano de obra / repuestos) | 409 | Líneas de mano de obra, repuestos y servicios externos en la OT |

## 5. Implicaciones para el modelo (ajustes propuestos)

1. **Adoptar el catálogo de 22 sistemas / 106 componentes** como dato semilla (reemplaza la lista preliminar del doc 03).
2. **Planes PM por familia de vehículo**, construidos con la frecuencia real y el manual del fabricante. La flota tiene tres familias:
   - Camiones livianos con furgón (diésel, kit filtros Isuzu): servicio cada **5 000–7 000 km según el manual**, con graduación de frenos, engrase y revisión de rodamientos en cada servicio. Son los ítems que más fallan.
   - Vehículos nuevos con revisiones de fabricante cada 10 000 km (garantía): plan del fabricante.
   - Motocicletas: aceite cada 2 000–3 000 km, guaya de embrague y valvulina.
3. **Inspección dirigida a frenos y rodamientos** en el checklist pre-operacional y en el PM, porque son la primera causa por frecuencia (bandas, cilindros, retenedores, rodamientos).
4. **Cumplimiento del PM como KPI prioritario.** Contra el intervalo vigente de 5 000 km, la mitad de los cambios de aceite se hizo con más de 30 % de retraso, y algunos se hicieron después de más del doble del intervalo.
5. **Migración:** el script `tools/clasificar_historial.py` carga el historial como OT históricas codificadas, con una revisión del jefe de mantenimiento antes de importar.
