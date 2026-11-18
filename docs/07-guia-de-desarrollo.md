# 07 · Guía de desarrollo (para iniciar tras la aprobación del modelo)

Este documento es la **instrucción técnica** para construir el CMMS. Los documentos 01–06 son la especificación funcional: ante cualquier duda de negocio, mandan ellos.

## 1. Decisiones de arquitectura (propuesta)

**Estilo:** **monolito modular**. Un solo backend desplegable, dividido internamente en módulos por dominio con límites claros. Es lo más ágil para un equipo pequeño y permite extraer un módulo a servicio independiente más adelante si el volumen lo exige (p. ej. telemática).

| Capa | Tecnología | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** en todo el stack | Un solo lenguaje, tipos compartidos entre frontend y backend |
| Monorepo | **pnpm workspaces + Turborepo** | Compartir tipos/validaciones, builds incrementales |
| Backend / API | **NestJS** (REST + OpenAPI/Swagger) | Estructura modular, inyección de dependencias, guards para permisos |
| ORM / migraciones | **Prisma** | Esquema declarativo, migraciones versionadas, tipos generados |
| Base de datos | **PostgreSQL 16** | Relacional robusta, JSONB, vistas, secuencias, buen soporte para KPIs con SQL |
| Tareas programadas y colas | **pg-boss** (sobre PostgreSQL) | Recalcular PM, alertas, notificaciones sin agregar Redis al inicio |
| Frontend | **Next.js (App Router) + React**, como **PWA** | Una sola app web instalable en el celular del conductor y técnico; escritorio para planificación |
| UI | **Tailwind CSS + shadcn/ui**, íconos Lucide | Componentes accesibles y rápidos de construir |
| Estado servidor / formularios | **TanStack Query**, **React Hook Form + Zod** | Caché de datos y validación compartida con el backend |
| Gráficos | **Recharts** (o Apache ECharts) | Tableros de KPI |
| Archivos (fotos, facturas) | Almacenamiento **compatible S3** (MinIO en local) | Escalable y económico |
| Autenticación | JWT de acceso corto + refresh token, contraseñas con **argon2**; preparado para SSO (OIDC) | Simple al inicio, integrable con Microsoft/Google después |
| Correo | SMTP / proveedor transaccional vía adaptador | Notificaciones |
| Pruebas | **Vitest** (unitarias), **Supertest** (API), **Playwright** (E2E) | |
| Calidad | ESLint, Prettier, `tsc --noEmit`, Husky + lint-staged, Conventional Commits | |
| CI | **GitHub Actions**: lint → typecheck → test → build | |
| Entorno local | **Docker Compose** (postgres, minio, mailpit) | Arranque en un comando |
| Despliegue | Contenedores Docker en cualquier nube (p. ej. un servicio administrado de contenedores + PostgreSQL administrado) | Sin dependencia de proveedor |
| Observabilidad | Logs estructurados (pino), endpoint `/health`, Sentry opcional | |

> Si OLAST ya tiene un estándar tecnológico corporativo (p. ej. .NET o Microsoft 365/Azure), el modelo funcional no cambia; solo se reemplaza esta tabla. Ver [08-decisiones-pendientes](08-decisiones-pendientes.md).

## 2. Estructura del repositorio

