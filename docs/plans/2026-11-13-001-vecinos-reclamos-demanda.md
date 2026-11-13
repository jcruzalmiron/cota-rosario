# Plan: vecinos más simples, reclamos con seguimiento y demanda estimada

**Fecha:** 2026-11-13 · **Rama:** `feat/cota-c1` · **Planificó:** Opus 5.5 · **Ejecuta:** Fable 5.2 (agentes por unidad)

## Objetivo

1. **Vecinos:** que la primera pantalla responda en 5 segundos «¿tengo que hacer algo hoy?» y dé acciones concretas. El detalle técnico queda a un toque, no en la cara.
2. **Reclamos:** los reportes vecinales pasan a tener estado (nuevo → en atención → resuelto / descartado), historial y seguimiento. Operaciones los gestiona; los vecinos ven los del día y pueden filtrar por fecha.
3. **Demanda y dotación:** estimar cuántas intervenciones por anegamiento esperar con la lluvia prevista y cuánta gente hace falta, con el método y la incertidumbre a la vista.
4. **Alertas oficiales:** sumar las alertas del SMN para el departamento Rosario y la altura de los arroyos Ludueña y Saladillo, que COTA no tenía (ver el relevamiento del sitio El Niño de Santa Fe).

## Hallazgos que condicionan el plan

- **La web de la Provincia no publica reclamos.** El sitio El Niño muestra alertas, ríos, lluvias, rutas, comités y partes del Centro de Monitoreo, pero no reclamos de vecinos. El histórico que sí existe es el de **intervenciones de Defensa Civil de Rosario** (datos abiertos municipales, 2021-01 a 2024-01), que COTA ya tiene agregado en `public/data/civil-defense.json` (mensual, por distrito, con la lluvia del mes). Se usa como **histórico de reclamos** para contexto y para el modelo de demanda. Con granularidad mensual no se pueden mostrar reclamos de un día puntual de ese período.
- El portal `datosabiertos.rosario.gob.ar` no responde desde este entorno (timeout): no se regenera el histórico. Se usa el snapshot existente con su fecha.
- Los reportes actuales se borran a las 24 h y operaciones es solo lectura. Hay que conservar el historial.
- El panel de operaciones es público. **Toda acción de gestión requiere autenticación de operador.**
- Regla del usuario: **nada de datos inventados.** Fixtures de tests solo a partir de respuestas reales guardadas, o construidos en el test, sin mostrarse en la app.

## Principios de UX para vecinos

- **Una respuesta, luego acciones, luego detalle.** Titular en lenguaje llano, una oración de por qué, de 1 a 3 botones de acción.
- **Sin jerga.** Prohibido en la interfaz de vecinos: «datos consultados», «evaluación parcial», «umbral estimado», «grado 0–5», «exposición», «señal» y nombres de modelos. Si falta un dato: «No tenemos el dato del río ahora; no podemos asegurar que esté todo bien».
- **Cada bloque responde a «qué significa para mí» y a «qué hago».** Si no tiene acción ni cambia una decisión, va al detalle.
- **Faltante ≠ normal.** Nunca mostrar «normal» cuando falta una fuente.
- **Hora local y frescura en cada dato** («río: hace 2 h»).
- Celular primero (de 320 a 430 px), objetivos táctiles de 44 px, contraste AA y foco visible.

## Unidades

### Fase 1, en paralelo y con archivos separados

**A · Reclamos: datos, API y acceso de operadores**
Archivos: `src/lib/reports.ts`, `src/lib/reportTypes.ts`, `src/lib/opsAuth.ts` (nuevo), `src/app/api/reports/**`, `src/app/api/ops/**` (nuevo), `tests/reports*.test.ts`, `tests/ops-auth.test.ts`.
- Modelo: `status: "new" | "in_progress" | "resolved" | "dismissed"`, `statusAt`, `resolvedAt?`, `district` (calculado al crear), `publicNote?` (≤140) y un historial privado `history[{status, at, by, note?}]`.
- Conservación: no se borra a las 24 h. Abiertos, máximo 500. Migra los registros viejos sin estado a `new`. Escritura atómica y serializada, como hoy.
- Público: `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&status=` (por defecto, el día argentino de hoy; rango máximo de 366 días; hasta 2000 filas) sin historial privado ni `by`. `GET /api/reports/:id`, para seguimiento. Solo se pueden confirmar los reclamos no resueltos.
- Operadores: `COTA_OPS_KEY` (si falta, la gestión queda deshabilitada con un mensaje claro). `POST /api/ops/session {key, name}` emite una cookie HttpOnly, SameSite=Strict, Secure en producción, firmada con HMAC y válida 12 h; `DELETE` la cierra. Comparación en tiempo constante, límite de intentos por IP y verificación de `Origin` en los métodos que modifican. `GET /api/ops/reports` (con historial), `PATCH /api/ops/reports/:id {status, note?, publicNote?}` con transiciones válidas, y `GET /api/ops/reports.csv`.
- Aceptación: tests de migración, transiciones, filtros de fecha en hora argentina, auth (sin cookie da 401, cookie alterada da 401, origen ajeno da 403), que el CSV escape fórmulas y que lo público no filtre datos privados.

