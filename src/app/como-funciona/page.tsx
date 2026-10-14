import Image from "next/image";
import Link from "next/link";
import { Deck, type DeckSlide } from "@/components/deck/Deck";
import { RISK_FILL } from "@/components/status";
import { HELP_HREF, TopBar } from "@/components/TopBar";
import { conceptos, HERRAMIENTAS, PREGUNTAS, PROCESO, QUE_ES, SEMAFORO, type Concepto } from "@/content/comoFunciona";
import { DemoNotice } from "@/components/DemoNotice";
import { RISK_ORDER } from "@/lib/risk";
import { SOURCES } from "@/lib/sources";

// La guía es estática y funciona aunque las fuentes externas no respondan.

const CONCEPTS_PER_SLIDE = 4;
const QUESTIONS_PER_SLIDE = 4;
const CIFRAS = [
  { valor: "87", etiqueta: "zonas oficiales de inundación" },
  { valor: "7", etiqueta: "pasos de construcción con IA" },
  { valor: "86", etiqueta: "años de registros de lluvia" },
  { valor: "3", etiqueta: "vistas para consultar la ciudad" },
];
const INSTITUCIONES = [
  { nombre: "Tecnoteca", archivo: "/logos/tecnoteca.png", ancho: 1200, alto: 597 },
  { nombre: "Ministerio de Ambiente y Cambio Climático · Provincia de Santa Fe", archivo: "/logos/ministerio-ambiente-santa-fe.png", ancho: 1200, alto: 137 },
  { nombre: "Gobierno de Santa Fe", archivo: "/logos/gobierno-santa-fe.png", ancho: 757, alto: 164 },
];
const CADENCIA: Record<string, string> = {
  ina: "lecturas con fecha",
  openMeteo: "pronóstico modelado",
  glofas: "caudal modelado",
  clima: "condiciones modeladas",
  areas: "capa fija municipal",
  riesgoClima: "capa fija municipal",
  defensaCivil: "registro mensual municipal",
  modelos: "con cada pronóstico",
  terrain: "capa fija, cálculo propio",
};

function Capitulo({ numero, titulo, bajada }: { numero: string; titulo: string; bajada?: string }) {
  return (
    <header className="mb-10 flex flex-col gap-3">
      <span className="readout text-xs text-ink-faint">{numero}</span>
      <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">{titulo}</h2>
      {bajada ? <p className="max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">{bajada}</p> : null}
    </header>
  );
}

