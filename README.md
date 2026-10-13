<p align="center">
  <img src="src/app/icon.svg" width="72" alt="Cota" />
</p>

<h1 align="center">Cota · riesgo hídrico de Rosario</h1>

<p align="center">
  ¿Hay hoy riesgo de que el agua entre a las casas o corte las calles, y dónde?<br/>
  Demo para explorar lecturas, modelos y mapas de Rosario. La calidad de todas las fuentes y la precisión operativa no están garantizadas.
</p>

<p align="center">
  <a href="https://cota.pegasustudio.com">cota.pegasustudio.com</a> ·
  <a href="https://cota.pegasustudio.com/como-funciona">cómo funciona</a> ·
  <a href="https://cota.pegasustudio.com/api/estado">/api/estado</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-0b0c0e?logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-0b0c0e?logo=react&logoColor=61dafb" alt="React 19" />
  <img src="https://img.shields.io/badge/Leaflet-1.9-0b0c0e?logo=leaflet&logoColor=199900" alt="Leaflet" />
  <img src="https://img.shields.io/badge/datos-p%C3%BAblicos%20y%20verificables-5f9bb8" alt="datos públicos" />
  <img src="https://img.shields.io/badge/licencia-MIT-d2a13a" alt="MIT" />
</p>

<p align="center">
  <img src="docs/screenshots/vecinos.png" width="100%" alt="Vista Vecinos: mapa de Rosario con las zonas oficiales, el buscador de dirección y el semáforo del día" />
</p>

---

## Qué hace

Cota reúne información del INA, Open-Meteo, Copernicus, la Municipalidad y vecinos. También calcula indicadores y modelos propios. Su finalidad es educativa y exploratoria: las fuentes tienen distinta resolución, cobertura y calidad. Los controles de formato y vigencia no certifican exactitud. Si faltan factores, la evaluación es parcial y puede quedar sin nivel.

Ver [alcance de la demo](docs/demo-alcance.md) y [registro de uso de IA](docs/trazabilidad-ia.md).

| Vista | Para quién | Qué ofrece |
|---|---|---|
| **Vecinos** `/` | Cualquier persona | Semáforo del día con su motivo · buscador de dirección (zona oficial, riesgo por lluvias, historial del distrito, relieve) · reportes de vecinos estilo Waze · clima actual · consejos según el nivel |
| **Operaciones** `/operaciones` | Defensa Civil, distritos, prensa | Qué hacer ahora: recomendaciones por reglas con su porqué y parte de situación copiable · indicadores · Paraná aguas arriba de Corrientes a San Nicolás · simulador que pinta el mapa · red devuelta por el INA con fechas · caudal |
| **Predicciones** `/predicciones` | Mirar la semana | Escenario ilustrativo por distrito y día, sin calibración a esa escala · qué tan rara es la lluvia prevista · a dónde va el río |
| **Cómo funciona** `/como-funciona` | Todos | Guía que funciona sin fuentes en vivo: alcance, siete pasos de construcción, conceptos, fuentes y preguntas frecuentes |

<p align="center">
  <img src="docs/screenshots/operaciones.png" width="49%" alt="Vista Operaciones con indicadores, aguas arriba y simulador" />
  <img src="docs/screenshots/predicciones.png" width="49%" alt="Vista Predicciones con anegamientos esperados por distrito y día" />
</p>

## De dónde sale cada dato

| Fuente | Qué aporta | Cadencia |
|---|---|---|
| **INA** · GeoServer WFS público | Altura del Paraná en Rosario, tendencia, niveles oficiales de alerta y evacuación, red de estaciones devuelta por el servicio | Una lectura diaria en Rosario · en vivo |
| **Open-Meteo** | Lluvia pronosticada hora por hora, clima actual, lluvia caída (modelo) | Cada hora · en vivo |
| **GloFAS** · Copernicus vía Open-Meteo | Caudal del Paraná, 210 días atrás y 7 adelante | Diario · en vivo |
| **Archivo histórico** de Open-Meteo | Lluvia diaria y horaria desde 1940, para climatología y extremos | Cobertura explícita hasta el último día disponible |
| **Municipalidad de Rosario** · datos abiertos | 87 polígonos oficiales de áreas inundables (Ludueña y Saladillo), distritos, barrios, intervenciones de Defensa Civil por distrito y mes | Capas fijas · snapshot de Defensa Civil hasta enero de 2024 |
| **Municipalidad de Rosario** · InfoMapa | Mapa de Riesgo Climático 2024: afectación a vivienda por lluvias torrenciales, por radio censal | Capa fija |
| **Mapzen Terrain Tiles** | Modelo propio de puntos bajos del terreno · marcado como modelo | Capa fija |

Todo el detalle técnico (fórmulas, umbrales, endpoints, vigencia de cada dato) está al pie de cada vista en un bloque "Documentación" colapsado, y en los JSON públicos `/api/estado`, `/api/predicciones`, `/api/kpis`, `/api/recomendaciones` y `/api/reportes`.

## Cómo se decide el nivel

El nivel general combina dos factores utilizables. Con ausencia total o un único factor sin señales elevadas, el nivel es `null` (evaluación incompleta). Una señal elevada disponible se conserva con `incompleto: true`. La etiqueta normal es «Sin señales elevadas». Los umbrales de lluvia y las sensibilidades por zona no tienen calibración operativa.

 **Río:** la altura de hoy contra los niveles de alerta (5,00 m) y evacuación (5,25 m) que fija el INA para Rosario. **Lluvia concentrada:** la ventana de dos horas más cargada del pronóstico contra umbrales de 15 / 25 / 30 mm; esos umbrales son una estimación de este panel y están marcados como tales. Las 87 zonas oficiales se pintan con ese nivel, ponderado por su sensibilidad a la lluvia.

