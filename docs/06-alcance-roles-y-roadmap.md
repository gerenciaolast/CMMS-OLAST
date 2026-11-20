# 06 · Alcance, roles y hoja de ruta

## 1. Mapa de módulos y fases

| Módulo | MVP (Fase 1) | Fase 2 | Fase 3 |
|---|---|---|---|
| **Vehículos** | Ficha, criticidad, estados, historial, traslados entre sedes, documentos y vencimientos, plantilla Excel (descarga/carga) | Componentes rastreables (motor, caja, baterías) | Costo de ciclo de vida, decisión de reemplazo |
| **Lecturas** | Manual, desde inspección y OT, validaciones · **odómetro diario desde GPS Ituran** | Recorridos horarios Ituran, desde combustible, importación masiva | Eventos de telemática (códigos de falla, conducción) |
| **Preventivo** | Planes, rutinas por km/h/tiempo, generación automática de OT, previsión | Campañas/recalls, optimización PM asistida | Mantenimiento predictivo con datos de telemática / DTC |
| **Inspecciones** | Checklist pre-operacional móvil (PWA), bloqueo por crítico | Inspecciones periódicas técnicas con mediciones | Modo offline completo |
| **Avisos y OT** | Ciclo completo, mano de obra, repuestos, servicios externos, codificación de falla, esperas, retrabajo | Presupuestos y aprobación por monto, firma del proveedor | Portal de proveedores externos |
| **Repuestos** | Catálogo, kits PM, consumo en OT | Inventario multi-almacén, compras, reorden | Integración ERP |
| **Combustible** | — | Registro e importación, rendimiento | Integración tarjetas de combustible |
| **Neumáticos** | Registro de cambios de llantas (desgaste, daño en vía, robo, rotación) | Seguimiento por número de serie, costo/km por llanta | Sensores TPMS |
| **Confiabilidad** | KPIs, Pareto, malos actores | RCA (5 porqués) con acciones | Análisis Weibull, RCM asistido |
| **Conductores** | Registro, licencia, varios conductores por vehículo, carga por Excel | Alertas de vencimiento de licencias, puntuación de conducción | Integración telemática de conducción |
| **Notificaciones** | Correo + en aplicación | WhatsApp/SMS | Push móvil |
| **Integraciones** | Exportar a Excel/CSV | API pública documentada | ERP, contabilidad, BI |

## 2. Roles y permisos

| Permiso / Rol | Admin | Jefe Mant. | Planificador | Supervisor taller | Técnico | Conductor | Gerencia (lectura) |
|---|---|---|---|---|---|---|---|
| Configurar catálogos, usuarios, sedes | ✅ | 🔸 catálogos | — | — | — | — | — |
| Crear/editar vehículos | ✅ | ✅ | — | — | — | — | — |
| Crear/editar planes PM | — | ✅ | ✅ | — | — | — | — |
| Registrar lectura | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (sus vehículos) | — |
| Hacer inspección pre-operacional | — | — | — | ✅ | — | ✅ | — |
| Crear aviso | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Aprobar/rechazar aviso, asignar prioridad | — | ✅ | ✅ | ✅ | — | — | — |
| Crear / programar OT | — | ✅ | ✅ | ✅ | — | — | — |
| Ejecutar OT (tiempos, repuestos, tareas, codificación) | — | ✅ | — | ✅ | ✅ (asignadas) | — | — |
| Verificar y cerrar OT | — | ✅ | — | ✅ | — | — | — |
| Cambiar estado de vehículo manualmente | — | ✅ | ✅ | ✅ | — | — | — |
| Ver costos | ✅ | ✅ | ✅ | ✅ | — | — | ✅ |
| Ver KPIs y reportes | ✅ | ✅ | ✅ | ✅ | — | — | ✅ |

Los permisos se modelan como **permisos atómicos** (`work_order.close`, `vehicle.edit`…) agrupados en roles, para poder crear roles nuevos sin cambiar código. Visibilidad por sede: un usuario ve solo su(s) sede(s), salvo roles globales.

## 3. Hoja de ruta (sprints de 2 semanas)

