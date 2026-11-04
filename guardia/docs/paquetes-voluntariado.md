# Paquetes para implementadores voluntarios

Propuesta para que el voluntariado tecnológico (implementadores de IA formados con la Fundación) devuelva horas sin depender de personas específicas. Cada paquete se puede tomar con el entorno local (PGlite, datos ficticios), tiene criterio de aceptación verificable y requiere revisión de un mantenedor antes de integrarse. El acceso a operación real y material reservado no forma parte de ningún paquete.

| Paquete | Alcance | Aceptación | Depende de |
|---|---|---|---|
| P1 · Bandeja de incidentes | UI de listado con filtros, detalle con historial y transiciones. | Conflicto de versión visible; motivo obligatorio al cerrar/reabrir. | — |
| P2 · Exportación de resumen | CSV del resumen por período y corte. | Concilia con `IncidentService.summary`. | — |
| P3 · Transcriptor local | Adaptador `Transcriber` sobre un servicio local (p. ej. faster-whisper). | Segmentos con inicio/fin; falla sin perder el texto. | Política de audio aprobada. |
| P4 · Extracción con IA | Adaptador `FieldExtractor` que sólo devuelve candidatos con evidencia. | Mismo set de pruebas que las reglas; nunca completa sin fuente. | Proveedor y datos autorizados. |
| P5 · Métricas O5 | Base implementada. Pendiente: umbrales configurables desde la UI y comparación entre períodos. | Concilian con eventos de origen. | Definiciones de guardia. |
| P6 · Portón O4 | Base implementada. Pendiente: alta y baja de móviles desde la UI y reporte de movimientos a revisar. | Doble escaneo conciliado; cámara fuera de servicio no bloquea. | Inventario real de móviles. |
| P7 · Recordatorio por canal interno | Envío del recordatorio CRM al canal que defina administración. | Un aviso por tarea y vencimiento; el tablero sigue siendo respaldo. | Canal aprobado. |

Reglas para cada aporte: rama propia, pruebas nuevas en `tests/`, `npm test`, `npm run typecheck` y `npm run build` en verde, sin datos reales ni secretos en el repo.
