# Estado por frente · Masterplan v2

Corte: 4 de noviembre de 2026. Escala: pendiente · implementado localmente · validado con muestras · validado en prueba · habilitado en producción.

## M0 · Baseline (F0)

| Ítem | Estado | Evidencia |
|---|---|---|
| Cota: checkout y baseline | Relevado | Rama `codex/cota-desarrollo-territorial` sobre `8992208`, con 2 archivos sin commit (`src/lib/risk.ts`, `tests/risk-models.test.ts`) que se conservan. `npm test` 78/78, `typecheck` y `lint` sin errores, `git diff --check` limpio. |
| Bitácora de Juan | **Bloqueado** | No hay checkout ni instancia disponible en este equipo. Ver pedido 1. Si su base resuelve B1, este repo se integra o se reduce a mesa de radio + informes + CRM. |
| Bravo/Brau | **Bloqueado** | Sin contrato, versión ni API verificados. Primera entrega como herramienta complementaria: referencia manual a la intervención y exportación provisional. |
| Insumos del §5 | Pendientes | Ver pedidos más abajo. |

## M1 · Primer lote para el cuartel

| Frente | Estado | Qué hay | Qué falta para avanzar |
|---|---|---|---|
| O1 · Bandeja y resúmenes | Implementado localmente | Alta que siempre guarda borrador, transiciones del §2.4 con versión (motivo al cerrar, reabrir o devolver a revisión), aislamiento por cuartel. Pantalla `/bandeja`: filtros por estado/abiertos, tipo, prioridad y sin ubicación; paginación; detalle con contacto e historial; aviso de conflicto entre operadores. Resumen por período y corte con reabiertos, pendientes sin ubicación, antigüedad y tipos; descarga CSV sin datos personales. | SLA acordado para calcular vencidos. Resumen programado y su destino (requiere canal autorizado). Respaldo/restauración probado con Postgres. |
| O2 · Ingreso bloqueante y despacho | Implementado localmente | Denunciante, teléfono y lugar se validan en servidor al despachar, con faltantes por campo. Excepción de jefatura auditada que deja el completado pendiente. Despacho idempotente. Referencia manual a Bravo/Brau. | Recorrido con radiooperador: paso exacto que bloquea, excepciones reales y tratamiento de urgencias con datos incompletos **antes de activar el bloqueo en guardia**. |
| O3 · Novedades, panorama y aviso a 10 min | Implementado localmente | Novedad, arribo, panorama, retorno. Arribo sin panorama queda pendiente. Aviso a los 10 min del despacho por job durable, sin duplicados, con relectura antes de emitir, acuse separado de la novedad y recuperación tras caída del worker. ETA se muestra como "sin base validada". | Jefes de guardia: qué reinicia el reloj, si se repite el aviso (`ALERTA_SEGUIMIENTO_MIN`, hoy apagado), a quién se escala. Registros reales para contrastar los 18–20 min de zona sur. |
| B1 · Bitácora por texto | Implementado localmente | Relato o transcripción → eventos candidatos con evidencia (fragmento o tramo de audio). Revisión de jefatura con versión. Cronología con pendientes. Exportación provisional JSON/CSV. | Revisión de la base de Juan. Transcriptor (interfaz lista, adaptador apagado). Bitácora cerrada anonimizada para medir tiempo y completitud. |
| B3 · Asistente de informes | Implementado localmente con **plantilla provisoria** | Extracción por reglas con evidencia por campo, precarga desde bitácora revisada (fuente "registro"), repreguntas sólo de faltantes, "desconocido con motivo", contradicciones horarias, revisiones conservadas, render determinístico con checksum, aprobación por persona distinta, sugerencias de casos previos sin copiar valores. | Plantilla vigente, informe aceptado anonimizado y circuito de entrega (pedido 3). Mientras la plantilla esté `pendiente_validacion` sólo se emiten borradores. Adaptador de IA para extracción: interfaz lista, apagado. |
| A1 · CRM seguimientos y reservas | Implementado localmente | Empresas, contactos, interacciones, tareas con recordatorio durable (una vez por vencimiento), reprogramación sin avisos obsoletos, tablero de vencidas/próximas. Eventos con capacidad, reservas concurrentes seguras, provisorias que vencen, referencia de pago única. | Planilla actual de administración. Fecha, capacidad y reglas de la fiesta del 2 de diciembre (no se cargaron datos: confirmar con administración). Lectura de Mercado Pago sólo con acceso autorizado. |
| O4 · Portón QR/manual | Implementado localmente | Inventario de móviles y portones. QR firmado (HMAC con `QR_SECRET`) e imprimible por jefatura; lector USB, cámara (BarcodeDetector) o carga manual con hora diferida. Sentido inferido, doble escaneo dentro de 2 min marcado como duplicado, vínculo con despacho sólo si hay un único candidato. Corrección de jefatura con motivo que conserva el original. | Ubicación y conectividad del portón, dispositivo lector, quién registra en cada turno y si hace falta cámara. Ventanas (doble escaneo, vínculo con despacho) a validar con guardia. |
| O5 · Métricas | Implementado localmente | `/metricas`: despacho→arribo, primera novedad, acuse de avisos (mediana, p90, máximo, casos medidos y excluidos), panoramas pendientes, movimientos sin confirmar y salidas sin despacho. Cada métrica muestra su definición. Umbrales configurables; sin umbrales no hay alertas. | Definiciones y umbrales acordados con jefes de guardia; aclarar que no son evaluación individual. Datos reales para contrastar los 18–20 min de zona sur. |
| C1 · Cota por barrio y evento | Implementado localmente en `feat/cota-c1` | Zonas oficiales con señal por zona, frescura de lluvia (vence a 1 h) y base declarada de cada escenario. 85/85 pruebas, typecheck y lint. | Revisión y PR. Verificar en navegador una dirección dentro de zona. |

