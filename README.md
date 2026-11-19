# CMMS-OLAST

Sistema de Gestión de Mantenimiento Computarizado (CMMS) para la flota de vehículos de **OLAST**.

> **Estado:** modelo aprobado por gerencia · Sprint 0 y **Sprint 1 (flota y lecturas) terminados** · siguiente: Sprint 2, avisos y órdenes de trabajo.

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
| 08 | [Decisiones pendientes](docs/08-decisiones-pendientes.md) | Preguntas para OLAST, respuestas recibidas y lista de aprobación |
| 09 | [Catálogo de componentes y análisis del historial](docs/09-catalogo-componentes-y-analisis-historial.md) | Catálogo OLAST (22 sistemas, 106 componentes, compatible con VMRS), hallazgos del historial 2024–2026 |

Datos semilla en [`data/catalogos/`](data/catalogos/) · herramienta de migración en [`tools/`](tools/).

## Desarrollo

Monorepo TypeScript (pnpm + Turborepo). Arquitectura y convenciones en [docs/07](docs/07-guia-de-desarrollo.md).

| Paquete | Qué es |
|---|---|
| `packages/domain` | Reglas de negocio puras (criticidad, prioridad, lecturas, vencimientos PM, máquina de estados de OT, retrabajo, KPI) con sus pruebas |
| `packages/shared` | Enumeraciones, permisos y roles compartidos |
| `apps/api` | API REST NestJS + Prisma/PostgreSQL · Swagger en `/api/docs` |
| `apps/web` | App web Next.js (PWA, funciona en celular y escritorio) |

### Arranque local

```bash
corepack enable && pnpm install
docker compose up -d                      # PostgreSQL, MinIO y Mailpit (o use un PostgreSQL 16 propio)
cp apps/api/.env.example apps/api/.env    # complete JWT_SECRET y SEED_ADMIN_PASSWORD
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @cmms/api prisma:deploy     # aplica migraciones
pnpm db:seed                              # catálogos, sedes, roles y usuario administrador
pnpm dev                                  # API en :3001 · web en :3000
```

El primer ingreso del administrador obliga a cambiar la contraseña.

### Carga del inventario de flota

```bash
# 1. Generar la plantilla pre-llenada desde los archivos de OLAST (fuera del repo: contienen datos internos)
python3 -I tools/plantilla_flota.py LLANTAS_VEHICULOS.xlsx Plantilla_flota_OLAST.xlsx HOJA_DE_VIDA_MANTTO.xlsx
# 2. OLAST completa las celdas amarillas (VIN, km, criticidad, SOAT, técnico-mecánica…)
# 3. Importar (se puede repetir: actualiza por placa y las celdas vacías no borran datos)
pnpm --filter @cmms/api fleet:import Plantilla_flota_OLAST.xlsx
```

### Calidad

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # lo mismo que corre CI en cada PR
```

Las pruebas de la API usan una base aparte (`TEST_DATABASE_URL`, por defecto `cmms_test` local) y **no la borran**: aplican migraciones pendientes y usan datos únicos por ejecución.

> ⚠️ Este repositorio es **público**: nunca suba archivos `.env`, credenciales (Ituran, base de datos), ni el historial con placas y costos.
