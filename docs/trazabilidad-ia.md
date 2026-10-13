# Registro de esta mejora con IA

Fecha: 13 de octubre de 2026. Herramienta: Codex en entorno local. Base revisada: `0093adc16d59f3aa7fa801573273f3b4fc5b18c8`. Rama: `codex/cota-demo-mejoras`.

## Pedido y decisiones humanas

El equipo solicitó relevar Cota para una capacitación y mejorar el producto en una rama nueva. Aclaró que, al no contar con todas las fuentes oficiales, no puede prometer la calidad de todos los datos y el producto sirve como demo.

Se adoptó ese alcance en la interfaz, las APIs y la documentación. Los siete pasos incorporados a la guía provienen del proceso informado por el equipo; la numeración inicial se completó con definir el problema. Las instrucciones originales utilizadas para construir Cota no están conservadas en este repositorio. No se reconstruyen como si fueran citas reales.

## Trabajo asistido por IA

- Revisión del código, endpoints de lectura y sitio publicado; identificación de divergencias temporales y supuestos de modelos.
- Corrección de horas, cobertura, nulabilidad, actualización del mapa y coherencia del conjunto de datos de cada vista.
- Revisión de textos, límites estadísticos, trazabilidad y guía de construcción.
- Validación y persistencia de reportes; dependencia entre los controles de CI y deploy.
- Actualización de dependencias compatibles, pruebas locales y revisión visual.

No se recalibraron los modelos contra nuevos eventos ni se modificaron sus coeficientes históricos. La atribución del reanálisis original se corrigió y se fijó ERA5 para futuras reconstrucciones.

## Validaciones y límites

Las pruebas automáticas cubren fechas y husos, valores faltantes, cobertura, estado parcial, redondeo de repartos, validación de reportes, confirmaciones, concurrencia dentro de un proceso, vencimiento y corrupción. Se ejecutan contra almacenamiento temporal aislado. Build, tipos y lint revisan la implementación; no validan precisión hidrológica ni confiabilidad de las fuentes.

La revisión de navegador y las comprobaciones HTTP locales quedan registradas en [verificación de esta versión](verificacion-demo.md). No se publicaron cambios ni se ejecutó el hook de deploy como parte de esta mejora.

Queda pendiente evaluación humana del producto, validación diaria/semanal/distrital, incertidumbre calibrada, moderación de reportes y operación con más de una instancia.

## Ajuste de navegación del 13 de octubre

El equipo señaló demora al cambiar de vista y pidió no generar datos dummy. Se midieron las fuentes reales, se paralelizaron consultas y se agregó reutilización acotada de sus respuestas, conservando timestamps. Se retiró el único aporte ficticio de la revisión anterior. Las mediciones, cambios y limitaciones están en [rendimiento de navegación](rendimiento-navegacion.md).
