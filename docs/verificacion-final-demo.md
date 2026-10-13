# Revisión posterior al ajuste de navegación

Fecha: 13 de octubre de 2026. Rama `codex/cota-demo-mejoras`, sobre `8dab48d`. Windows, Node 22.23.1, Next 16.3.8. Compilación standalone local en `http://127.0.0.1:3201/`.

El equipo pidió comprobar la última versión. Se usaron las fuentes reales del producto. No se crearon reportes ficticios ni se sustituyeron respuestas de las fuentes.

## Problema observado y corrección

Una pestaña de Operaciones conservaba 1,3 mm en el control del simulador después de recibir una nueva lluvia de 0,4 mm. El panel decía «escenario simulado», pero el mapa no tenía un escenario activo. El estado local del control había sobrevivido al refresco de sus datos iniciales.

El simulador ahora se reinicia cuando cambia su referencia real de altura, lluvia o umbrales. Los controles permiten centésimas de metro y décimas de milímetro, y sus rangos incluyen el valor real recibido. Si falta la lluvia necesaria, el simulador indica que no puede iniciar; no supone cero. Un umbral de evacuación ausente se conserva como no disponible.

## Comandos y respuestas

| Control | Resultado en esta revisión |
| --- | --- |
| `npm run build` | Correcto. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npx tsx --test tests/data.test.ts tests/risk-models.test.ts tests/lookup.test.ts tests/recommendations.test.ts` | 12 pruebas correctas, sin fallas. |
| `npm audit --omit=dev --json` | 0 vulnerabilidades reportadas en dependencias de producción. |
| `npm audit --json` | Persisten 5 avisos altos en herramientas de desarrollo, documentados en la [primera revisión](verificacion-demo.md). |
| `git diff --check` | Correcto. |

Las pruebas de lógica emplean entradas en memoria; no generan datos en el producto. Se excluyó `tests/reports.test.ts`, que escribe reportes ficticios en almacenamiento temporal. La escritura y confirmación de reportes no se volvieron a probar en esta revisión.

Las APIs de estado, indicadores, predicciones, recomendaciones y reportes respondieron HTTP 200 con `cache-control: no-store`. La lectura de Rosario fue consistente entre las vistas: 3,31 m. Las fechas de Predicciones fueron del 13 al 19 de octubre de 2026; las probabilidades diarias de anegamiento continuaron en `null`. Los reportes públicos no expusieron claves internas y tanto la API como el archivo local terminaron con cero aportes.

Estos valores son observaciones de las consultas de revisión, no valores garantizados para consultas posteriores.

## Navegador

Se completó la revisión de clics que había quedado pendiente en el [ajuste de navegación](rendimiento-navegacion.md).

- Vecinos, Operaciones, Predicciones y la guía abrieron desde los enlaces visibles. Durante la espera de fuentes siguieron disponibles el menú y el aviso de demo.
- Actualizar ejecutó el refresco y avanzó la hora de consulta. El simulador mantuvo la referencia real de 3,31 m y 0,4 mm, sin una simulación activa.
- El control del río a 7 m cambió el mapa al color crítico (`#d4483f`) y mostró su aviso de simulación. Restablecer recuperó 3,31 m, 0,4 mm y el color de la consulta (`#46a06b`); el botón quedó deshabilitado.
- Copiar mostró «Copiado». No se envió el resumen a terceros.
- La lista vacía de reportes indicó que no había aportes y que eso no descarta agua en la zona. No se envió el formulario.
- La búsqueda «Rosario» filtró la red del INA a tres coincidencias reales. Se retiró el filtro al terminar.
- La guía abrió en `#alcance` e incluyó los siete pasos de construcción y los límites del producto.
- Se revisó escritorio a 1280 × 800 y móvil a 390 × 844. En móvil el panel se expandió y el ancho de la página se mantuvo en 390 px. Las tablas de Predicciones y Operaciones tuvieron desplazamiento horizontal dentro de su contenedor, sin desbordar la página. La guía también mantuvo 390 px.
- El navegador no registró errores de consola en el recorrido final. Se restauró su tamaño habitual y se dejó Operaciones sin filtros ni escenarios activos.

Las capturas y respuestas reales de revisión se conservaron fuera del repositorio, en los artefactos locales de auditoría.

## Límites pendientes

La renovación de 210 días del INA siguió devolviendo HTTP 504 en el proceso local anterior. Las consultas recientes funcionaron; la serie larga continúa usando el snapshot real guardado, fusionado con lecturas recientes. No se considera comprobada la renovación completa de ese histórico.

Esta revisión no valida precisión hidrológica, calibración de modelos, cobertura de todos los eventos ni exactitud de cada fuente. Tampoco ejecutó GitHub Actions, Docker o el deploy en EasyPanel. Los cambios quedan locales hasta su publicación. La moderación de reportes y la escritura con múltiples instancias siguen pendientes.
