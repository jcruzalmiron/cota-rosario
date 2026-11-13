export interface SourceRef {
  id: string;
  agency: string;
  description: string;
  endpoint: string;
  portal: string;
  license: string;
  model?: boolean;
}

export const ROSARIO = { lat: -32.9468, lon: -60.6393 } as const;

export const PARANA_GLOFAS_CELL = { lat: -32.975, lon: -60.675 } as const;

export const INA_STATION = "Rosario";

export const SOURCES: Record<string, SourceRef> = {
  ina: {
    id: "ina",
    agency: "Instituto Nacional del Agua · Sistema de Información y Alerta Hidrológico",
    description: "Altura del río, tendencia y niveles oficiales de alerta y evacuación",
    endpoint: "https://alerta.ina.gob.ar/geoserver/ows?service=WFS&typeName=public2:ultimas_alturas_con_timeseries",
    portal: "https://alerta.ina.gob.ar/pub/mapa",
    license: "Datos públicos del INA",
  },
  openMeteo: {
    id: "openMeteo",
    agency: "Open-Meteo",
    description: "Precipitación horaria pronosticada sobre Rosario",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    portal: "https://open-meteo.com",
    license: "CC BY 4.0 · gratuito para uso no comercial",
  },
  weather: {
    id: "weather",
    agency: "Open-Meteo · condiciones modeladas",
    description: "Temperatura, humedad, presión y lluvia modeladas, con fecha de cobertura",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    portal: "https://open-meteo.com/en/docs",
    license: "CC BY 4.0 · gratuito para uso no comercial",
    model: true,
  },
  glofas: {
    id: "glofas",
    agency: "GloFAS · Copernicus, vía Open-Meteo",
    description: "Caudal diario modelado del Paraná frente a Rosario",
    endpoint: "https://flood-api.open-meteo.com/v1/flood",
    portal: "https://global-flood.emergency.copernicus.eu",
    license: "CC BY 4.0 · gratuito para uso no comercial",
  },
  smnAlerts: {
    id: "smnAlerts",
    agency: "Servicio Meteorológico Nacional, vía Gobierno de Santa Fe",
    description: "Alertas meteorológicas oficiales del SMN para el departamento Rosario. Los servicios del SMN no responden sin credenciales (503, 401 y 403 al 13/11/2026), así que se leen de la republicación provincial por departamento",
    endpoint: "https://www.santafe.gob.ar/ms/elnino/wp-json/elnino/v1/alertas",
    portal: "https://www.smn.gob.ar/alertas",
    license: "Datos públicos del SMN, republicados por el Gobierno de Santa Fe · servicio sin documentación pública",
  },
  provincialStreams: {
    id: "provincialStreams",
    agency: "Gobierno de Santa Fe · Recursos Hídricos e INA",
    description: "Altura, tendencia y hora de lectura de los arroyos Ludueña y Saladillo. El nivel de alerta se muestra solo en las estaciones donde la fuente lo informa",
    endpoint: "https://www.santafe.gob.ar/ms/elnino/wp-json/elnino/v1/parana",
    portal: "https://www.santafe.gob.ar/ms/elnino/",
    license: "Datos públicos del Gobierno de Santa Fe · servicio sin documentación pública",
  },
  floodZones: {
    id: "floodZones",
    agency: "Municipalidad de Rosario · Secretaría de Planeamiento",
    description: "Polígonos oficiales de áreas inundables de las cuencas del Ludueña y del Saladillo",
    endpoint: "https://datosabiertos.rosario.gob.ar/sites/default/files/uploaded_resources/zonas_inundables_saladillo_json.csv",
    portal: "https://datosabiertos.rosario.gob.ar",
    license: "Datos abiertos municipales",
  },
  climateRisk: {
    id: "climateRisk",
    agency: "Municipalidad de Rosario · Mapas de Riesgo Climático 2024",
    description: "Mapa municipal de riesgo climático de 2024; capa territorial con resolución limitada para la consulta puntual",
    endpoint: "https://infomapa.rosario.gob.ar/wms/ambiente?LAYERS=riesgo_vivienda_precipita",
    portal: "https://www.rosario.gob.ar/inicio/mapas-de-riesgo-climatico-rosario-2024",
    license: "Capa pública de InfoMapa · elaborada con NAP Global Network y la Dirección Nacional de Cambio Climático",
  },
  civilDefense: {
    id: "civilDefense",
    agency: "Municipalidad de Rosario · Defensa Civil",
    description: "Registros de anegamientos atendidos por distrito y mes, enero de 2021 a enero de 2024, relacionados con la lluvia mensual del archivo de Open-Meteo",
    endpoint: "https://datosabiertos.rosario.gob.ar/dataset/intervenciones-defensa-civil",
    portal: "https://datosabiertos.rosario.gob.ar",
    license: "Datos abiertos municipales · lluvia histórica vía Open-Meteo, CC BY 4.0",
  },
  models: {
    id: "models",
    agency: "Modelos estadísticos de este panel",
    description: "Escenarios estadísticos basados en registros mensuales, lluvia histórica y caudal. Distribución semanal orientativa y tendencias del Paraná",
    endpoint: "/data/models.json",
    portal: "/operaciones/pronostico",
    license: "Calculado en este panel sobre datos públicos · no es pronóstico oficial",
    model: true,
  },
  terrain: {
    id: "terrain",
    agency: "Modelo propio sobre Mapzen Terrain Tiles (SRTM, GMTED2010, ETOPO1)",
    description: "Puntos bajos del terreno: cuánto más bajo está cada punto que la mediana de su entorno. No es una designación oficial",
    endpoint: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    portal: "https://registry.opendata.aws/terrain-tiles/",
    license: "Dominio público y CC0 según fuente · procesado en este panel",
    model: true,
  },
};

export const FLOODHUB_SOURCE: SourceRef = {
  id: "floodHub",
  agency: "Google Flood Hub · Flood Forecasting API",
  description: "Caudal pronosticado del Paraná frente a Arroyo Seco con umbrales propios del modelo, y alertas de crecidas repentinas",
  endpoint: "https://floodforecasting.googleapis.com/v1",
  portal: "https://sites.research.google/floods",
  license: "CC BY 4.0 · uso no comercial · requiere clave aprobada por Google",
  model: true,
};

export function floodHubEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.FLOODHUB_API_KEY?.trim());
}

export function activeSources(env: Record<string, string | undefined> = process.env): Record<string, SourceRef> {
  return floodHubEnabled(env) ? { ...SOURCES, floodHub: FLOODHUB_SOURCE } : SOURCES;
}
