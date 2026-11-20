# 10 · Planes de mantenimiento preventivo (propuesta v1)

> Construidos con tres fuentes: **documentación del fabricante y su red en Colombia**, el **historial OLAST 2024–2026** (409 intervenciones) y criterio **RCM**, que agrega inspecciones donde el historial muestra fallas repetitivas.
> Los planes quedan cargados en el sistema (**Preventivo → Planes**) y OLAST puede ajustar los intervalos y las tareas. Cada cambio recalcula los vencimientos.

## 1. Familias y frecuencias

| Plan | Aplica a | Cambio de aceite | Rutinas | Por qué |
|---|---|---|---|---|
| **CAM-6K** | Camiones diésel en operación (NHR, NKR, NQR, NPR, FRR fuera de garantía) | **6.000 km** o 6 meses | A 6.000 · B 12.000 · C 24.000 · D 48.000 (fluidos) | Esquema ABC de 6.000 km que usaba la red Chevrolet antes de las nuevas cadencias; la mediana real en el historial de OLAST fue 6.500 km |
| **CAM-10K** | Camiones diésel nuevos o en garantía (NPR y FVZ 2026, NKR 2023) | **10.000 km** o 6 meses | A 10.000 · B 20.000 · C 40.000 (fluidos) | La garantía Chevrolet Colombia de la Serie N exige revisión cada 10.000 km o 6 meses (tolerancia 1.000 km o 1 mes). El historial de estos vehículos muestra revisiones a 10, 20, 30 y 40 mil km y el cambio total de fluidos a 40.000 km |
| **VAN-5K** | Vans a gasolina N300 | **5.000 km** o 6 meses | A 5.000 · B 10.000 · C 20.000 · D 40.000 | Rutina vigente DISCOLMETS (5.000 km) y esquema 5.000 / 10.000 / 20.000 de la red Chevrolet; historial de 5.500 a 5.800 km |
| **VAN-10K** | Van N400 en garantía | **10.000 km** o 6 meses | A 10.000 · B 20.000 · C 40.000 | Revisiones de fabricante que registra el historial |
| **MCA-3K** | Motocarros Bajaj RE Maxima C | **3.000 km** o 4 meses | A 3.000 · B 6.000 | Historial: cambios cada 2.400 a 3.500 km; referencia general de motores de moto, 3.000 a 5.000 km. **Pendiente confirmar con el manual Bajaj** |

Las rutinas mayores **incluyen** a las menores: si coinciden A, B y C, se genera una sola OT, la de C, con todas las tareas.

### Asignación automática (botón «Asignar planes sugeridos»)

- Motocarro → MCA-3K · N400 → VAN-10K · N300 → VAN-5K.
- Camión diésel con 3 años o menos, o FVZ → CAM-10K; el resto → CAM-6K.
- Resultado en la flota actual: CAM-6K 10 vehículos · CAM-10K 4 · VAN-5K 2 · VAN-10K 1 · MCA-3K 3.

## 2. Tareas que vienen del historial (RCM)

| Hallazgo en el historial 2024–2026 | Tarea agregada | Rutina |
|---|---|---|
| Frenos: sistema con más eventos correctivos (bandas, cilindros, campanas) | Graduación de frenos en **cada** servicio; medición de bandas y revisión de cilindros | A / B |
| Rodamientos y retenedores de rueda | Revisión, limpieza y engrase de rodamientos; cambio de retenedores con fuga | C (camiones) |
| Crucetas, bujes de muelle, splinder | Engrase general en cada servicio; revisión de suspensión y dirección | A / B |
| Radiadores, mangueras, termostatos | Revisión de niveles y mangueras en cada servicio; revisión del sistema de refrigeración | A / C |
| Mantenimientos correctivos de EGR y turbo | Limpieza de EGR; revisión de turbo e intercooler | C |
| N300: tijeras, terminales, puertas corredizas, cuerpo de aceleración | Revisión de suspensión delantera, rieles y rodillos de puertas, limpieza de cuerpo de aceleración e IAC | B / C (vans) |
| Motocarros: guaya de embrague y pin de reversa | Ajuste de guaya en cada servicio; revisión de caja y selector | A / B |

## 3. Cómo funcionan las alarmas

- Cada rutina vence por **kilómetros o por tiempo, lo que ocurra primero**, contados desde su última ejecución real.
- Estados: **Al día** (< 80 %), **Próximo** (≥ 80 %), **Vence ya** (≥ 90 %: **se genera la OT automáticamente**) y **Vencido** (> 100 % + 10 % de tolerancia: la OT sale con prioridad P2).
- Los vencimientos se recalculan con cada lectura de kilometraje, al cerrar una OT preventiva y cada 6 horas (para los vencimientos por tiempo).
- La fecha de vencimiento se **proyecta** con el uso promedio del vehículo en los últimos 180 días.
- Al cerrar la OT preventiva se reinicia la rutina y las que incluye.

## 4. Pendientes para OLAST

1. **Confirmar con los manuales** (o con el concesionario) los intervalos de FVZ, FRR y del motocarro Bajaj, y la especificación de aceite de cada motor.
2. **Línea base:** al asignar los planes se tomó como "última ejecución" el preventivo de mayor kilometraje del historial. Conviene confirmarla vehículo por vehículo con «Registrar última ejecución».
3. **Kilometraje al día:** las alarmas por km dependen de las lecturas. Mientras llega la integración con Ituran, el kilometraje se alimenta con la inspección diaria (Sprint 4), los avisos, las OT y la plantilla.
4. Los camiones Euro VI de las nuevas generaciones (NHR/NKR/NLR) admiten intervalos mayores según Chevrolet. Cuando lleguen a la flota, se crea un plan específico.

## 5. Fuentes

- [Garantía Chevrolet Buses y Camiones Colombia (Serie N): revisión a los 10.000 km o 6 meses](https://www.chevrolet.com.co/content/dam/chevrolet/south-america/colombia/espanol/index/garantia/2-pdf/202311_Certificado-Garantia-BC-Version-Protegida.pdf)
- [Tipos de mantenimiento para camiones y buses Chevrolet](https://www.busesycamioneschevrolet.com.co/blog/tipos-mantenimiento-camiones-chevrolet/)
- [Mantenimiento incluido NPR y NQR (reemplazo de cadencias ABC de 6.000 km)](https://www.vivecodiesel.com/blog/mantenimiento-incluido-npr-y-nqr)
- [Gama Chevrolet Euro VI Intelligence en Colombia](https://fuelcarmagazine.com/noticias/colombia/chevrolet-revela-en-colombia-su-gama-actualizada-de-camiones-con-motor-euro-vi-intelligence/)
- [Intervalos generales de mantenimiento Chevrolet en Colombia (5.000 / 10.000 / 20.000 km)](https://www.c3carecarcenter.com/blog/cada-cuanto-se-hace-la-revision-de-un-chevrolet/)
- [Isuzu Vietnam: plan de servicio FVR / FVM / FVZ](https://isuzu-vietnam.com/?p=3453)
- [Cambio de aceite en motos: 3.000 a 6.000 km o 6 meses](https://www.losandes.com.ar/automotores/no-es-solo-kilometros-como-detectar-que-la-moto-necesita-cambio-aceite-n5966244)
