import type { Estado } from "@/lib/estado";
import type { Kpis } from "@/lib/kpis";
import type { Predicciones } from "@/lib/predicciones";
import { REPORT_TYPES } from "@/lib/reportTypes";
import { RAIN_THRESHOLDS, riskLabel } from "@/lib/risk";
import { horaArgentina } from "@/lib/time";

export type Prioridad = "alta" | "media" | "baja";

export interface Recomendacion {
  id: string;
  prioridad: Prioridad;
  titulo: string;
  accion: string;
  porQue: string;
}

export interface ParteDeSituacion {
  texto: string;
  generadoEn: string;
}

interface Insumos {
  estado: Estado;
  kpis: Kpis;
  predicciones: Predicciones;
}

const PRIORITY_ORDER: Prioridad[] = ["alta", "media", "baja"];
const MARGIN_ALERT_M = 0.5;
const DAYS_TO_ALERT_SOON = 7;
const RISING_CM_PER_DAY = 2;
const UPSTREAM_MARGIN_WARN_M = 0.5;
const UPSTREAM_STATIONS_FOR_WAVE = 2;
const FORECAST_RAIN_48H_MM = 30;
const RETURN_PERIOD_RARE_YEARS = 5;
const MONTH_SATURATION_RATIO = 1.5;
const EXPECTED_CASES_WEEK = 10;
const EXPECTED_CASES_DISTRICT = 3;
const RECENT_REPORTS_ALERT = 3;
const PERCENT = 100;

function titulo(texto: string): string {
  return texto.charAt(0) + texto.slice(1).toLowerCase();
}

