export interface SourceRef {
  id: string;
  organismo: string;
  descripcion: string;
  endpoint: string;
  portal: string;
  licencia: string;
  modelo?: boolean;
}

export const ROSARIO = { lat: -32.9468, lon: -60.6393 } as const;

export const PARANA_GLOFAS_CELL = { lat: -32.975, lon: -60.675 } as const;

export const INA_STATION = "Rosario";

export const SOURCES: Record<string, SourceRef> = {
  ina: {
    id: "ina",
    organismo: "Instituto Nacional del Agua · Sistema de Información y Alerta Hidrológico",
    descripcion: "Altura del río, tendencia y niveles oficiales de alerta y evacuación",
    endpoint: "https://alerta.ina.gob.ar/geoserver/ows?service=WFS&typeName=public2:ultimas_alturas_con_timeseries",
    portal: "https://alerta.ina.gob.ar/pub/mapa",
    licencia: "Datos públicos del INA",
  },
  openMeteo: {
    id: "openMeteo",
    organismo: "Open-Meteo",
    descripcion: "Precipitación horaria pronosticada sobre Rosario",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    portal: "https://open-meteo.com",
    licencia: "CC BY 4.0 · gratuito para uso no comercial",
  },
  clima: {
    id: "clima",
    organismo: "Open-Meteo · condiciones modeladas",
    descripcion: "Temperatura, humedad, presión y lluvia modeladas, con fecha de cobertura",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    portal: "https://open-meteo.com/en/docs",
    licencia: "CC BY 4.0 · gratuito para uso no comercial",
    modelo: true,
  },
  glofas: {
    id: "glofas",
    organismo: "GloFAS · Copernicus, vía Open-Meteo",
    descripcion: "Caudal diario modelado del Paraná frente a Rosario",
    endpoint: "https://flood-api.open-meteo.com/v1/flood",
    portal: "https://global-flood.emergency.copernicus.eu",
    licencia: "CC BY 4.0 · gratuito para uso no comercial",
  },
  areas: {
    id: "areas",
    organismo: "Municipalidad de Rosario · Secretaría de Planeamiento",
    descripcion: "Polígonos oficiales de áreas inundables de las cuencas del Ludueña y del Saladillo",
    endpoint: "https://datosabiertos.rosario.gob.ar/sites/default/files/uploaded_resources/zonas_inundables_saladillo_json.csv",
    portal: "https://datosabiertos.rosario.gob.ar",
    licencia: "Datos abiertos municipales",
  },
  riesgoClima: {
    id: "riesgoClima",
    organismo: "Municipalidad de Rosario · Mapas de Riesgo Climático 2024",
    descripcion: "Mapa municipal de riesgo climático de 2024; capa territorial con resolución limitada para la consulta puntual",
    endpoint: "https://infomapa.rosario.gob.ar/wms/ambiente?LAYERS=riesgo_vivienda_precipita",
    portal: "https://www.rosario.gob.ar/inicio/mapas-de-riesgo-climatico-rosario-2024",
    licencia: "Capa pública de InfoMapa · elaborada con NAP Global Network y la Dirección Nacional de Cambio Climático",
  },
  defensaCivil: {
    id: "defensaCivil",
    organismo: "Municipalidad de Rosario · Defensa Civil",
    descripcion: "Registros de anegamientos atendidos por distrito y mes, enero de 2021 a enero de 2024, relacionados con la lluvia mensual del archivo de Open-Meteo",
    endpoint: "https://datosabiertos.rosario.gob.ar/dataset/intervenciones-defensa-civil",
    portal: "https://datosabiertos.rosario.gob.ar",
    licencia: "Datos abiertos municipales · lluvia histórica vía Open-Meteo, CC BY 4.0",
  },
  modelos: {
    id: "modelos",
    organismo: "Modelos estadísticos de este panel",
    descripcion: "Escenarios estadísticos basados en registros mensuales, lluvia histórica y caudal. Distribución semanal orientativa y tendencias del Paraná",
    endpoint: "/data/modelos.json",
    portal: "/predicciones",
    licencia: "Calculado en este panel sobre datos públicos · no es pronóstico oficial",
    modelo: true,
  },
  terrain: {
    id: "terrain",
    organismo: "Modelo propio sobre Mapzen Terrain Tiles (SRTM, GMTED2010, ETOPO1)",
    descripcion: "Puntos bajos del terreno: cuánto más bajo está cada punto que la mediana de su entorno. No es una designación oficial",
    endpoint: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    portal: "https://registry.opendata.aws/terrain-tiles/",
    licencia: "Dominio público y CC0 según fuente · procesado en este panel",
    modelo: true,
  },
};