**B · Demanda esperada y dotación (biblioteca)**
Archivos: `src/lib/forecast/demand.ts` (nuevo), `tests/demand.test.ts`.
- Ajusta, sobre `civil-defense.json`, la relación mensual entre lluvia y casos de anegamiento (ciudad y por distrito). Elegir el modelo más simple que gane en validación leave-one-out frente a la línea base «casos por mm». Reportar el error LOO y los intervalos por cuantiles de residuos o bootstrap.
- Lleva la lluvia prevista (24 y 48 h, de `fetchRainOutlook`) a intervenciones esperadas, con rango, y documenta la extrapolación de mes a evento como supuesto fuerte.
- Reparte por distrito según las proporciones históricas.
- Dotación: `cuadrillas = ceil(casosAltos / (intervencionesPorCuadrillaPorTurno × turnos))`, con parámetros editables y marcados como **supuestos a validar con Defensa Civil**. No inventar un valor «oficial».
- El río (`river-history.json`) entra solo si mejora el LOO; si no, se informa como factor de escalamiento cualitativo.
- Ficha del modelo: datos, período, n, error, límites y fecha de cálculo.

**C · Alertas SMN y arroyos urbanos**
Archivos: `src/lib/provincial.ts` (nuevo), `src/lib/sources.ts` (agregar la fuente), `src/lib/liveSources.ts` (política de frescura), `src/lib/status.ts` (exponer `alerts` y `streams` con su falla), `tests/provincial.test.ts`.
- Primero probar el SMN oficial; si no hay un endpoint usable sin credenciales, usar `https://www.santafe.gob.ar/ms/elnino/wp-json/elnino/v1/alertas` y `/parana`, citando «SMN, vía Gobierno de Santa Fe».
- Filtrar el departamento Rosario, marcar `shortTerm`, normalizar la hora a Argentina y validar el esquema de forma defensiva (los `niveles` llegan como objeto o como arreglo).
- Arroyos: Ludueña (Logaritmo, Circunvalación) y Saladillo (Piñero, Candelaria, Arminda, Villada), con umbral solo si viene en la fuente, tendencia y hora de lectura. Si la fuente falla o no responde, se informa «sin dato», nunca «normal».

### Fase 2, en paralelo, después de A, B y C

**D · Interfaz de vecinos** (`src/app/(residents)/**`, `src/components/residents/**`, `src/components/reports/**`, `src/lib/residents.ts`, componentes nuevos en `src/components/residents/`)
- Inicio («Ahora»): tarjeta-respuesta, alerta SMN si la hay, «Hoy en Rosario» (reclamos de hoy: recibidos, en atención, resueltos), río y lluvia en una línea cada uno con tendencia y frescura, y «Cómo lo calculamos» plegado (factores, zonas a 48 h, fuentes).
- Nueva pestaña **Reclamos**: Hoy, Ayer, 7 días o un rango; filtro por estado y tipo; lista con línea de tiempo del estado y nota pública; el mapa con el color del estado. «Mis reportes», guardados en el dispositivo, con su estado. Para fechas anteriores al registro propio, mostrar el histórico mensual de Defensa Civil del distrito y aclarar la granularidad.
- Reportar: se mantiene el flujo; al terminar, ofrece el seguimiento («Lo vas a ver en Reclamos»).
- Revisar el mapa vacío en celular (los tiles no se veían en la captura del 13/11).

**E · Operaciones** (`src/app/operaciones/**`, `src/components/panel/**`, componentes nuevos en `src/components/ops/`)
- `Reclamos` (reemplaza la sección Reportes de solo lectura): login de operador, contadores del día y tiempo medio hasta resolver, filtros (fechas, estado, tipo, distrito), acciones de estado con nota y nota pública, exportación CSV.
- `Demanda` (nueva): intervenciones esperadas a 24 y 48 h con rango, por distrito, dotación con supuestos editables, histórico de lluvia contra casos con el ajuste y la ficha del modelo.

### Fase 3 · Verificación (Opus)
`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` y `git diff --check`. Navegador a 320, 375 y 1280 px: flujo de reporte, cambio de estado desde operaciones visto del lado vecino, filtros de fecha y demanda. Consola limpia. Se borran los reportes de prueba.

## Fuera de alcance
Notificaciones push, base de datos (el JSON alcanza para el piloto; migrar si crece), integración con la Guardia de Bomberos (`feat/guardia-m1`) y publicación (push o deploy) sin un pedido explícito.