function fmtDia(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

function reglasRio({ estado, kpis }: Insumos): Recomendacion[] {
  const rio = kpis.rio;
  const estacion = estado.rio?.estacion;
  if (!rio || !estacion) {
    return [];
  }
  const out: Recomendacion[] = [];
  const nivelRio = estado.riesgo.factores.find((factor) => factor.clave === "rio")?.nivel;
  if (nivelRio === "critico" || nivelRio === "alerta") {
    out.push({
      id: "rio-umbral",
      prioridad: "alta",
      titulo: nivelRio === "critico" ? "El río superó el nivel de evacuación" : "El río superó el nivel de alerta",
      accion: "Contrastar la lectura con el boletín oficial y revisar qué protocolo correspondería. La demo no activa avisos ni indica evacuaciones.",
      porQue: `Altura ${rio.actual.toFixed(2)} m contra alerta ${estacion.alerta?.toFixed(2) ?? "—"} m y evacuación ${estacion.evacuacion?.toFixed(2) ?? "—"} m del INA.`,
    });
  } else if (rio.margenAlertaM !== null && (rio.margenAlertaM <= MARGIN_ALERT_M || (rio.diasHastaAlerta !== null && rio.diasHastaAlerta <= DAYS_TO_ALERT_SOON))) {
    out.push({
      id: "rio-margen",
      prioridad: "alta",
      titulo: "Revisar el margen al umbral ribereño",
      accion: "Revisar el listado de familias en zonas bajas de la costa e islas, verificar bombas y lanchas, y acordar con Prefectura el criterio de aviso.",
      porQue: `Margen a alerta de ${rio.margenAlertaM.toFixed(2)} m con un ritmo de ${rio.ritmoCmDia ?? 0} cm/día${rio.diasHastaAlerta !== null ? `: la alerta llegaría en ${rio.diasHastaAlerta} días si sigue igual` : ""}.`,
    });
  }

  const enOnda = kpis.aguasArriba.filter(
    (station) => station.esAguasArriba && station.margenAlertaM !== null && station.margenAlertaM <= UPSTREAM_MARGIN_WARN_M && station.tendencia.toLowerCase() === "crece",
  );
  if (enOnda.length >= UPSTREAM_STATIONS_FOR_WAVE || (enOnda.length > 0 && rio.ritmoCmDia !== null && rio.ritmoCmDia >= RISING_CM_PER_DAY)) {
    out.push({
      id: "rio-onda",
      prioridad: "media",
      titulo: "Revisar las subidas observadas aguas arriba",
      accion: "Comparar estas lecturas con la altura diaria de Rosario y los boletines del INA antes de sacar conclusiones.",
      porQue: `${enOnda.map((station) => `${station.nombre} a ${station.margenAlertaM} m de su alerta y creciendo`).join(", ")}. Estas señales no permiten fijar llegada ni magnitud de una onda en Rosario.`,
    });
  } else if (rio.ritmoCmDia !== null && rio.ritmoCmDia >= RISING_CM_PER_DAY) {
    out.push({
      id: "rio-tendencia",
      prioridad: "baja",
      titulo: "El ajuste de los últimos 14 días muestra una subida",
      accion: "Mantener el seguimiento diario y comparar mañana contra la proyección de Predicciones.",
      porQue: `Ritmo de ${rio.ritmoCmDia} cm/día en los últimos 14 días; ${rio.variacion7dCm !== null ? `${rio.variacion7dCm > 0 ? "+" : ""}${rio.variacion7dCm} cm en 7 días` : "sin variación semanal disponible"}.`,
    });
  }
  return out;
}

function reglasLluvia({ estado, kpis, predicciones }: Insumos): Recomendacion[] {
  const out: Recomendacion[] = [];
  const pico = estado.lluvia?.picoVentana;
  const balance = kpis.lluvia?.balance;
  const lluvia = predicciones.lluvia;
  const distritoTop = predicciones.anegamientos?.porDistrito[0];
  if (pico && pico.milimetros >= RAIN_THRESHOLDS.atencion) {
    const fuerte = pico.milimetros >= RAIN_THRESHOLDS.alerta;
    out.push({
      id: "lluvia-pico",
      prioridad: fuerte ? "alta" : "media",
      titulo: fuerte ? "Pico de lluvia sobre el umbral orientativo de la demo" : "Lluvia concentrada en las próximas 48 h",
      accion: `Revisar el pronóstico y planificar una inspección de drenaje para el ${fmtDia(pico.desde.slice(0, 10))}${distritoTop ? `, empezando por ${titulo(distritoTop.distrito)}` : ""}. La elección de lugares requiere registros locales; el reparto histórico de la demo no basta.`,
      porQue: `Pico pronosticado de ${pico.milimetros} mm en 2 h a partir de las ${pico.desde.slice(11, 16)} del ${fmtDia(pico.desde.slice(0, 10))}; el umbral de ${fuerte ? "alerta" : "atención"} es ${fuerte ? RAIN_THRESHOLDS.alerta : RAIN_THRESHOLDS.atencion} mm.`,
    });
  } else if (balance && balance.prevista48h >= FORECAST_RAIN_48H_MM) {
    out.push({
      id: "lluvia-acumulada",
      prioridad: "media",
      titulo: "Semana lluviosa por delante",
      accion: "Programar limpieza de desagües en los sectores con más historial y revisar que las bombas del Ludueña estén operativas.",
      porQue: `${balance.prevista48h} mm previstos en 48 h, repartidos sin un pico fuerte (probabilidad máxima ${balance.probabilidadMax24h === null ? "sin dato" : `${balance.probabilidadMax24h} %`}).`,
    });
  }
  if (lluvia && lluvia.maximoDia.milimetros > 0 && lluvia.periodoRetornoAnios >= RETURN_PERIOD_RARE_YEARS) {
    out.push({
      id: "lluvia-rara",
      prioridad: "alta",
      titulo: "Se pronostica una lluvia poco frecuente",
      accion: `Contrastar el escenario del ${fmtDia(lluvia.maximoDia.fecha)} con pronósticos oficiales y criterio local antes de planificar acciones.`,
      porQue: `${lluvia.maximoDia.milimetros} mm en un día es una lluvia que, como máximo del año, tiene un período de retorno de ${lluvia.periodoRetornoAnios} años en el ajuste histórico, sujeto a sus limitaciones.`,
    });
  }
  const mes = kpis.lluvia?.mes;
  const normal = kpis.lluvia?.mesNormalMm;
  if (mes && normal && mes.acumuladoMm >= normal * MONTH_SATURATION_RATIO) {
    out.push({
      id: "lluvia-saturacion",
      prioridad: "baja",
      titulo: "El acumulado mensual supera la referencia histórica",
      accion: "Revisar humedad del suelo y registros locales antes de interpretar el acumulado; la demo no mide saturación.",
      porQue: `Van ${mes.acumuladoMm.toFixed(0)} mm en el mes, el ${Math.round((mes.acumuladoMm / normal) * PERCENT)} % de un mes normal (${normal} mm).`,
    });
  }
  return out;
}

function reglasAnegamientos({ predicciones }: Insumos): Recomendacion[] {
  const anegamientos = predicciones.anegamientos;
  if (!anegamientos) {
    return [];
  }
  const top = anegamientos.porDistrito[0];
  if (anegamientos.esperadosCiudad >= EXPECTED_CASES_WEEK || (top && top.esperados >= EXPECTED_CASES_DISTRICT)) {
    return [
      {
        id: "anegamientos-guardias",
        prioridad: "baja",
        titulo: "Revisar el escenario ilustrativo de anegamientos",
        accion: "Contrastar el resultado con registros recientes y criterio local antes de usarlo para planificar recursos.",
        porQue: `La adaptación del modelo mensual muestra ${anegamientos.esperadosCiudad.toFixed(1)} casos ilustrativos en ${anegamientos.ventanaDias} días${top ? `, ${top.esperados.toFixed(1)} en ${titulo(top.distrito)}` : ""}. El reparto por día y distrito no tiene validación operativa.`,
      },
    ];
  }
  return [];
}

function reglasReportes({ kpis }: Insumos): Recomendacion[] {
  const reportes = kpis.reportes;
  if (!reportes) return [];
  const out: Recomendacion[] = [];
  const viviendas = reportes.porTipo.find((tipo) => tipo.tipo === "vivienda")?.cantidad ?? 0;
  const cortes = reportes.porTipo.find((tipo) => tipo.tipo === "corte")?.cantidad ?? 0;
  const distritoTop = reportes.porDistrito[0];
  if (viviendas > 0) {
    out.push({
      id: "reportes-viviendas",
      prioridad: "alta",
      titulo: "Vecinos reportan agua dentro de viviendas",
      accion: `Verificar el aporte antes de evaluar una respuesta${distritoTop ? ` en ${titulo(distritoTop.distrito)}` : ""} con el equipo responsable.`,
      porQue: `${viviendas} reporte${viviendas === 1 ? "" : "s"} de "${REPORT_TYPES.vivienda.etiqueta}" en las últimas 24 h. Son reportes sin verificar: son una señal, no un dato oficial.`,
    });
  }
  if (reportes.ultimas6h >= RECENT_REPORTS_ALERT) {
    out.push({
      id: "reportes-recientes",
      prioridad: "alta",
      titulo: "Están entrando reportes de agua ahora",
      accion: "Verificar en terreno y, si se confirma, publicar el estado de las calles afectadas en los canales oficiales.",
      porQue: `${reportes.ultimas6h} reportes en las últimas 6 h${distritoTop ? `, la mayoría en ${titulo(distritoTop.distrito)}` : ""}, con ${reportes.confirmaciones} confirmaciones de otros vecinos.`,
    });
  }
  if (cortes > 0) {
    out.push({
      id: "reportes-cortes",
      prioridad: "media",
      titulo: "Calles reportadas como cortadas",
      accion: "Verificar la ubicación y el estado del corte antes de proponer desvíos o compartir información.",
      porQue: `${cortes} reporte${cortes === 1 ? "" : "s"} de "${REPORT_TYPES.corte.etiqueta}" en las últimas 24 h.`,
    });
  }
  return out;
}

function reglasFuentes({ estado, kpis }: Insumos): Recomendacion[] {
  const fallas = [...estado.fallas, ...kpis.fallas.filter((falla) => !estado.fallas.some((otra) => otra.fuente === falla.fuente))];
  const ina = fallas.find((falla) => falla.fuente === "ina");
  if (!ina) {
    return [];
  }
  return [
    {
      id: "fuente-ina",
      prioridad: "baja",
      titulo: "La consulta del INA no está disponible",
      accion: "Confirmar la altura del río por Prefectura o por la escala de la Bolsa de Comercio hasta que el servicio vuelva; actualizar la vista vuelve a consultar las fuentes.",
      porQue: `Sin respuesta desde las ${horaArgentina(ina.en)}. La evaluación queda incompleta; los insumos disponibles no prueban ausencia de riesgo.`,
    },
  ];
}

function reglaCalma(insumos: Insumos, existentes: Recomendacion[]): Recomendacion[] {
  if (insumos.estado.riesgo.incompleto || !insumos.kpis.lluvia || !insumos.kpis.rio) return [];
  if (existentes.some((recomendacion) => recomendacion.prioridad !== "baja")) {
    return [];
  }
  const balance = insumos.kpis.lluvia?.balance;
  const margen = insumos.kpis.rio?.margenAlertaM;
  return [
    {
      id: "calma-preventivo",
      prioridad: "baja",
      titulo: "Sin umbrales elevados en los insumos disponibles",
      accion: "Aprovechar para limpiar sumideros en Centro (el distrito que concentra los anegamientos), probar las bombas del Ludueña y actualizar el padrón de vecinos ribereños.",
      porQue: `${balance ? `${balance.prevista48h} mm previstos en 48 h` : "Balance no disponible"}${margen !== null && margen !== undefined ? ` y ${margen.toFixed(2)} m de margen hasta la alerta del río` : ""}. La demo no garantiza las condiciones de cada cuadra.`,
    },
  ];
}

export function buildRecomendaciones(insumos: Insumos): Recomendacion[] {
  const base = [...reglasRio(insumos), ...reglasLluvia(insumos), ...reglasAnegamientos(insumos), ...reglasReportes(insumos), ...reglasFuentes(insumos)];
  return [...base, ...reglaCalma(insumos, base)].sort((a, b) => PRIORITY_ORDER.indexOf(a.prioridad) - PRIORITY_ORDER.indexOf(b.prioridad));
}

export function buildParte({ estado, kpis, predicciones }: Insumos): ParteDeSituacion {
  const rio = kpis.rio;
  const estacion = estado.rio?.estacion;
  const balance = kpis.lluvia?.balance;
  const anegamientos = predicciones.anegamientos;
  const reportes = kpis.reportes;
  const enOnda = kpis.aguasArriba.filter((station) => station.esAguasArriba && station.tendencia.toLowerCase() === "crece").length;
  const frases: string[] = [];
  frases.push(`Demo Cota · resumen de la consulta ${estado.riesgo.evaluadoEn.slice(0, 10)} a las ${horaArgentina(estado.riesgo.evaluadoEn)}. Señal del panel: ${riskLabel(estado.riesgo.nivel).toLowerCase()}${estado.riesgo.incompleto ? "; evaluación parcial" : ""}. Datos y modelos con cobertura y precisión sin garantía operativa.`);
  if (rio && estacion) {
    frases.push(
      `El Paraná mide ${rio.actual.toFixed(2)} m en la escala de Rosario (${rio.variacion24hCm !== null ? `${rio.variacion24hCm > 0 ? "+" : ""}${rio.variacion24hCm} cm en 24 h` : "sin variación diaria"}), a ${rio.margenAlertaM?.toFixed(2) ?? "—"} m del nivel de alerta del INA${rio.ritmoCmDia !== null && rio.ritmoCmDia > 0 && rio.diasHastaAlerta !== null ? `; al ritmo actual de ${rio.ritmoCmDia} cm/día la alcanzaría en ${rio.diasHastaAlerta} días${rio.diasHastaAlerta > 7 ? ", fuera de la ventana semanal" : ""}` : ""}. Aguas arriba, ${enOnda} de ${kpis.aguasArriba.filter((entry) => entry.esAguasArriba).length} estaciones están en crecida.`,
    );
  }
  if (balance) {
    const pico = estado.lluvia?.picoVentana;
    frases.push(`El modelo meteorológico estima ${balance.caido24h.toFixed(0)} mm pasados en las últimas 24 h y se prevén ${balance.prevista48h.toFixed(0)} mm para las próximas 48 h${pico && pico.milimetros > 0 ? `, con un pico de ${pico.milimetros} mm en 2 h` : ""}.`);
  }
  if (anegamientos) {
    const top = anegamientos.porDistrito[0];
    frases.push(`La adaptación exploratoria del modelo mensual muestra ${anegamientos.esperadosCiudad.toFixed(1)} casos ilustrativos para ${anegamientos.ventanaDias} días${top ? `, con mayor participación histórica en ${titulo(top.distrito)}` : ""}; no tiene validación diaria/semanal.`);
  }
  frases.push(!reportes ? "No se pudieron consultar los reportes de vecinos." : reportes.activos === 0 ? "No hay aportes registrados en las últimas 24 h; esto no descarta agua en la zona." : `Hay ${reportes.activos} aporte${reportes.activos === 1 ? " vecinal" : "s vecinales"} sin verificar en las últimas 24 h, ${reportes.ultimas6h} en las últimas 6 h.`);
  const caidas = [...new Set([...estado.fallas, ...kpis.fallas].map((falla) => falla.fuente))];
  if (caidas.length) {
    frases.push(`Fuentes sin responder: ${caidas.join(", ")}.`);
  }
  return { texto: frases.join(" "), generadoEn: new Date().toISOString() };
}

export function evidenciaDePrioridad(prioridad: Prioridad): string {
  return prioridad === "alta" ? "var(--critico)" : prioridad === "media" ? "var(--atencion)" : "var(--ink-faint)";
}