```
cmms-olast/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed/             # catálogos del doc 03 (JSON/TS)
│   │   └── src/
│   │       ├── main.ts
│   │       ├── common/           # auth, guards, permisos, auditoría, errores, paginación
│   │       ├── jobs/             # pg-boss: recálculo PM, alertas, notificaciones
│   │       └── modules/
│   │           ├── organization/ # organizaciones, sedes, usuarios, roles
│   │           ├── catalog/      # códigos de componentes, modos, causas, acciones, tipos
│   │           ├── vehicles/     # vehículos, modelos, estados, documentos
│   │           ├── meters/       # lecturas y cambios de odómetro
│   │           ├── maintenance-plans/  # planes, rutinas, tareas, vencimientos
│   │           ├── inspections/  # checklists e inspecciones
│   │           ├── work-requests/
│   │           ├── work-orders/
│   │           ├── parts/        # repuestos y proveedores
│   │           ├── files/
│   │           ├── notifications/
│   │           └── kpis/         # vistas y endpoints de indicadores
│   └── web/                      # Next.js PWA
│       └── src/
│           ├── app/              # rutas: /vehiculos, /ot, /avisos, /preventivo, /inspeccion, /kpi …
│           ├── components/
│           ├── features/         # por dominio, espejo de los módulos del backend
│           └── lib/              # cliente API generado, auth, utilidades
├── packages/
│   ├── domain/                   # REGLAS DE NEGOCIO PURAS (sin BD ni HTTP) + pruebas
│   │   ├── criticality.ts        # cálculo A/B/C
│   │   ├── priority-matrix.ts    # P1–P4
│   │   ├── pm-schedule.ts        # vencimientos, % consumido, proyección, estado
│   │   ├── meter-validation.ts   # lecturas
│   │   ├── work-order-state.ts   # máquina de estados de OT
│   │   ├── rework.ts             # detección de retrabajo
│   │   └── kpi/                  # fórmulas de indicadores
│   ├── shared/                   # enums, esquemas Zod, DTOs compartidos
│   └── config/                   # eslint, tsconfig, prettier compartidos
├── docs/                         # este modelo
├── docker-compose.yml
├── turbo.json
└── .github/workflows/ci.yml
```

**Regla de oro:** toda regla de negocio de los documentos 02 y 03 se implementa como **función pura en `packages/domain`**, con pruebas unitarias que citen la regla (p. ej. `// Regla P5: lo que ocurra primero`). Los módulos de la API solo orquestan: validan, cargan datos, llaman al dominio y persisten en una transacción.

## 3. Convenciones

- **Idioma:** código, BD, API y commits en inglés; textos de UI, mensajes de error al usuario y documentación funcional en español. Textos de UI en archivos de traducción (`es-*`) desde el inicio, aunque solo haya un idioma.
- **Nombres:** tablas `snake_case` plural; modelos Prisma `PascalCase` singular con `@@map`; endpoints REST en plural `kebab-case` (`/api/v1/work-orders`).
- **API:** versionada (`/api/v1`), paginación por cursor o `page/pageSize`, filtros por query string, errores con formato uniforme `{ code, message, details }`. OpenAPI generado automáticamente y cliente TypeScript generado para el frontend.
- **Transiciones de estado:** endpoints de acción explícitos (`POST /work-orders/:id/start`, `/hold`, `/resume`, `/complete`, `/close`, `/cancel`), no `PATCH status`. Cada transición valida la máquina de estados, registra auditoría y emite un evento de dominio interno.
- **Eventos de dominio** (internos, en proceso): `MeterReadingRecorded` → recalcula PM; `InspectionCriticalDefect` → estado del vehículo + aviso + notificación; `WorkOrderClosed` → actualiza PM, estado del vehículo, costos. Esto desacopla módulos y prepara para colas externas.
- **Fechas:** se guardan en UTC (`timestamptz`); se muestran en la zona horaria de la organización.
- **Unidades:** se guardan en km y litros; la conversión a millas/galones es de presentación según la organización.
- **Dinero:** `numeric(14,2)` con moneda de la organización; nunca `float`.
- **Borrado:** lógico en datos maestros; los registros transaccionales (OT, lecturas, inspecciones) no se borran, se anulan con motivo.
- **Ramas y commits:** `feature/<épica>-<historia>-descripcion` (ej. `feature/e3-h3-work-order-execution`), Conventional Commits (`feat(work-orders): ...`), PR con revisión y CI verde antes de fusionar.

## 4. Seguridad

- Autorización por **permisos atómicos** con guard en cada endpoint + filtro por sede en las consultas (nunca confiar en el frontend).
- Validación de entradas con Zod/class-validator en todos los endpoints.
- Archivos: tipos y tamaño máximo permitidos, URLs firmadas de corta duración.
- Limitar tasa de intentos de inicio de sesión; registro de accesos.
- Secretos solo por variables de entorno; `.env.example` sin valores reales.
- Respaldos diarios de la base de datos con retención ≥ 30 días y prueba de restauración trimestral.

## 5. Calidad y pruebas mínimas obligatorias

