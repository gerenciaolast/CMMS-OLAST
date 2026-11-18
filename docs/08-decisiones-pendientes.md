# 08 · Decisiones pendientes y lista de aprobación

Para iniciar el desarrollo necesitamos que OLAST valide los siguientes puntos. Donde hay un valor propuesto, si no hay objeción se toma como aprobado.

## 1. Información de la flota (necesaria para dimensionar)

| # | Pregunta | Propuesta / supuesto |
|---|---|---|
| 1 | ¿Cuántos vehículos tiene la flota y cuántos se esperan en 3 años? | Supuesto: 50–500 vehículos |
| 2 | ¿Qué tipos de vehículo? (livianos, carga, tractocamiones, buses, motos, maquinaria) | Los 7 tipos del doc 03 |
| 3 | ¿Cuántas sedes/bases operan? | Multi-sede desde el MVP |
| 4 | ¿Taller propio, talleres externos o mixto? ¿Cuántos técnicos? | Mixto |
| 5 | ¿País o países de operación? (define documentos legales obligatorios, moneda, unidades) | Un país, km y litros, moneda local |
| 6 | ¿Cuántos usuarios por rol? (especialmente conductores con celular) | Conductores con smartphone Android |
| 7 | ¿Los vehículos tienen GPS/telemática? ¿Qué proveedor? | Integración en fase 3 |
| 8 | ¿Se usan tarjetas de combustible? ¿Qué proveedor/formato de reporte? | Importación CSV en fase 2 |

## 2. Decisiones del modelo (validar o ajustar)

| # | Decisión | Valor propuesto | Documento |
|---|---|---|---|
| 9 | Criterios y puntajes de criticidad A/B/C | 4 criterios, 1–3 puntos | 03 §2 |
| 10 | Matriz de prioridad y tiempos objetivo P1–P4 | P1 ≤ 24 h … P4 ≤ 30 días | 03 §3 |
| 11 | Generación automática de OT PM | Al 90 % del intervalo | 02 P5 |
| 12 | Tolerancia de cumplimiento PM | ±10 % | 02 P5 |
| 13 | Ventana de retrabajo | 30 días o 3 000 km | 02 P7 |
| 14 | Disparadores de RCA y umbral de alto costo | 5 disparadores del doc 01 | 01 §8 |
| 15 | Documentos legales bloqueantes | Seguro obligatorio, revisión técnica, permiso de operación | 02 P9 |
| 16 | Catálogo de codificación de fallas | Catálogo propio compatible con VMRS | 03 §4 |
| 17 | Metas de KPI iniciales | Referencias internacionales del doc 05, ajustables tras 3 meses | 05 |
| 18 | Alcance del MVP | Módulos de la columna MVP del doc 06 | 06 §1 |

## 3. Decisiones técnicas

| # | Decisión | Propuesta |
|---|---|---|
| 19 | ¿Existe estándar tecnológico corporativo o ERP con el que integrar? | Stack TypeScript del doc 07; integración ERP en fase 3 |
| 20 | ¿Dónde se alojará? (nube corporativa, proveedor preferido, local) | Nube con contenedores + PostgreSQL administrado |
| 21 | ¿Inicio de sesión con cuentas corporativas (Microsoft/Google)? | Usuario/contraseña en MVP, SSO en fase 2 |
| 22 | ¿Quién es el dueño de producto por parte de OLAST? | Jefe de mantenimiento de flota |
| 23 | ¿Sede piloto? | Por definir |

## 4. Aprobación

| Rol | Nombre | Fecha | Aprobado |
|---|---|---|---|
| Gerencia | | | ☐ |
| Jefe de mantenimiento de flota | | | ☐ |
| Operaciones | | | ☐ |
| TI | | | ☐ |
