# 03 · Catálogos, clasificaciones y codificación

Estos catálogos son **datos maestros** que se cargarán como datos semilla (seed) y serán administrables desde el sistema. Los valores aquí son la propuesta inicial.

## 1. Tipos de Orden de Trabajo

| Código | Tipo | Planificado | Descripción |
|---|---|---|---|
| `PM` | Preventivo | Sí | Generado por plan de mantenimiento (km/horas/tiempo) |
| `INS` | Inspección | Sí | Inspección periódica técnica (no la diaria del conductor) |
| `PDM` | Predictivo / por condición | Sí | Basado en medición: análisis de aceite, desgaste medido |
| `CP` | Correctivo planificado | Sí | Falla detectada que se programa sin urgencia |
| `CE` | Correctivo de emergencia | **No** | Falla que detiene el vehículo o requiere atención inmediata |
| `AUX` | Auxilio vial | **No** | Atención en ruta, grúa |
| `SIN` | Siniestro / colisión | **No** (se reporta aparte) | Daños por accidente; puede ligarse a reclamación de seguro |
| `MEJ` | Mejora / modificación | Sí | Cambios de diseño, adecuaciones, accesorios |
| `CAM` | Campaña / recall | Sí | Campaña del fabricante o campaña interna sobre un grupo de vehículos |

> **% Planificado** = horas (o costo) en OT de tipos planificados / total, excluyendo `SIN`. Meta ≥ 80 %.

## 2. Criticidad del vehículo (A / B / C)

Se calcula con 4 criterios, cada uno de 1 a 3 puntos:

| Criterio | 1 punto | 2 puntos | 3 puntos |
|---|---|---|---|
| **Impacto operacional** si se detiene | Hay reemplazo inmediato | Reemplazo con demora / afecta parcialmente | Sin reemplazo, detiene un servicio/contrato |
| **Seguridad y ambiente** | Riesgo bajo (liviano, uso interno) | Transporte de carga general | Transporte de personas o mercancías peligrosas |
| **Costo de reparación típico** | Bajo | Medio | Alto (equipo especial, importado) |
| **Exigencia de uso** | < 3 000 km/mes | 3 000 – 8 000 km/mes | > 8 000 km/mes o 24/7 |

- **A (crítico):** 10–12 puntos, o 3 puntos en Seguridad → prioridad máxima, RCM ligero, repuestos críticos en stock.
- **B (importante):** 7–9 puntos.
- **C (general):** 4–6 puntos.

La criticidad se revisa anualmente o cuando cambia el uso del vehículo.

## 3. Matriz de prioridad

La prioridad de un aviso/OT combina **consecuencia de la falla** y **criticidad del vehículo**:

| Consecuencia de la falla ↓ / Criticidad → | A | B | C |
|---|---|---|---|
| **Seguridad / legal** (vehículo no puede operar) | P1 | P1 | P1 |
| **Detiene la operación** | P1 | P2 | P2 |
| **Opera con restricción / degrada** | P2 | P3 | P3 |
| **Sin impacto inmediato** | P3 | P4 | P4 |

| Prioridad | Nombre | Tiempo objetivo de respuesta | Tiempo objetivo de solución |
|---|---|---|---|
| **P1** | Emergencia | ≤ 2 h | ≤ 24 h |
| **P2** | Urgente | ≤ 24 h | ≤ 72 h |
| **P3** | Normal | Programar en la semana | ≤ 15 días |
| **P4** | Oportunidad | Próxima parada programada | ≤ 30 días / próximo PM |

Los tiempos objetivo son configurables y se usan para el indicador de cumplimiento de SLA.

## 4. Codificación de fallas

Inspirada en **ISO 14224** (modo – causa – acción) y en la estructura jerárquica de **VMRS** (sistema – conjunto – componente). El catálogo es **propio de OLAST**, con códigos alfanuméricos legibles, y admite un campo `codigo_vmrs` opcional para mapearse al estándar VMRS si en el futuro se licencia.

### 4.1 Jerarquía de ubicación técnica: Sistema → Conjunto → Componente

> **Actualizado en v0.2:** esta lista preliminar fue reemplazada por el **catálogo OLAST de 22 sistemas, 74 conjuntos y 106 componentes**, construido con el historial real. Ver [doc 09](09-catalogo-componentes-y-analisis-historial.md) y [`data/catalogos/`](../data/catalogos/). La tabla siguiente queda solo como referencia.

Nivel 1 (sistemas) preliminar:

| Código | Sistema | Ejemplos de conjunto (nivel 2) |
|---|---|---|
| `MOT` | Motor | Bloque y culata, lubricación, distribución, admisión, escape, turbo |
| `ENF` | Refrigeración | Radiador, bomba de agua, termostato, mangueras, ventilador |
| `COM` | Combustible | Tanque, bomba, inyectores, filtros, líneas |
| `ELE` | Eléctrico de arranque y carga | Batería, alternador, motor de arranque, cableado |
| `ELN` | Electrónica y sensores | ECU, sensores, tablero, telemática |
| `ILU` | Iluminación y señalización | Faros, luces de freno, direccionales, alarma de reversa |
| `TRA` | Transmisión / caja | Caja de cambios, embrague, convertidor |
| `TRE` | Tren motriz | Cardán, diferencial, ejes, semiejes |
| `FRN` | Frenos | Pastillas/zapatas, discos/tambores, sistema neumático/hidráulico, ABS |
| `DIR` | Dirección | Caja/cremallera, bomba, terminales, rótulas |
| `SUS` | Suspensión | Amortiguadores, muelles/resortes, bujes, barras |
| `NEU` | Neumáticos y ruedas | Neumático, rin, válvula, alineación/balanceo |
| `CAR` | Carrocería y cabina | Puertas, vidrios, espejos, asientos, cinturones |
| `HVA` | Climatización | Compresor A/C, calefacción, ventilación |
| `CHA` | Chasis y acoples | Bastidor, quinta rueda, enganche |
| `EQP` | Equipo auxiliar / carrocería especial | Furgón, plataforma, grúa, hidráulica, refrigeración de carga |
| `SEG` | Equipos de seguridad | Extintor, botiquín, triángulos, cámaras |
| `GEN` | General / no aplica | Lavado, revisión general sin hallazgo |

