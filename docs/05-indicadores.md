# 05 · Indicadores de desempeño (KPI)

Definiciones alineadas con las métricas SMRP y EN 15341, adaptadas a flota vehicular. **Las metas son de referencia internacional** y se ajustarán con la línea base de OLAST tras 3 meses de datos.

## 1. Tablero principal (MVP)

| # | Indicador | Fórmula | Meta de referencia | Frecuencia |
|---|---|---|---|---|
| 1 | **Disponibilidad de flota** | Σ horas disponibles / Σ horas calendario de vehículos activos × 100. Horas no disponibles = estados FUERA DE SERVICIO (MANTENIMIENTO + ESPERA REPUESTO). Siniestro y administrativo se muestran aparte. | ≥ 95 % livianos · ≥ 90 % pesados | Diaria / mensual |
| 2 | **Cumplimiento de PM** | OT PM ejecutadas dentro de la ventana de tolerancia / OT PM vencidas en el periodo × 100 | ≥ 90 % | Semanal / mensual |
| 3 | **% Mantenimiento planificado** | Horas-hombre (o costo) en OT planificadas / total (excluye `SIN`) × 100 | ≥ 80 % | Mensual |
| 4 | **MTBF** (tiempo medio entre fallas) | km (u horas) recorridos por el grupo en el periodo / nº de fallas (OT `CE`+`AUX`+`CP` con causa ≠ `ACC`) | Tendencia creciente; comparar por modelo | Mensual |
| 5 | **MTTR** (tiempo medio de reparación) | Σ (fin – inicio de ejecución) de OT correctivas / nº de OT correctivas | Tendencia decreciente; P1 ≤ 24 h | Mensual |
| 6 | **Tiempo medio fuera de servicio por evento** | Σ horas FUERA DE SERVICIO / nº de eventos. Desglosado en: espera de taller, ejecución, espera de repuesto, espera de aprobación | Tendencia decreciente | Mensual |
| 7 | **Costo de mantenimiento por km** | (mano de obra + repuestos + servicios externos) / km recorridos | Línea base OLAST; comparar por modelo y antigüedad | Mensual |
| 8 | **Backlog** | Σ horas estimadas de OT abiertas aprobadas / capacidad semanal de horas-hombre | 2 – 4 semanas | Semanal |
| 9 | **Cumplimiento del programa semanal** | OT programadas y ejecutadas en la semana / OT programadas × 100 | ≥ 85 % | Semanal |
| 10 | **Retrabajo** | OT marcadas `is_rework` / OT correctivas cerradas × 100 | ≤ 3 % | Mensual |
| 11 | **Cumplimiento de inspección diaria** | Vehículos con inspección pre-operacional / vehículos que operaron × 100 | ≥ 98 % | Diaria |
| 12 | **Cumplimiento de SLA por prioridad** | OT resueltas dentro del tiempo objetivo de su prioridad / total × 100 | P1 ≥ 95 % · P2 ≥ 90 % | Mensual |
| 13 | **Calidad del dato** | OT correctivas cerradas con codificación completa (sistema nivel 2+, modo, causa, acción) / total × 100 | ≥ 95 % | Mensual |
| 14 | **Documentos vigentes** | Vehículos activos con todos los documentos bloqueantes vigentes / vehículos activos × 100 | 100 % | Diaria |

## 2. Análisis (no son KPI con meta, son vistas de decisión)

- **Pareto de fallas** por sistema y componente: por número de eventos, por costo y por horas fuera de servicio.
- **Top 10 "malos actores"**: vehículos con mayor costo/km, mayor nº de fallas o menor disponibilidad.
- **Costo por tipo de mantenimiento** (preventivo vs. correctivo vs. siniestro) y por sede.
- **Costo acumulado de ciclo de vida** por vehículo vs. antigüedad/km → apoyo a decisión de reemplazo.
- **Previsión de PM** de las próximas 4 semanas (carga de taller esperada).
- **Causas de falla**: distribución por causa (si `FMA` u `OPE` son altas, el problema es de gestión/capacitación, no técnico).

## 3. Indicadores de fase 2

| Indicador | Fórmula | Meta |
|---|---|---|
| Rendimiento de combustible | km / litros (o galones), por vehículo vs. promedio del modelo | Desviación ≤ 15 % |
| Costo por km de neumático | costo del neumático (+ reencauches) / km recorridos | Línea base |
| Exactitud de inventario | ítems con conteo = sistema / ítems contados × 100 | ≥ 95 % |
| Disponibilidad de repuestos críticos | OT no detenidas por falta de repuesto crítico / OT que lo requirieron × 100 | ≥ 95 % |
| Costo de mantenimiento / valor de reposición (RAV) | costo anual de mantenimiento / valor de reposición de la flota × 100 | Línea base |

## 4. Reglas de cálculo comunes