| Área | Pruebas |
|---|---|
| `packages/domain` | Cobertura ≥ 90 %. Casos límite: PM por km vs. por días (gana el primero), rutinas anidadas, tolerancia, lecturas decrecientes, cambio de odómetro, retrabajo en el día 30 vs. 31, matriz de prioridad completa, transiciones inválidas de OT |
| API | Pruebas de integración por endpoint con base de datos de prueba (contenedor): permisos, validaciones, transacciones |
| E2E | Flujos críticos: inspección con defecto crítico → aviso → OT → cierre → vehículo operativo; lectura que dispara OT PM |
| KPIs | Pruebas con datos semilla de resultado conocido para cada fórmula del doc 05 |

## 6. Orden de implementación (Sprint 0 paso a paso)

1. Inicializar monorepo (pnpm, Turborepo, TypeScript estricto, ESLint/Prettier, Husky).
2. `docker-compose.yml` con PostgreSQL 16, MinIO y Mailpit; `.env.example`.
3. Crear `apps/api` (NestJS) con `/health`, logger pino, manejo uniforme de errores, Swagger en `/api/docs`.
4. Prisma: esquema inicial de `organizations`, `sites`, `users`, roles/permisos, `audit_log` y catálogos del doc 03. Migración inicial.
5. Seed: organización OLAST, sede de ejemplo, usuario admin, roles y permisos del doc 06, catálogos completos del doc 03 (tipos de OT, prioridades, componentes niveles 1–2, modos, causas, acciones, motivos de espera, tipos de vehículo, checklist base).
6. Autenticación (login, refresh, logout, cambio de contraseña) y guard de permisos + filtro por sede.
7. Interceptor de auditoría genérico.
8. Crear `packages/domain` con las funciones puras y sus pruebas (se pueden escribir antes que la API: son la especificación ejecutable).
9. Crear `apps/web` (Next.js PWA): layout responsivo, login, navegación por rol, cliente API generado desde OpenAPI.
10. GitHub Actions: lint, typecheck, test, build en cada PR.
11. Entorno de staging desplegado automáticamente desde la rama principal.