### 4.2 Modo de falla (qué se observó)

| Código | Modo de falla |
|---|---|
| `DES` | Desgaste |
| `ROT` | Rotura / fractura |
| `FUG` | Fuga (aceite, refrigerante, aire, combustible) |
| `SOB` | Sobrecalentamiento |
| `RUI` | Ruido / vibración anormal |
| `ELC` | Falla eléctrica (corto, circuito abierto, sin señal) |
| `BLQ` | Bloqueo / atascamiento |
| `DSJ` | Desajuste / flojo / desalineado |
| `CON` | Contaminación (agua, suciedad, combustible contaminado) |
| `COR` | Corrosión |
| `BAJ` | Bajo rendimiento (pérdida de potencia, mayor consumo) |
| `INT` | Intermitente |
| `NOF` | No funciona (sin causa observable) |
| `SHF` | Sin hallazgo (se inspeccionó, no se encontró falla) |

### 4.3 Causa (por qué ocurrió)

| Código | Causa |
|---|---|
| `DNO` | Desgaste normal por uso (fin de vida útil esperado) |
| `FMA` | Falta o deficiencia de mantenimiento |
| `OPE` | Mala operación / abuso del conductor |
| `INS` | Instalación o reparación incorrecta (retrabajo) |
| `REP` | Defecto de repuesto / calidad del proveedor |
| `FAB` | Defecto de diseño o fabricación (posible garantía) |
| `ACC` | Accidente / daño externo / terceros |
| `AMB` | Condición ambiental u operativa severa (vías, polvo, carga) |
| `VAN` | Vandalismo / robo |
| `DES` | Desconocida (requiere análisis) |

### 4.4 Acción realizada (qué se hizo)

| Código | Acción |
|---|---|
| `REE` | Reemplazar |
| `REP` | Reparar |
| `AJU` | Ajustar / calibrar / apretar |
| `LUB` | Lubricar / completar nivel |
| `LIM` | Limpiar |
| `INS` | Inspeccionar / diagnosticar |
| `REC` | Reacondicionar / reconstruir |
| `PRG` | Reprogramar / actualizar software |
| `GAR` | Enviado a garantía |
| `DIF` | Diferido (se genera aviso para después) |

**Ejemplo de cierre:** `FRN › Pastillas › Pastilla delantera` · Modo `DES` · Causa `DNO` · Acción `REE`.

## 5. Estados del vehículo

Ver tabla en [02-procesos, P8](02-procesos.md#p8-gestión-del-estado-del-vehículo-y-tiempo-fuera-de-servicio).

## 6. Motivos de espera de una OT

`REPUESTO` (sin stock / en compra) · `PROVEEDOR` (en taller externo) · `APROBACION` (presupuesto por aprobar) · `TECNICO` (sin personal disponible) · `VEHICULO` (operaciones no lo libera) · `DIAGNOSTICO` (esperando diagnóstico especializado) · `GARANTIA` (esperando respuesta del fabricante).

Medir el tiempo en cada motivo de espera permite atacar la verdadera causa del tiempo fuera de servicio (normalmente: repuestos y aprobaciones).

## 7. Tipos de vehículo y checklist pre-operacional

Tipos iniciales (configurables): `LIV` Liviano (automóvil, camioneta), `CAR` Carga mediana/pesada, `TRC` Tractocamión, `REM` Remolque/semirremolque, `BUS` Bus/van de pasajeros, `MOT` Motocicleta, `MAQ` Maquinaria/montacargas (usa horómetro).

Checklist base de ejemplo (vehículo liviano/carga) — los ítems marcados **(C)** son críticos y bloquean el vehículo:

1. Frenos de servicio y estacionamiento **(C)**
2. Dirección (juego, ruidos) **(C)**
3. Neumáticos: estado, presión visual, cortes **(C)**
4. Luces: delanteras, freno, direccionales, reversa **(C)**
5. Cinturones de seguridad **(C)**
6. Fugas visibles (combustible, aceite, refrigerante, frenos) **(C si es combustible o frenos)**
7. Limpiaparabrisas y vidrios / visibilidad **(C)**
8. Espejos retrovisores
9. Niveles: aceite, refrigerante, líquido de frenos, lavaparabrisas
10. Testigos del tablero encendidos
11. Bocina y alarma de reversa
12. Equipo de seguridad: extintor vigente, botiquín, triángulos
13. Documentos del vehículo a bordo
14. Carrocería: daños nuevos (foto obligatoria)
15. Limpieza general de cabina