| Fase | Sprint | Entregable | Valor para el negocio |
|---|---|---|---|
| **0 · Fundaciones** | S0 ✅ (1–2 sem) | Repositorio, CI, entornos, autenticación, roles, sedes, catálogos semilla, diseño base de UI | Base técnica lista |
| **1 · MVP** | S1 | Vehículos (ficha, criticidad, estados con historial), tipos y modelos, lecturas con validaciones | Inventario confiable de la flota |
| | S2 ✅ | Avisos + Órdenes de Trabajo (ciclo de estados, mano de obra, repuestos de catálogo, servicios externos, esperas, codificación de falla) | Todo el trabajo queda registrado con su costo · **historial 2024–2026 migrado (409 OT)** |
| | S3 ✅ | Planes PM, rutinas, tareas, cálculo de vencimientos, generación automática de OT, tablero de previsión. **Alarmas PM con lecturas manuales** (inspección diaria del conductor y OT); cuando Ituran quede activo, el odómetro GPS alimenta las mismas alarmas sin cambiar la lógica | El preventivo deja de depender de la memoria |
| | S3+ | **Integración Ituran** (depende de que Ituran habilite credenciales/IP): job horario de odómetro, km diario y horario calculados, alerta de vehículo sin reporte | Alarmas PM automáticas y confiables, sin digitación |
| | S4 ✅ | Inspección pre-operacional móvil (PWA), bloqueo por defecto crítico, documentos y alertas de vencimiento, notificaciones por correo. **Acceso a la app por conductor** (solo ve sus vehículos asignados), defecto repetido se liga al aviso abierto, cumplimiento diario, licencias con alerta | Seguridad vial y cumplimiento legal |
| | S5 ✅ | Tablero de KPIs (14 indicadores con meta, semáforo y tendencia de 6 meses), costo por mes y tipo, Pareto por sistema/conjunto/componente/causa/modo con drill-down a las OT, malos actores, exportación a Excel | Gestión basada en datos |
| | — | **Carga de datos reales, capacitación, piloto en 1 sede (4 semanas)**, luego despliegue a todas las sedes | Adopción |
| **2 · Ampliación** | S6–S10 | Inventario completo y compras, combustible, neumáticos, RCA, campañas, presupuestos de OT | Control de costos |
| **3 · Inteligencia** | S11+ | Telemática/GPS, offline completo, portal de proveedores, integración ERP, predictivo | Mantenimiento predictivo |

## 4. Backlog del MVP (historias de usuario con criterios de aceptación)

### Épica E1 – Vehículos
- **E1-H1** Como *jefe de mantenimiento* quiero registrar un vehículo con su ficha técnica para tener la flota inventariada.
  - Placa y VIN únicos; validación de formato configurable.
  - No pasa a OPERATIVO sin criticidad, lectura inicial y plan PM (o "sin plan" explícito).
- **E1-H2** Como *jefe de mantenimiento* quiero calcular la criticidad A/B/C con los 4 criterios para priorizar.
  - El puntaje y la categoría se calculan automáticamente; se guarda el detalle de criterios.
- **E1-H3** Como *usuario* quiero ver la "hoja de vida" del vehículo (estado, lecturas, OT, costos, documentos, próximos PM) en una sola pantalla.
- **E1-H4** Como *supervisor* quiero cambiar el estado de un vehículo con motivo, y que quede historial.
  - Solo un estado abierto a la vez; el anterior se cierra con fecha-hora.

### Épica E2 – Lecturas
- **E2-H1** Como *conductor/técnico* quiero registrar el odómetro para mantener actualizado el kilometraje.
  - Rechaza lecturas menores a la anterior; marca "a validar" las que superen el uso diario máximo del tipo.
  - Recalcula los vencimientos de PM del vehículo.
- **E2-H2** Como *jefe de mantenimiento* quiero registrar un cambio de odómetro sin perder el kilometraje acumulado.

### Épica E3 – Avisos y OT
- **E3-H1** Como *cualquier usuario* quiero crear un aviso de falla con foto desde el celular.
- **E3-H2** Como *planificador* quiero aprobar un aviso, asignar prioridad (sugerida por la matriz) y convertirlo en OT o agruparlo a una existente.
- **E3-H3** Como *técnico* quiero iniciar, pausar (con motivo de espera) y finalizar una OT registrando horas, repuestos y tareas.
- **E3-H4** Como *técnico* quiero codificar la falla con listas jerárquicas (sistema → conjunto → componente, modo, causa, acción).
  - Obligatorio en OT `CP`, `CE`, `AUX` para pasar a TERMINADA.
