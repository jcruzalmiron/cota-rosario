# Demora al cambiar de vista

Fecha: 13 de octubre de 2026. Servidor local standalone, Node 22.23.1 y Next 16.3.8. Base: `99f9d9d`.

## Causa observada

Cada vista esperaba las fuentes externas. Operaciones y Predicciones empezaban consultas adicionales después de que terminara el estado básico. El INA tardó 3.033 ms en devolver Rosario y la red; las otras consultas de esa medición demoraron entre 1.125 y 1.219 ms. El estado de carga también reemplazaba la navegación por un mensaje sin menú.

## Cambios

- Respuestas reales y válidas compartidas en memoria durante hasta 60 segundos, con la fecha de consulta original.
- Una petición concurrente por fuente y ventana. Se descartan errores; no se usa una respuesta vencida como fallback.
- Las claves cambian cada hora para recalcular las ventanas de lluvia y los días del pronóstico. El almacenamiento está limitado a 32 entradas por proceso.
- Consultas independientes del estado, indicadores y predicciones iniciadas en paralelo.
- Navegación y aviso de alcance visibles durante la carga; se puede cambiar de vista sin esperar a la anterior.
- Actualizar y el refresco automático invalidan la memoria de fuentes antes de consultar. Las APIs conservan `cache-control: no-store` para el navegador.
- Los reportes siguen leyéndose desde su almacenamiento, sin reutilizar sus listas dentro de esta memoria de fuentes.

## Mediciones reales

Se midió desde el inicio de `fetch` HTTP hasta completar el cuerpo de la respuesta, contra el mismo servidor local. No son tiempos medidos desde un clic hasta el último dibujo del mapa.

| Vista | Antes | Después, primera visita de la secuencia | Después, regreso dentro de 60 s |
| --- | ---: | ---: | ---: |
| Vecinos | 2.816 ms | 3.325 ms, proceso recién reiniciado | 15 ms |
| Operaciones | 3.994 ms; regreso 4.041 ms | 1.290 ms, con estado básico disponible | 46 ms |
| Predicciones | 3.298 ms | 81 ms, con fuentes ya consultadas en Operaciones | 49 ms |

La primera carga sigue dependiendo de la red y las fuentes. Los tiempos pueden variar; la mejora de los regresos depende de que exista una respuesta real vigente en el mismo proceso.

Dos consultas consecutivas a `/api/estado` tardaron 2.786 y 12 ms y conservaron exactamente los timestamps originales del río y la lluvia, sin fallas. Una medición nativa de lluvia mostró 1.237 ms en su primera consulta, 0 ms al reutilizarla y 294 ms después de invalidar la memoria; esta última conservó el valor real y obtuvo un nuevo timestamp de consulta.

## Datos ficticios y comprobaciones

Se retiró exclusivamente el aporte local `1bba6597-3826-44b6-8f0d-94003cea0a2a`, creado en la revisión anterior y marcado como prueba ficticia. No había otros aportes en ese archivo. La API confirmó después cero aportes registrados y ausencia de ese identificador. No se generaron nuevos aportes, fixtures ni respuestas simuladas para este ajuste.

Build, tipos y lint correctos. No se añadieron ni ejecutaron pruebas unitarias en este ajuste. La revisión de clics y capturas quedó bloqueada por la política del navegador integrado tras el reinicio; la verificación de rendimiento se hizo por HTTP y con las funciones reales de las fuentes.

La memoria de fuentes es por proceso; no sincroniza instancias distintas. Un error de fuente mantiene el tratamiento de datos no disponibles. Esta mejora no certifica la precisión de los datos ni modifica los modelos.
