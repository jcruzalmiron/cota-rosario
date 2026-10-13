import { RAIN_THRESHOLDS } from "@/lib/risk";
export interface Bloque { titulo: string; parrafos: string[] }
export interface Herramienta { vista: string; href: string; para: string; ofrece: string[] }
export interface Concepto { termino: string; explicacion: string }
export interface Pregunta { pregunta: string; respuesta: string }
export interface UmbralesRio { alerta: number | null; evacuacion: number | null; aguasBajas: number | null }
const metros = (valor: number | null) => valor === null ? "consultar el umbral publicado por el INA" : `${valor.toFixed(2)} m`;

export const QUE_ES: Bloque[] = [{ titulo: "Qué es Cota", parrafos: [
  "Cota es una demo para explorar información hídrica de Rosario: reúne lecturas del río, pronósticos meteorológicos, cartografía y aportes de vecinos, y muestra cómo cruzarlos.",
  "Las fuentes tienen distintas fechas, resoluciones y calidades. Cota también calcula indicadores y escenarios propios. No garantizamos la calidad de todos los datos ni la precisión de los modelos.",
  "Sirve para aprender, comparar escenarios y formular preguntas. Las decisiones operativas y los avisos públicos requieren validación local y consulta a los organismos responsables.",
]}];

export const HERRAMIENTAS: Herramienta[] = [
  { vista: "Vecinos", href: "/", para: "Explorar señales generales y capas de la ciudad.", ofrece: [
    "Señal orientativa del río y la lluvia, con explicación de los umbrales y del estado de cada fuente.",
    "Buscar una dirección para consultar zonas inundables, cartografía climática fija de 2024, relieve e historial del distrito incorporado en la demo.",
    "Activar capas por separado: sus colores describen datos distintos. Estar fuera de un polígono no descarta anegamiento.",
    "Reportar una observación sobre el mapa, sin datos personales. Los aportes duran 24 horas y no tienen verificación humana.",
  ]},
  { vista: "Operaciones", href: "/operaciones", para: "Ensayar cómo se leería información conjunta durante una capacitación.", ofrece: [
    "Indicadores y sugerencias por reglas orientativas, con la cifra que las activa y un resumen copiable que conserva las limitaciones de la demo.",
    "Simulador de altura y lluvia: los controles cambian el escenario del mapa y Restablecer vuelve a la consulta.",
    "Red devuelta por el INA, con fechas, búsqueda y filtros. La cantidad de estaciones puede variar.",
    "Estaciones de la cadena del Paraná y su margen a alerta en metros; los indicadores de red excluyen lecturas de más de 48 horas.",
  ]},
  { vista: "Predicciones", href: "/predicciones", para: "Explorar modelos y sus límites para los próximos siete días.", ofrece: [
    "Escenario ilustrativo de casos, adaptado de un ajuste mensual y repartido por día y distrito. Esa adaptación no tiene validación operativa.",
    "Lluvia pronosticada y referencia de extremos históricos. Los períodos de retorno dependen del ajuste y del archivo usado.",
    "Extrapolación del río si continúa el ritmo, y ajuste altura–caudal con GloFAS. Las bandas no son intervalos predictivos calibrados.",
  ]},
];

export const PROCESO: Concepto[] = [
  { termino: "1 · Definir el problema", explicacion: "Decidir qué pregunta queremos responder, para quién y qué resultado permitiría revisar la idea." },
  { termino: "2 · Plantear la idea a la IA", explicacion: "Describir el caso, las restricciones y una primera pantalla. Pedir alternativas, revisar las propuestas y decidir qué implementar." },
  { termino: "3 · Relevar fuentes", explicacion: "Buscar lecturas, archivos, mapas y modelos. Registrar origen, fecha, unidad, resolución, acceso y limitaciones; priorizar fuentes oficiales donde existan." },
  { termino: "4 · Cruzar información", explicacion: "Alinear fechas, ubicación y escala. Una altura de estación, una celda de caudal y un total por distrito representan cosas diferentes." },
  { termino: "5 · Calcular y explicar", explicacion: "Aplicar fórmulas con unidades explícitas, conservar los datos faltantes y mostrar qué números vienen de la fuente y cuáles calcula Cota." },
  { termino: "6 · Mejorar la interfaz", explicacion: "Ordenar las vistas según su público, separar capas fijas y señales de la consulta, e incorporar fechas y estados comprensibles." },
  { termino: "7 · Agregar funciones e iterar", explicacion: "Sumar reportes vecinales, simulaciones y modelos exploratorios. Revisar errores, contrastar resultados y documentar qué todavía no está validado." },
];