## Predicciones

Tres modelos ajustados con `npm run build:data` y evaluados en cada pedido con el pronóstico del momento. Cada uno publica su ajuste y su error.

- **Anegamientos** · regresión de Poisson de las intervenciones mensuales de Defensa Civil contra la lluvia horaria del snapshot de Open-Meteo, cuyo modelo no estaba fijado. Se prueban tres variables (total, pico de 2 h, ambas) y gana la que mejor predice meses que no vio; cualquier ajuste con coeficiente negativo se descarta. Se adapta de forma exploratoria a siete días y se reparte conservando el total redondeado. La validación es mensual; no se muestran probabilidades de anegamiento por día/distrito. El MAE mensual no es un intervalo de incertidumbre.
- **Lluvia extrema** · Gumbel sobre el máximo diario de cada año desde 1940: período de retorno del día más cargado del pronóstico y cuantiles de 2 a 100 años.
- **Río** · tendencia de mínimos cuadrados sobre 14 días (ritmo, días hasta alerta) y curva altura–caudal `h = a + b·ln(Q)` contra GloFAS buscando el mejor desfase de 0 a 10 días; cuando el ajuste es débil la página lo dice. Las bandas ±2σ son dispersión del ajuste, no intervalos predictivos calibrados.

## Reportes de vecinos

Cualquiera puede marcar en el mapa dónde ve agua (calle anegada, agua en viviendas, desagüe tapado, calle cortada), sin cuenta. Los reportes duran 24 h, se pueden confirmar y aparecen como gotas de color. Se validan contra los límites de Rosario y 140 caracteres, llevan un campo trampa, una confirmación por reporte y conexión, y cada conexión puede cargar 5 reportes y 20 confirmaciones por hora. Son aportes sin verificar. El conteo no mide cuántas personas distintas observaron el hecho. La escritura usa un archivo temporal y reemplazo atómico; si el archivo está corrupto, la API falla y conserva su contenido. La cola y los límites por conexión son por proceso: ejecutar una sola instancia escritora. Configurar el proxy para que las cabeceras de IP sean confiables; no se valida identidad.

## Correr en local

```bash
npm ci
npm run dev            # http://localhost:3000
```

Las capas ya están versionadas. `npm run build:data` vuelve a descargarlas y recalcula modelos: revisar fuentes, licencia y resultados antes de versionar una nueva instantánea. Los futuros archivos de lluvia histórica fijan `models=era5`; los coeficientes existentes no se recalcularon en esta mejora.

Verificaciones locales:

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

Producción:

```bash
npm run build && npm start -- -p 3000
```

O con Docker (imagen `node:22-alpine`, Next en modo standalone, reportes persistidos en el volumen `/data`):

```bash
docker build -t cota .
docker run -p 3000:3000 -v cota-data:/data cota
```

## Deploy

Los pull requests ejecutan build, tipos, lint y pruebas. Cada push a `main` ejecuta esos mismos controles; el job que dispara EasyPanel depende de que terminen bien para ese commit. El hook está en el secret `EASYPANEL_DEPLOY_HOOK`. La app vive en `cota.pegasustudio.com` detrás de Cloudflare.

## Datos y sus trampas

Cosas que costaron encontrar y conviene saber antes de tocar los scripts:

- El panel consume GeoServer WFS (`public2:ultimas_alturas_con_timeseries`). El INA también publica [documentación de su API](https://alerta.ina.gob.ar/a5/apiUI), cuyo acceso y contrato no se evaluaron para migrar esta demo. Algunas estaciones publican `nivel_de_alerta: 0`: los umbrales sólo se comparan cuando son mayores a cero. Tarda proporcional a los días pedidos (14 ≈ 3 s, 210 ≈ 55 s) y a veces cae con `pool error`; por eso la serie larga se versiona como instantánea y se fusiona con los últimos 14 días en vivo.
- GloFAS en las coordenadas del centro de Rosario devuelve 0,03 m³/s (celda sin cauce); se consulta la celda del canal (−32,975 / −60,675).
- El archivo municipal de áreas inundables se llama "Saladillo" pero tres cuartos de sus polígonos son del Ludueña.
- El mapa de riesgo climático no está en el portal de datos abiertos: vive en el WMS de InfoMapa, sin `GetFeatureInfo` ni WFS y con `GetMap` limitado a 2048 px. Se rasteriza, se rellenan los contornos y se reproyecta fila por fila a Mercator para poder consultarlo por dirección.
- Las intervenciones de Defensa Civil vienen por distrito y mes, publicadas hasta enero de 2024; el archivo 2021 usa otro formato y al 2022 le falta diciembre.
- El modelo de terreno usa la **mediana** del entorno, no la media: SRTM mide techos, y con la media una calle plana del microcentro leía 3 m "por debajo" de las torres de al lado. En manzanas densas no da lectura y lo dice.
- La IDE provincial y la capa de desagües de InfoMapa existen, pero no tienen datos dentro de Rosario.

## Estructura

```
scripts/           build:data → polígonos, terreno, riesgo climático, Defensa Civil, modelos, serie del río
src/app/           vistas (/, /operaciones, /predicciones, /como-funciona) y rutas /api
src/lib/           fuentes (river, rain, weather), riesgo, modelos (forecast/), kpis, reportes, lookup
src/components/    mapa, bottom sheet, deck de la guía, kpis, reportes
src/content/       textos de la guía
public/data/       capas procesadas, versionadas
```

## Licencia

MIT. Los datos pertenecen a sus organismos y se citan en cada vista.

Cota no es un servicio oficial de alerta. Ante una emergencia, Defensa Civil **103**.