- **E3-H5** Como *supervisor* quiero verificar y cerrar la OT; si nació de un defecto crítico, el vehículo vuelve a OPERATIVO solo al cerrar.
- **E3-H6** Como *sistema* quiero marcar como retrabajo la OT del mismo vehículo y componente dentro de 30 días / 3 000 km.
- **E3-H7** Como *planificador* quiero registrar OT de taller externo con proveedor, factura y monto.
- **E3-H8** Como *planificador* quiero ver el backlog filtrable y un calendario de programación semanal.

### Épica E4 – Preventivo
- **E4-H1** Como *planificador* quiero crear un plan PM por modelo con rutinas (km/horas/días, lo que ocurra primero) y tareas con tiempos y kits.
- **E4-H2** Como *sistema* quiero calcular vencimientos y estado (al día/próximo/generar/vencido) por vehículo y rutina, proyectando la fecha según el uso de los últimos 30 días.
- **E4-H3** Como *sistema* quiero generar la OT PM automáticamente al llegar al 90 % (configurable) sin duplicar OT abiertas.
- **E4-H4** Como *sistema* quiero, al cerrar una OT PM, actualizar la última ejecución de la rutina y de sus rutinas anidadas.
- **E4-H5** Como *planificador* quiero un tablero de previsión de las próximas 4 semanas con la carga de horas estimada.

### Épica E5 – Inspecciones y documentos
- **E5-H1** Como *administrador* quiero configurar checklists por tipo de vehículo marcando ítems críticos.
- **E5-H2** Como *conductor* quiero completar la inspección pre-operacional en ≤ 3 minutos desde el celular.
  - Defecto en ítem crítico ⇒ vehículo FUERA DE SERVICIO + aviso P1 + notificación inmediata.
  - Se muestran los defectos ya reportados y abiertos.
- **E5-H3** Como *administrador* quiero registrar documentos con vencimiento y recibir alertas a 30/15/7 días; documentos bloqueantes vencidos inmovilizan el vehículo.

### Épica E6 – Indicadores
- **E6-H1** Como *gerencia/jefe de mantenimiento* quiero un tablero con los 14 KPI del MVP con meta, tendencia y filtros.
- **E6-H2** Como *jefe de mantenimiento* quiero el Pareto de fallas y el top 10 de malos actores con drill-down a las OT.
- **E6-H3** Como *usuario* quiero exportar listados y reportes a Excel.

## 5. Definición de "Terminado" (Definition of Done)

Una historia está terminada cuando:
1. Cumple todos sus criterios de aceptación, verificados por el dueño de producto (Jefe de mantenimiento de OLAST).
2. Tiene pruebas automatizadas: unitarias de reglas de negocio y de integración del endpoint.
3. Pasa la integración continua (lint, tipos, pruebas, build).
4. Las migraciones de base de datos son reversibles y se probaron con datos semilla.
5. La pantalla funciona en celular (≥ 360 px) y escritorio.
6. Los cambios relevantes quedan en el registro de auditoría.
7. Está desplegada en el entorno de pruebas (staging).
8. La documentación (este directorio `docs/` o la API) está actualizada si cambió una regla.

## 6. Plan de arranque operativo (paralelo al desarrollo)

| Semana | Actividad (responsable OLAST) |
|---|---|
| S0–S1 | Levantar el inventario de la flota en la plantilla de carga (placa, VIN, modelo, año, sede, km actual, documentos). |
| S1–S2 | Definir criticidad A/B/C de cada vehículo con el método del documento 03. |
| S2–S3 | Recopilar manuales del fabricante y construir los planes PM por modelo (rutinas, tareas, kits). |
| S3–S4 | Ajustar checklists pre-operacionales por tipo de vehículo; identificar la sede piloto y los usuarios clave. |
| S5 | Última ejecución conocida de cada PM por vehículo (para inicializar vencimientos). |
| Piloto | Capacitación de conductores (15 min), técnicos (1 h), planificador y supervisores (4 h). |