export function conceptos(umbrales: UmbralesRio): Concepto[] { return [
  { termino: "Altura y caudal", explicacion: `La altura está en metros respecto al cero de una escala local; el caudal está en m³/s. No son intercambiables. Alerta en Rosario: ${metros(umbrales.alerta)}. GloFAS estima caudal mediante un modelo global.` },
  { termino: "Lluvia concentrada", explicacion: `La demo compara el mayor acumulado en dos horas con umbrales de ${RAIN_THRESHOLDS.atencion}, ${RAIN_THRESHOLDS.alerta} y ${RAIN_THRESHOLDS.critico} mm. Son reglas orientativas sin calibración operativa local.` },
  { termino: "Milímetros de lluvia", explicacion: "Un milímetro representa un litro por metro cuadrado. La duración, el drenaje y las condiciones locales influyen en el anegamiento; el total de lluvia no alcanza para describir cada cuadra." },
  { termino: "Capas fijas", explicacion: "Los polígonos municipales y la cartografía climática de 2024 son snapshots. La categoría del mapa climático no cambia al actualizar el pronóstico. Su rasterización limita la precisión puntual." },
  { termino: "Relieve", explicacion: "La capa propia compara la elevación con la mediana del entorno. El modelo tiene resolución limitada y puede incluir edificios: no mide el nivel de una calle ni la profundidad del agua." },
  { termino: "Distrito", explicacion: "El registro de Defensa Civil incorporado está agregado por distrito y mes, desde enero de 2021 hasta enero de 2024. No permite atribuir casos a una calle ni asegura la cobertura de todos los eventos." },
  { termino: "Casos ilustrativos", explicacion: "Una regresión mensual se adapta a una ventana semanal. Su validación mensual no valida el reparto diario ni distrital. El error mensual medio absoluto no es un intervalo de incertidumbre." },
  { termino: "Período de retorno", explicacion: "Resume la rareza de un máximo anual dentro de una distribución ajustada. No fija cuándo ocurrirá otra tormenta. Depende del período, del reanálisis y de los supuestos del modelo." },
  { termino: "Evaluación incompleta", explicacion: "Aparece si falta un factor necesario o sus umbrales. Si existe una señal elevada en el factor disponible se conserva, acompañada por la indicación de evaluación parcial." },
  { termino: "Reportes de vecinos", explicacion: "Son observaciones sin verificar. Se valida el punto contra los distritos cubiertos y se limita la cantidad de envíos. Cada conexión puede confirmar una vez cada reporte; eso no verifica identidad ni hechos." },
  { termino: "Consulta y medición", explicacion: "La hora de consulta indica cuándo Cota pidió los datos. La fecha de una medición indica cuándo se observó el fenómeno. Una consulta nueva puede devolver información antigua y por eso se revisan ambas." },
  { termino: "Datos disponibles", explicacion: "Disponible significa que la respuesta pasó controles de formato y cobertura temporal. No certifica exactitud, completitud del fenómeno ni condiciones de seguridad." },
]; }

export const SEMAFORO: Concepto[] = [
  { termino: "Sin señales elevadas", explicacion: "Los dos factores utilizables no superan los umbrales de la demo. No garantiza condiciones de una cuadra." },
  { termino: "Atención", explicacion: "Un factor alcanza un umbral orientativo de revisión." },
  { termino: "Alerta", explicacion: "La altura supera el umbral publicado o la lluvia supera la regla de la demo. La etiqueta describe el cálculo del panel." },
  { termino: "Crítico", explicacion: "Se supera el umbral de evacuación publicado o el mayor umbral de lluvia de la demo. Consultar información oficial." },
];

export const PREGUNTAS: Pregunta[] = [
  { pregunta: "¿Cómo se actualiza?", respuesta: "Las vistas comparten respuestas reales durante un máximo de 60 segundos, con la fecha original. Actualizar fuerza una nueva consulta. Las APIs del panel siguen enviando no-store al navegador. También se refresca cada cinco minutos cuando la pestaña está visible. No implica que el organismo publique una medición nueva." },
  { pregunta: "¿Por qué hay un bloque sin datos?", respuesta: "La fuente pudo fallar, responder con valores ausentes, devolver un dato fuera de vigencia o no cubrir el período solicitado. El detalle de la fuente permite revisar el motivo." },
  { pregunta: "¿Qué significa no tener reportes?", respuesta: "Que no hay aportes registrados en la ventana consultada. No permite concluir que no haya agua. Si falla el almacenamiento mostramos la consulta como no disponible." },
  { pregunta: "¿Se puede usar para emitir alertas?", respuesta: "Esta versión es una demo. Harían falta contraste local, evaluación del error a la escala de uso, acuerdos con fuentes y protocolos operativos antes de usarla para decisiones o avisos." },
];
