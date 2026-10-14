import { RAIN_THRESHOLDS } from "@/lib/risk";
export interface Bloque { titulo: string; parrafos: string[] }
export interface Herramienta { vista: string; href: string; para: string; ofrece: string[] }
export interface Concepto { termino: string; explicacion: string }
export interface Pregunta { pregunta: string; respuesta: string }
export interface UmbralesRio { alerta: number | null; evacuacion: number | null; aguasBajas: number | null }
const metros = (valor: number | null) => valor === null ? "consultar el umbral publicado por el INA" : `${valor.toFixed(2)} m`;

export const QUE_ES: Bloque[] = [{ titulo: "Qué es Cota", parrafos: [
  "Cota reúne la información del río, la lluvia y el territorio de Rosario para entender cómo evolucionan las condiciones hídricas de la ciudad.",
  "En un mismo mapa podés consultar zonas inundables, buscar una dirección y ver reportes de vecinos. Cada lectura y pronóstico muestra su fuente y su fecha.",
  "Las vistas de Operaciones y Predicciones permiten seguir indicadores, comparar escenarios y analizar los próximos siete días.",
]}];

export const HERRAMIENTAS: Herramienta[] = [
  { vista: "Vecinos", href: "/", para: "Consultá el río, la lluvia y los mapas de tu zona.", ofrece: [
    "Señal orientativa del río y la lluvia, con explicación de los umbrales y del estado de cada fuente.",
    "Buscar una dirección y consultar zonas inundables, cartografía climática de 2024, relieve e historial del distrito.",
    "Activar capas por separado: sus colores describen datos distintos. Estar fuera de un polígono no descarta anegamiento.",
    "Compartir lo que observás en tu cuadra. Los reportes se muestran durante 24 horas y otros vecinos pueden confirmarlos.",
  ]},
  { vista: "Operaciones", href: "/operaciones", para: "Seguí los indicadores y compará escenarios sobre el mapa.", ofrece: [
    "Recomendaciones acompañadas por el dato que las motiva y un parte de situación listo para compartir.",
    "Simulador de altura y lluvia: los controles cambian el escenario del mapa y Restablecer vuelve a la consulta.",
    "Red devuelta por el INA, con fechas, búsqueda y filtros. La cantidad de estaciones puede variar.",
    "Estaciones de la cadena del Paraná y su margen a alerta en metros; los indicadores de red excluyen lecturas de más de 48 horas.",
  ]},
  { vista: "Predicciones", href: "/predicciones", para: "Consultá la lluvia prevista y las tendencias de la próxima semana.", ofrece: [
    "Escenarios de anegamientos por día y distrito, construidos a partir de un modelo mensual y la participación histórica de cada zona.",
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
  { termino: "7 · Agregar funciones e iterar", explicacion: "Incorporar reportes vecinales, simulaciones y predicciones. Mejorar el producto a partir del uso, los resultados y nuevas fuentes." },
];

export function conceptos(umbrales: UmbralesRio): Concepto[] { return [
  { termino: "Altura y caudal", explicacion: `La altura está en metros respecto al cero de una escala local; el caudal está en m³/s. No son intercambiables. Alerta en Rosario: ${metros(umbrales.alerta)}. GloFAS estima caudal mediante un modelo global.` },
  { termino: "Lluvia concentrada", explicacion: `Cota compara el mayor acumulado en dos horas con umbrales orientativos de ${RAIN_THRESHOLDS.atencion}, ${RAIN_THRESHOLDS.alerta} y ${RAIN_THRESHOLDS.critico} mm para señalar atención, alerta o nivel crítico.` },
  { termino: "Milímetros de lluvia", explicacion: "Un milímetro representa un litro por metro cuadrado. La duración, el drenaje y las condiciones locales influyen en el anegamiento; el total de lluvia no alcanza para describir cada cuadra." },
  { termino: "Mapas del territorio", explicacion: "Las zonas inundables y el mapa climático de 2024 describen el territorio. Se consultan por separado de las condiciones del día: sus categorías no cambian al actualizar el pronóstico." },
  { termino: "Relieve", explicacion: "La capa propia compara la elevación con la mediana del entorno. El modelo tiene resolución limitada y puede incluir edificios: no mide el nivel de una calle ni la profundidad del agua." },
  { termino: "Distrito", explicacion: "El registro de Defensa Civil incorporado está agregado por distrito y mes, desde enero de 2021 hasta enero de 2024. No permite atribuir casos a una calle ni asegura la cobertura de todos los eventos." },
  { termino: "Escenarios de anegamiento", explicacion: "Un modelo relaciona lluvia y registros mensuales de Defensa Civil. La proyección semanal y su distribución por distrito son orientativas; la validación corresponde a la escala mensual." },
  { termino: "Período de retorno", explicacion: "Resume la rareza de un máximo anual dentro de una distribución ajustada. No fija cuándo ocurrirá otra tormenta. Depende del período, del reanálisis y de los supuestos del modelo." },
  { termino: "Evaluación incompleta", explicacion: "Aparece si falta un factor necesario o sus umbrales. Si existe una señal elevada en el factor disponible se conserva, acompañada por la indicación de evaluación parcial." },
  { termino: "Reportes de vecinos", explicacion: "Permiten ubicar observaciones recientes en el mapa. Cada reporte indica su tipo, antigüedad y confirmaciones. Las confirmaciones son aportes de la comunidad, no una verificación oficial." },
  { termino: "Consulta y medición", explicacion: "La hora de consulta indica cuándo Cota pidió los datos. La fecha de una medición indica cuándo se observó el fenómeno. Una consulta nueva puede devolver información antigua y por eso se revisan ambas." },
  { termino: "Estado de las fuentes", explicacion: "Cada vista indica qué fuentes pudo consultar y para qué período hay datos. Cuando falta información, el panel lo muestra como una evaluación parcial." },
]; }

export const SEMAFORO: Concepto[] = [
  { termino: "Sin señales elevadas", explicacion: "El río y la lluvia están por debajo de los umbrales de referencia. Las observaciones de cada zona complementan esta lectura general." },
  { termino: "Atención", explicacion: "Un factor alcanza un umbral orientativo de revisión." },
  { termino: "Alerta", explicacion: "La altura supera el umbral publicado por el INA o la lluvia alcanza el umbral orientativo de alerta de Cota." },
  { termino: "Crítico", explicacion: "La altura supera el umbral de evacuación publicado por el INA o la lluvia alcanza el mayor umbral orientativo. Consultá las comunicaciones oficiales." },
];

export const PREGUNTAS: Pregunta[] = [
  { pregunta: "¿Cómo se actualiza?", respuesta: "Cota consulta las fuentes al abrir una vista y se actualiza cada cinco minutos mientras la pestaña está visible. El botón Actualizar permite pedir una nueva consulta. La fecha de cada lectura indica cuándo se midió o se pronosticó el dato." },
  { pregunta: "¿Por qué hay un bloque sin datos?", respuesta: "La fuente pudo fallar, responder con valores ausentes, devolver un dato fuera de vigencia o no cubrir el período solicitado. El detalle de la fuente permite revisar el motivo." },
  { pregunta: "¿Qué significa no tener reportes?", respuesta: "Que no hay aportes registrados en la ventana consultada. No permite concluir que no haya agua. Si falla el almacenamiento mostramos la consulta como no disponible." },
  { pregunta: "¿Quién emite las alertas oficiales?", respuesta: "Los avisos y protocolos oficiales corresponden a los organismos responsables. Cota permite consultar la información y comparar escenarios. Ante una emergencia, comunicate con Defensa Civil al 103." },
];