- Los indicadores se pueden filtrar por: periodo, sede, tipo de vehículo, modelo, criticidad y vehículo.
- Los vehículos **dados de baja** se excluyen a partir de su fecha de baja; los que ingresaron en el periodo se cuentan proporcionalmente.
- Las fallas por accidente (causa `ACC`) y OT `SIN` **se excluyen** del MTBF y del costo de mantenimiento "técnico", y se reportan en un indicador de siniestralidad aparte.
- Todo KPI muestra su **valor, meta, tendencia de 6 meses** y permite **profundizar** (drill-down) hasta las OT que lo componen.

## 5. Implementación en el CMMS (Sprint 5)

Pantallas **Indicadores** (los 14 KPI con valor, meta, semáforo con icono y texto, tendencia de 6 meses y explicación del cálculo) y **Confiabilidad** (Pareto con drill-down a las OT y vehículos con más problemas). Filtros: periodo, sede (sede actual del vehículo) y tipo de vehículo. Todo se exporta a Excel (indicadores, costo por mes, Pareto, malos actores y OT del periodo).

**Historial migrado del Excel.** Trae fecha, km, costo y componente, pero no tiempos de reparación, prioridad, programación ni codificación completa. Por eso:

| Incluye el historial | Solo OT registradas en el CMMS |
|---|---|
| #2 Cumplimiento PM, #4 MTBF, #7 Costo/km, #10 Retrabajo, Pareto, malos actores, costo por mes | #3 % planificado, #5 MTTR, #9 Programa, #12 SLA, #13 Calidad del dato |

Precisiones de cálculo:

- **#1 Disponibilidad y #6 días por parada — política OLAST 2026** (decisión de gerencia, nov-2026): se calculan sobre **días hábiles, de lunes a sábado, sin domingos ni festivos de Colombia**, y **sin descontar las paradas preventivas**, igual que el cuadro de disponibilidad que se lleva este año. La tarjeta muestra como referencia la cifra con preventivos. La política es configurable por organización (`settings.availability.includePreventive`, `PUT /kpi/settings`) para ajustarla a partir de 2027 a la práctica internacional (disponibilidad operacional: el preventivo en día hábil sí resta; programarlo fuera de la operación es lo que mejora el indicador).
- #1 y #6 usan el historial de estados del vehículo: el registrado en el CMMS y el reconstruido desde el cuadro (feb–oct 2026). #6 incluye la espera de taller y repuestos: es el tiempo que la operación pierde el vehículo, no solo el de la reparación (MTTR #5 se medirá con inicio y fin de ejecución de las OT).
- **#2 Cumplimiento PM** compara cada PM con el anterior del mismo vehículo: a tiempo si el recorrido entre ambos no supera el intervalo base del plan + 10 %. Así se mide la ejecución real, también en el historial.
- **Km del periodo**: interpolación lineal entre lecturas de odómetro y km registrados en las OT, sin extrapolar fuera del rango con datos (cuando Ituran esté activo, el odómetro diario hará este cálculo exacto).
- **#10 Retrabajo** en el historial se calcula con la misma regla del cierre de OT (mismo componente en 30 días / 3 000 km); las filas del mismo día se toman como un mismo trabajo.
- **#8 Backlog** necesita técnicos propios registrados (capacidad = 40 h/semana cada uno); si todo el trabajo es externo, se muestra el número de OT abiertas.
- **#11 Inspección diaria** se mide en días-vehículo operativos, desde la primera inspección registrada en la app. Meta 98 %.
- **#14 Documentos** es una foto a la fecha final del periodo.

### Cuadro de disponibilidad (Excel mensual de OLAST)

Formato: una hoja por mes con `SUCURSAL · PLACA · MANTENIMIENTO (PREVENTIVO/CORRECTIVO)` y un día por columna; `FDS` = fuera de servicio. Al importarlo:

- Los domingos y festivos de Colombia quedan en blanco en el cuadro aunque el vehículo siga en el taller: el sistema une esos tramos en **una sola parada** (también entre meses).
- Cada parada se liga a la OT del historial del mismo vehículo y tipo (±3 días).
- Se reconstruye el historial de estados (operativo / fuera de servicio por mantenimiento) solo en los meses del cuadro y antes del primer estado registrado en el CMMS. Repetible: reemplaza lo cargado antes desde el cuadro.
- Hallazgos sobre el archivo (oct-2026): los días programados están fijos en 24 en varios meses, cuando los días hábiles reales fueron 23 a 26 (el importador lo advierte y el CMMS usa los reales); su disponibilidad **solo resta los días correctivos** (la fila preventiva se suma con `SUM`, que ignora el texto «FDS»); el resumen mensual promedia **solo las primeras 5 placas** (`AVERAGE(AJ7:AJ16)`), no las 20; WNZ126 en abril usa 26 días programados en vez de 23.