Luego seguir el orden de sprints del [doc 06](06-alcance-roles-y-roadmap.md#3-hoja-de-ruta-sprints-de-2-semanas): S1 Vehículos y lecturas → S2 Avisos y OT → S3 Preventivo → S4 Inspecciones y documentos → S5 KPIs.

## 7. Pantallas del MVP (referencia para UI)

| Pantalla | Usuario principal | Dispositivo |
|---|---|---|
| Inicio por rol (mis tareas, alertas) | Todos | Ambos |
| Lista de flota (filtros, estado con color, disponibilidad) | Jefe, planificador | Escritorio |
| Hoja de vida del vehículo (pestañas: resumen, OT, PM, lecturas, documentos, costos) | Todos | Ambos |
| Inspección pre-operacional (paso a paso, botones grandes) | Conductor | **Celular** |
| Nuevo aviso (con foto) | Todos | **Celular** |
| Bandeja de avisos | Planificador, supervisor | Escritorio |
| Backlog y programación semanal (tabla + calendario) | Planificador | Escritorio |
| Detalle de OT – vista técnico (iniciar/pausar/terminar, repuestos, tareas, codificación) | Técnico | **Celular / tablet** |
| Detalle de OT – vista supervisor (verificar, cerrar, costos) | Supervisor | Ambos |
| Planes PM (editor de rutinas y tareas) | Planificador | Escritorio |
| Previsión PM (próximas 4 semanas) | Planificador | Escritorio |
| Documentos y vencimientos | Administrador | Escritorio |
| Tablero de KPIs + Pareto + malos actores | Gerencia, jefe | Escritorio |
| Configuración (catálogos, usuarios, sedes, checklists) | Administrador | Escritorio |

## 7.1 Identidad visual (Manual de marca OLAST, mar-2026)

| Elemento | Regla | Implementación |
|---|---|---|
| Paleta | `#ffffff` · `#82ceed` celeste · `#1275a3` · `#0b5e85` azul principal · `#054e74` azul oscuro · `#232323` texto | Tokens en `apps/web/src/app/globals.css` (`brand`, `brand-600`, `brand-800`, `sky`, `ink`) |
| Tipografía | Poppins (Regular y Bold) | `next/font/google`, variable `--font-poppins` |
| Logo a color (degradado azul) | **Solo sobre fondo blanco** | `<OlastLogo variant="color" />` |
| Logo blanco (invertido) | Sobre fondos oscuros o de color corporativo | `<OlastLogo variant="blanco" />` (menú lateral, login) |
| Usos prohibidos | Cambiar colores, contornear, encerrar en círculo, deformar, rotar, separar símbolo y texto | El componente fija la proporción (`object-contain`); no usar `<img>` sueltos del logo |
| Recurso gráfico | Curva celeste sobre fondo azul corporativo | Onda del login |

- Archivos en `apps/web/public/brand/` (extraídos del manual sin alterar el trazo). El ícono de la app (`icon-192/512.png`) es el símbolo blanco sobre azul `#0b5e85`, que es un uso permitido: fondo de color corporativo, sin círculo.
- Los colores de estado (verde OK, ámbar alerta, rojo peligro) son funcionales del CMMS y no reemplazan la paleta de marca.
- El manual en PDF no se sube al repositorio.

## 8. Migración de datos iniciales

Plantillas de importación (CSV/Excel) con validación previa y reporte de errores por fila, para:
vehículos · lecturas actuales · documentos · repuestos · proveedores · técnicos · conductores · última ejecución de cada rutina PM por vehículo.

## 9. Integración GPS Ituran (adelantada a fase 1–2)

OLAST usa **Ituran**. La integración elimina la digitación del odómetro y hace confiable el cálculo de PM y del costo/km.

- **Módulo `telematics`** con un adaptador `IturanProvider` detrás de una interfaz `TelematicsProvider` (`getOdometer`, `getDailyDistance`, `getHourlyDistance`, `getEngineHours`), para poder cambiar de proveedor sin tocar el resto.
- **Job programado** (pg-boss): cada hora la distancia horaria; a las 00:30 el odómetro y la distancia del día anterior por vehículo → `meter_readings` con `source = gps`.
- **Mapeo** vehículo CMMS ↔ unidad Ituran por placa / ID de dispositivo (tabla `telematics_units`).
- **Reglas:** la lectura GPS pasa por las mismas validaciones de P2. Si GPS y conductor difieren más de 2 %, se marca para revisión. Vehículo sin reporte GPS por más de 48 h → alerta.
- **Credenciales:** solo en el gestor de secretos del entorno (variables `ITURAN_*`). **Nunca en el código, en el repositorio (es público) ni en documentos.**
- **Servicio confirmado (nov-2026):** Ituran entrega un servicio web **SOAP (WorldFleetLog)** de **estado actual**. Devuelve, por vehículo, la placa, el ID del dispositivo, la fecha del último evento, la posición, la velocidad, el **odómetro**, las **horas de motor**, el nivel de combustible y el estado (en movimiento / detenido / apagado). La autenticación va en un encabezado SOAP con usuario, contraseña y empresa. **Intervalo mínimo entre consultas: 60 s.** La documentación del proveedor es confidencial: no se copia en este repositorio.
- **Consecuencia de diseño:** el servicio **no entrega historial de recorridos**. Los km diarios y horarios se **calculan en el CMMS** guardando una "foto" del odómetro de cada vehículo cada hora (`telematics_snapshots`) y restando fotos consecutivas. Para eso, el job horario debe estar en marcha desde el primer día de la integración.
- **Prueba de conexión:** `tools/ituran_prueba_conexion.py`. Resultado del 18-nov-2026: el servicio responde, pero **las credenciales fueron rechazadas** (`Authenticate = false`, "Invalid login credentials or permission denied"). Hay que pedirle a Ituran que confirme si el usuario está activo y si hay restricción por IP. Ver doc 08.

## 10. Criterios de escalabilidad (cuándo evolucionar)

| Señal | Acción |
|---|---|
| > 2 000 vehículos o KPIs lentos (> 3 s) | Vistas materializadas / tablas de agregados por job nocturno |
| Integración telemática con alta frecuencia de eventos | Extraer módulo `telematics` como servicio con su cola (Redis/RabbitMQ) |
| Conductores en zonas sin cobertura | Activar modo offline de la PWA (IndexedDB + sincronización) para inspecciones y avisos |
| Más de una empresa/cliente | Activar multiempresa (ya existe `organization_id`) con aislamiento por fila (RLS en PostgreSQL) |
| Necesidad de BI corporativo | Réplica de lectura y conexión a herramienta BI |