## Verificación ejecutada

- `npm test`: 44/44 (PGlite = Postgres en WASM, reloj controlado).
- Portón en navegador (modo local): QR válido registra salida; segundo escaneo queda como doble escaneo; QR alterado rechazado; QR imprimibles sólo para jefatura (403 al operador); corrección con motivo conserva el original como `corregido`. `/metricas` carga con datos del recorrido.
- `npm run typecheck` y `npm run build`: sin errores ni advertencias.
- Recorrido manual en navegador (modo local, datos ficticios): llamada incompleta → despacho rechazado con faltantes → datos completos → despacho → móvil en mesa de radio. Relato libre → borrador con horas, lugar y móviles → preguntas de faltantes. CRM rechazado para el rol operador.
- No verificado: Docker Compose (Docker Desktop apagado en este equipo) y worker separado contra Postgres real.

## Decisiones tomadas en este corte

- Mismo repositorio que Cota, en `guardia/`, como paquete independiente: despliegue, base y permisos separados de la app pública. Cota lo excluye de `tsconfig` y `.dockerignore`. El código no contiene datos ni secretos; los datos operativos viven sólo en la base privada.
- PGlite para pruebas y arranque local sin Docker; Postgres con `pg` en Compose y producción. Mismo SQL.
- Identidad: usuarios ficticios sólo con `AUTH_MODE=dev-local` y fuera de producción. El piloto requiere el proveedor aprobado.
- Seguimiento posterior al primer aviso apagado por defecto hasta que guardia defina la regla.
- Plantilla de informe provisoria marcada como tal; bloquea versiones finales.

## Pedidos de insumos

1. **Juan:** repo o instancia de la bitácora, cómo se arranca, qué flujo ya funciona y ejemplos autorizados. Cierra F0 y define si B1 se reutiliza.
2. **Jefes de guardia:** recorrido de carga en Bravo/Brau; paso bloqueante y excepciones; qué reinicia el reloj de 10 min, repetición y escalamiento; formato del panorama (texto, audio, imagen); significado de "liberar personas".
3. **Jefatura / responsable de informes:** plantilla vigente para Fiscalía, informe aceptado y bitácora cerrada (anonimizados), campos obligatorios, variantes, formato de entrega y revisor.
4. **Operaciones:** tiempos despacho→arribo por zona para validar ETA.
5. **Administración:** planilla de seguimiento de empresas, datos confirmados de la fiesta (fecha, capacidad, estado de la venta) y reglas de reserva.
6. **Fundación / voluntariado:** responsable de revisión por componente y criterio para asignar paquetes a implementadores (ver `docs/paquetes-voluntariado.md`).
