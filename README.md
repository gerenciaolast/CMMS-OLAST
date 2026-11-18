# CMMS-OLAST

Sistema de Gestión de Mantenimiento Computarizado (CMMS) para la flota de vehículos de **OLAST**.

> **Estado:** Modelo de mantenimiento y confiabilidad v0.1 — **propuesta para aprobación**. El desarrollo inicia una vez aprobado el modelo (ver [docs/08](docs/08-decisiones-pendientes.md)).

## Objetivo

Maximizar la **disponibilidad segura** de la flota al **menor costo total por kilómetro**, con mantenimiento mayormente planificado, datos de falla codificados y mejora continua basada en evidencia.

## Modelo MGMC-OLAST

`Activos → Planificar → Programar → Ejecutar → Cerrar y verificar → Analizar → Mejorar`, alimentado por la operación (inspección diaria del conductor, lecturas y reportes de falla).

Basado en ISO 55000, EN 13306, ISO 14224, VMRS (ATA/TMC), SAE JA1011 (RCM), métricas SMRP, TPM e ISO 39001.

## Documentación

| # | Documento | Contenido |
|---|---|---|
| 01 | [Marco y principios](docs/01-marco-y-principios.md) | Normas de referencia, principios, estrategias, niveles de mantenimiento, gobernanza, disparadores de RCA |
| 02 | [Procesos](docs/02-procesos.md) | 13 procesos con flujos y reglas de negocio (vehículos, lecturas, inspección, avisos, PM, programación, OT, estados, documentos, mejora, repuestos, combustible, neumáticos) |
| 03 | [Catálogos y codificación](docs/03-catalogos-y-codificacion.md) | Tipos de OT, criticidad A/B/C, matriz de prioridad, codificación de fallas, checklist base |
| 04 | [Modelo de datos](docs/04-modelo-de-datos.md) | Diagrama entidad-relación, tablas y campos, reglas de integridad |
| 05 | [Indicadores](docs/05-indicadores.md) | 14 KPI del MVP con fórmulas y metas, análisis, KPI de fase 2 |
| 06 | [Alcance, roles y hoja de ruta](docs/06-alcance-roles-y-roadmap.md) | Módulos por fase, matriz de permisos, sprints, backlog del MVP, Definition of Done |
| 07 | [Guía de desarrollo](docs/07-guia-de-desarrollo.md) | Arquitectura, stack, estructura del repositorio, convenciones, pruebas, Sprint 0 paso a paso |
| 08 | [Decisiones pendientes](docs/08-decisiones-pendientes.md) | Preguntas para OLAST y lista de aprobación |
