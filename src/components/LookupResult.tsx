import { formatoDistancia, type CategoriaClima, type Hallazgo, type TerrainMeta } from "@/lib/lookup";
import { riskLabel } from "@/lib/risk";

const CLIMA_TEXT: Record<CategoriaClima, string> = {
  "muy bajo": "text-ink",
  bajo: "text-ink",
  medio: "text-atencion",
  alto: "text-alerta",
};

function titulo(texto: string): string {
  return texto
    .toLowerCase()
    .split(" ")
    .map((palabra) => (palabra ? palabra[0].toUpperCase() + palabra.slice(1) : palabra))
    .join(" ");
}

interface LookupResultProps {
  hallazgo: Hallazgo;
  terrain: TerrainMeta | null;
}

export function LookupResult({ hallazgo, terrain }: LookupResultProps) {
  const ubicacion = [hallazgo.etiqueta, hallazgo.barrio ? `barrio ${titulo(hallazgo.barrio)}` : null, hallazgo.distrito ? `distrito ${titulo(hallazgo.distrito.distrito)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-2.5 border-t border-rule px-4 py-3 text-sm">
      <p className="text-xs text-ink-faint">{ubicacion}</p>

      {hallazgo.dentro ? (
        <p className="text-ink">
          Dentro del área inundable oficial zona {hallazgo.zona}. Hoy:{" "}
          <span className={hallazgo.nivel === "normal" ? "text-normal" : "text-alerta"}>{riskLabel(hallazgo.nivel).toLowerCase()}</span>.
        </p>
      ) : (
        <p className="leading-relaxed text-ink">
          Fuera de los polígonos oficiales del Ludueña y el Saladillo
          {hallazgo.cercano ? (
            <>
              ; el más cercano es la zona {hallazgo.cercano.zona}, a <span className="readout">{formatoDistancia(hallazgo.cercano.metros)}</span>
            </>
          ) : null}
          .
        </p>
      )}

      {hallazgo.clima ? (
        <p className="leading-relaxed text-ink">
          Riesgo por lluvias torrenciales <span className={`${CLIMA_TEXT[hallazgo.clima]} readout`}>{hallazgo.clima}</span>
          <span className="text-ink-soft"> según la capa municipal de riesgo climático 2024, rasterizada para esta demo.</span>
        </p>
      ) : null}

      {hallazgo.distrito ? (
        <p className="leading-relaxed text-ink-soft">
          En el registro incorporado (2021–enero de 2024), este distrito concentra el <span className="readout text-ink">{hallazgo.distrito.participacion} %</span> de las intervenciones por anegamientos registradas. Esta proporción no indica el riesgo de esta dirección.
          {hallazgo.distrito.mesPico ? (
            <>
              {" "}
              Su mes más cargado registrado tuvo {hallazgo.distrito.mesPico.casos} casos con{" "}
              <span className="readout text-ink">{Math.round(hallazgo.distrito.mesPico.lluviaMm)} mm</span> de lluvia.
            </>
          ) : null}
        </p>
      ) : null}

      {hallazgo.terreno ? (
        <p className="leading-relaxed text-ink-soft">
          {hallazgo.terreno.estado === "bajo" ? (
            <>
              Según el modelo de terreno está{" "}
              <span className="readout text-ink">
                {terrain && hallazgo.terreno.metros >= terrain.escalaMaximaMetros ? `más de ${terrain.escalaMaximaMetros} m` : `${hallazgo.terreno.metros.toFixed(1)} m`}
              </span>{" "}
              por debajo de la mediana de su entorno de {terrain?.ventanaMetros} m: ahí el agua tiende a juntarse.
            </>
          ) : hallazgo.terreno.estado === "plano" ? (
            <>Según el modelo de terreno no es un punto bajo respecto de la mediana de su entorno de {terrain?.ventanaMetros} m.</>
          ) : (
            <>En manzanas densas el relieve no aporta lectura; acá pesan el mapa oficial y el historial.</>
          )}
        </p>
      ) : null}
    </div>
  );
}
