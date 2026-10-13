# Alcance de Cota como demo

Actualización: 13 de octubre de 2026.

Cota permite explorar cómo combinar lecturas, modelos, cartografía y reportes. La calidad de todas las fuentes, la cobertura de todos los eventos y la precisión de los resultados no están garantizadas. Esta versión no tiene validación operativa.

## Qué representa cada dato

| Insumo | Naturaleza y límite |
| --- | --- |
| Altura y umbrales del INA | Lectura de una estación y umbrales publicados. La app rechaza una lectura de Rosario de más de 48 horas o más de 15 minutos en el futuro. Consulta y medición se muestran por separado. |
| Open-Meteo | Pronóstico y condiciones modeladas. La lluvia pasada del balance también viene de un modelo; no equivale a un pluviómetro local. |
| GloFAS | Caudal de una celda del modelo global. La celda del canal no representa cada tramo del río. |
| Cartografía municipal | Snapshots de áreas inundables y riesgo climático de 2024. La rasterización de la segunda capa limita la precisión de una consulta puntual. |
| Relieve | Transformación propia de un modelo de elevación; no mide calles ni profundidad del agua. |
| Defensa Civil | Registro incorporado de enero de 2021 a enero de 2024, agregado por mes y distrito. No prueba la cobertura de todos los eventos ni la vigencia del portal municipal. |
| Reportes | Aportes públicos sin verificar, activos durante 24 horas. Ausencia de aportes no descarta agua. |

Los umbrales de lluvia y los pesos por zona son reglas de esta demo, sin calibración operativa. Un color verde significa que los factores utilizables no superan esos umbrales. El gris indica evaluación incompleta. Si un factor disponible muestra una señal elevada se conserva y se indica que la evaluación es parcial.

## Modelos exploratorios

- Poisson se ajustó y evaluó con registros mensuales. La adaptación a siete días y el reparto por día/distrito no tienen validación a esas escalas. Se conservan como ejemplos ilustrativos y no se publican porcentajes de probabilidad de anegamiento. El MAE mensual no es una banda de incertidumbre; hace falta estudiar sobredispersión y calibración.
- Gumbel es una referencia de extremos ajustada al archivo histórico. Un período de retorno no fija la próxima fecha de una tormenta.
- La tendencia del río supone que continúa un ritmo reciente. El ajuste altura–caudal refleja una relación histórica. Sus bandas muestran dispersión del ajuste, no intervalos predictivos calibrados.
- El snapshot original de lluvia no fijó el parámetro `models`; se corrigió su atribución para no asegurar que todo fuera ERA5. Los scripts ahora fijan ERA5 para futuras reconstrucciones. Los coeficientes existentes no se recalcularon.

## Contrato y operación

Las vistas y APIs dinámicas consultan sin caché. Abrir una vista, pulsar Actualizar o el refresco de cinco minutos mientras la página está visible vuelve a consultar; no asegura que una fuente haya publicado datos nuevos. Las horas meteorológicas incluyen el desplazamiento UTC devuelto por la fuente.

Los datos requeridos ausentes no se sustituyen por cero. Se verifica cobertura de 48 horas y siete días consecutivos. `nivel: null`, `incompleto` y `fallas` representan las ausencias. Las APIs usan HTTP 200 para respuestas utilizables, con evaluación parcial explícita, y 503 cuando no hay datos utilizables del bloque; HTTP 206 se reserva para contenido parcial por rangos. `/api/reportes` conserva `ok: false` al fallar. Estas modificaciones cambian el contrato de nulabilidad respecto a la versión anterior.

El acumulado mensual muestra el último día disponible y si la cobertura es parcial. No prueba saturación del suelo. Los indicadores de red y cadena del Paraná excluyen lecturas de más de 48 horas.

Reportes: se valida contra los polígonos de distritos cubiertos; escritura temporal y reemplazo atómico; confirmación idempotente por reporte/conexión. El JSON público no expone claves internas. La cola y el control de frecuencia son por proceso: mantener una sola instancia escritora y un volumen persistente. Las cabeceras de IP deben venir de un proxy confiable. No hay verificación de identidad, autenticación ni moderación humana. Un JSON corrupto provoca un error sin sobrescribirlo.

El deploy de `main` depende de build, tipos, lint y pruebas exitosos para ese mismo commit. La guía `/como-funciona` es estática y funciona si fallan las fuentes externas.

## Antes de uso operativo

Contrastar con registros locales recientes, acordar un uso con los organismos responsables y medir error a la escala de cada decisión. Revisar fuentes, licencias, modelos, moderación y operación antes de ampliar el alcance. Estas tareas están pendientes; una compilación correcta no las valida.
