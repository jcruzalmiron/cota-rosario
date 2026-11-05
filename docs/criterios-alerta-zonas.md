# Criterios de alerta por zona · v0-provisorio

Cada zona oficial de áreas inundables (A, B, C, D, 1, 2, 3) recibe un grado de 0 a 5. El mapa, la búsqueda y Mi zona muestran qué fuente aporta cada punto. El código está en `src/lib/zoneAlert.ts`.

| Grado | Nombre | Nivel general equivalente |
| --- | --- | --- |
| 0 | Sin señales elevadas | normal |
| 1 | Leve | atención |
| 2 | Atención | atención |
| 3 | Alerta | alerta |
| 4 | Alerta alta | alerta |
| 5 | Crítico | crítico |

## Reglas

1. **Base: lluvia concentrada prevista.** Es el pronóstico regional de Open-Meteo para toda la ciudad. No es una medición en la zona.
   - Por debajo de 7,5 mm en 2 h: 0.
   - Desde 7,5 mm: 1.
   - Desde 15 mm: 2.
   - Desde 25 mm: 3.
   - Desde 30 mm: 5.

   Los cortes de 15, 25 y 30 mm son los umbrales orientativos que el panel ya usaba. El de 7,5 mm es la mitad del umbral de atención y solo distingue lluvia leve de nada.
2. **Sensibilidad de la zona: +1, solo si la base es al menos 1.** El dato sale del mapa municipal de riesgo climático 2024, capa de vivienda y hábitat ante precipitaciones torrenciales.
   - **Más sensible:** una zona lo es cuando su proporción de superficie con riesgo medio o alto supera la del conjunto de zonas oficiales, que hoy es del 52 %.
   - **Cobertura mínima:** si una zona tiene menos de 500 celdas del mapa, no se marca.
   - **Cómo se calcula:** `scripts/build-zone-sensitivity.mjs` genera `public/data/zone-sensitivity.json`.
   - **Resultado actual:**
     - A, B y C son más sensibles, con un 99–100 % de su superficie en riesgo medio o alto.
     - 1, 2 y 3 no lo son: 31–47 %.
     - D tiene cobertura insuficiente.
3. **Paraná alto con lluvia: +1, como supuesto.** Suma un paso solo si el INA marca alerta o evacuación y además la base es al menos 2.
   - La idea es que, con el río alto, los arroyos desaguan peor. Es un supuesto que todavía hay que validar con datos de la cuenca.
   - El río solo nunca pinta una zona.
4. **Reportes vecinales activos dentro de la zona (últimas 24 h).**
   - Con al menos uno, la zona queda como mínimo en 1.
   - **Reporte fuerte:** uno de agua en viviendas, o tres de cualquier tipo. Con un reporte fuerte, la zona suma 1 y queda como mínimo en 2.
   - Los reportes no están verificados y así se muestran.
5. **Sin pronóstico vigente ni reportes:** la zona queda sin grado (gris punteado). Su exposición se mantiene.

El grado máximo es 5.

## Simulador

El simulador aplica las reglas 1 a 3. No usa reportes.

## Qué falta para calibrar

- **Estación del Ludueña (COTA-03):** permitiría reemplazar el supuesto de la regla 3 por una señal medida en la cuenca.
- **Reclamos municipales (COTA-02):** con fecha, ubicación y una definición estable, permitirían contrastar cada grado con eventos reales por zona.
- **Revisión de cortes y pesos:** los cortes y pesos de esta versión no están ajustados con eventos medidos. Cada cambio de criterio sube la versión (`ALERT_CRITERIA_VERSION`).