function ConceptosSlide({ lista }: { lista: Concepto[] }) {
  return (
    <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {lista.map((concepto) => (
        <div key={concepto.termino} className="flex flex-col gap-2 border-t border-rule pt-4">
          <dt className="text-lg font-medium text-ink">{concepto.termino}</dt>
          <dd className="text-sm leading-relaxed text-ink-soft">{concepto.explicacion}</dd>
        </div>
      ))}
    </dl>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

export default async function ComoFuncionaPage() {
  const listaConceptos = conceptos({ alerta: null, evacuacion: null, aguasBajas: null });
  const gruposConceptos = chunk(listaConceptos, CONCEPTS_PER_SLIDE);
  const [queEs] = QUE_ES;

  const slides: DeckSlide[] = [
    {
      id: "portada",
      titulo: "Portada",
      resplandor: true,
      contenido: (
        <div className="flex flex-col gap-8">
          <span className="readout text-xs text-ink-faint">Río, lluvia y territorio · Rosario</span>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight text-ink sm:text-7xl lg:text-8xl">
            Cómo funciona
            <br />
            Cota
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink-soft">
            Lecturas del Paraná, pronósticos de lluvia y mapas de Rosario. Conocé las herramientas para consultar tu zona, seguir indicadores y comparar escenarios.
          </p>
          <div className="grid grid-cols-2 gap-6 border-t border-rule pt-6 sm:grid-cols-4">
            {CIFRAS.map((cifra) => (
              <div key={cifra.etiqueta} className="flex flex-col gap-1">
                <span className="readout text-3xl text-ink">{cifra.valor}</span>
                <span className="text-xs text-ink-faint">{cifra.etiqueta}</span>
              </div>
            ))}
          </div>
          <p className="meta">↓ flechas, espacio o deslizar</p>
        </div>
      ),
    },
    {
      id: "alcance",
      titulo: queEs.titulo,
      contenido: (
        <div className="flex flex-col gap-10">
          <Capitulo numero="01" titulo="La ciudad, en un mismo mapa" />
          <div className="grid gap-8 lg:grid-cols-3">
            {queEs.parrafos.map((parrafo, index) => (
              <p key={parrafo} className={`leading-relaxed ${index === 0 ? "text-xl text-ink lg:col-span-3 lg:text-2xl" : "border-t border-rule pt-5 text-sm text-ink-soft"}`}>
                {parrafo}
              </p>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "semaforo",
      titulo: "El semáforo",
      contenido: (
        <div className="flex flex-col">
          <Capitulo numero="02" titulo="Cuatro luces" bajada="El nivel combina río y lluvia. Si falta un factor, la evaluación es parcial; el gris indica evaluación incompleta." />
          <dl className="flex flex-col divide-y divide-rule">
            {SEMAFORO.map((luz, index) => (
              <div key={luz.termino} className="grid gap-2 py-5 sm:grid-cols-[14rem_1fr] sm:gap-8">
                <dt className="flex items-center gap-3 text-xl font-medium text-ink">
                  <span className="size-3 rounded-full" style={{ background: RISK_FILL[RISK_ORDER[index]] }} aria-hidden="true" />
                  {luz.termino}
                </dt>
                <dd className="text-base leading-relaxed text-ink-soft">{luz.explicacion}</dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    },
    {
      id: "herramientas",
      titulo: "Las herramientas",
      contenido: (
        <div className="flex flex-col">
          <Capitulo numero="03" titulo="Tres vistas, tres públicos" />
          <div className="grid gap-6 lg:grid-cols-3">
            {HERRAMIENTAS.map((herramienta, index) => (
              <Link
                key={herramienta.vista}
                href={herramienta.href}
                className="group flex flex-col gap-4 rounded-lg border border-rule bg-panel/60 p-6 transition-colors hover:border-ink-soft"
              >
                <span className="readout text-xs text-ink-faint">0{index + 1}</span>
                <span className="text-2xl font-semibold text-ink">{herramienta.vista}</span>
                <span className="text-sm leading-relaxed text-ink-soft">{herramienta.para}</span>
                <span className="meta mt-auto transition-colors group-hover:text-ink">abrir →</span>
              </Link>
            ))}
          </div>
        </div>
      ),
    },
    ...chunk(PROCESO, 4).map((grupo, index) => ({ id: `construccion-${index}`, titulo: `Cómo la construimos ${index + 1}`, contenido: <div><Capitulo numero={`03.${index + 1}`} titulo="De la idea al producto" /><ConceptosSlide lista={grupo} /></div> })),
    ...HERRAMIENTAS.map((herramienta, index) => ({
      id: `herramienta-${index}`,
      titulo: herramienta.vista,
      contenido: (
        <div className="flex flex-col">
          <Capitulo numero={`03.${index + 1}`} titulo={herramienta.vista} bajada={herramienta.para} />
          <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {herramienta.ofrece.map((item) => (
              <li key={item} className="flex gap-4 border-t border-rule pt-4 text-sm leading-relaxed text-ink-soft">
                <span className="mt-2.5 h-px w-4 shrink-0 bg-ink-faint" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <Link href={herramienta.href} className="mt-8 self-start text-sm text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
            Abrir {herramienta.vista} →
          </Link>
        </div>
      ),
    })),
    ...gruposConceptos.map((grupo, index) => ({
      id: `conceptos-${index}`,
      titulo: `Conceptos ${index + 1}`,
      contenido: (
        <div className="flex flex-col">
          <Capitulo numero={`04.${index + 1}`} titulo={index === 0 ? "Los conceptos, en criollo" : "Los conceptos, en criollo (sigue)"} />
          <ConceptosSlide lista={grupo} />
        </div>
      ),
    })),
    {
      id: "fuentes",
      titulo: "Las fuentes",
      contenido: (
        <div className="flex flex-col">
          <Capitulo numero="05" titulo="De dónde sale cada dato" bajada="Lecturas, modelos, transformaciones y registros tienen alcances diferentes." />
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {Object.values(SOURCES).map((fuente) => (
              <a
                key={fuente.id}
                href={fuente.portal}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-1.5 border-t border-rule pt-4 transition-colors hover:border-ink-soft"
              >
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-base font-medium text-ink">{fuente.organismo.split(" · ")[0]}</span>
                  <span className="meta">{CADENCIA[fuente.id] ?? ""}</span>
                </span>
                <span className="text-sm leading-relaxed text-ink-soft">{fuente.descripcion}</span>
                {fuente.modelo ? <span className="meta text-atencion">modelo, no dato oficial</span> : null}
              </a>
            ))}
          </div>
        </div>
      ),
    },
    ...chunk(PREGUNTAS, QUESTIONS_PER_SLIDE).map((grupo, index) => ({
      id: `preguntas-${index}`,
      titulo: `Preguntas frecuentes ${index + 1}`,
      contenido: (
        <div className="flex flex-col">
          <Capitulo numero={`06.${index + 1}`} titulo={index === 0 ? "Lo que más se pregunta" : "Lo que más se pregunta (sigue)"} />
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {grupo.map((item) => (
              <div key={item.pregunta} className="flex flex-col gap-1.5 border-t border-rule pt-4">
                <dt className="text-base font-medium text-ink">{item.pregunta}</dt>
                <dd className="text-sm leading-relaxed text-ink-soft">{item.respuesta}</dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    })),
    {
      id: "instituciones",
      titulo: "Instituciones",
      contenido: (
        <div className="flex flex-col">
          <Capitulo numero="07" titulo="Las instituciones" bajada="Las organizaciones que acompañan este proyecto." />
          <div className="grid gap-6 sm:grid-cols-3">
            {INSTITUCIONES.map((institucion) => (
              <figure key={institucion.nombre} className="flex flex-col gap-4 rounded-lg border border-rule bg-panel/60 p-8">
                <div className="flex h-32 items-center justify-center">
                  <Image src={institucion.archivo} alt={institucion.nombre} width={institucion.ancho} height={institucion.alto} className="max-h-28 w-auto max-w-full object-contain" />
                </div>
                <figcaption className="meta text-center">{institucion.nombre}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "cierre",
      titulo: "Cierre",
      resplandor: true,
      contenido: (
        <div className="flex flex-col gap-8">
          <span className="readout text-xs text-ink-faint">08</span>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-6xl">
            Empezá por
            <br />
            tu zona.
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-ink-soft">
            Buscá una dirección, consultá las condiciones del río y la lluvia, o compartí lo que observás en tu cuadra.
          </p>
          <div className="flex flex-wrap gap-3">
            {HERRAMIENTAS.map((herramienta) => (
              <Link key={herramienta.href} href={herramienta.href} className="rounded-md border border-rule px-4 py-2 text-sm text-ink transition-colors hover:border-ink-soft">
                {herramienta.vista}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6 border-t border-rule pt-8 opacity-80">
            {INSTITUCIONES.map((institucion) => (
              <Image key={institucion.nombre} src={institucion.archivo} alt={institucion.nombre} width={institucion.ancho} height={institucion.alto} className="h-10 w-auto object-contain sm:h-12" />
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <TopBar activo={HELP_HREF} />
      <DemoNotice />
      <div className="min-h-0 flex-1">
        <Deck slides={slides} />
      </div>
    </div>
  );
}
