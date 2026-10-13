import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { RasterMeta } from "@/lib/rasters";
import type { RiskLevel } from "@/lib/risk";

export type CategoriaClima = "muy bajo" | "bajo" | "medio" | "alto";

export interface ClimaMeta extends RasterMeta {
  nombre: string;
  fuente: string;
  unidad: string;
  categorias: string[];
  categoriaGris: number[];
  archivoCategorias: string;
}

export interface MesPico {
  mes: string;
  casos: number;
  lluviaMm: number;
}

export interface ResumenAnegamientos {
  total: number;
  porAnio: Record<string, number>;
  mesPico: MesPico | null;
}

export interface DefensaCivil {
  periodo: { desde: string; hasta: string };
  mesesPorAnio: Record<string, number>;
  distritos: Record<string, ResumenAnegamientos>;
  ciudad: ResumenAnegamientos;
}

export interface LecturaDistrito {
  distrito: string;
  participacion: number;
  mesPico: MesPico | null;
}

export interface TerrainMeta extends RasterMeta {
  escalaMaximaMetros: number;
  ventanaMetros: number;
  mascaraEdificado: string;
}

export type LecturaTerreno = { estado: "bajo" | "plano" | "edificado"; metros: number } | null;

export interface Hallazgo {
  etiqueta: string;
  zona?: string;
  nivel?: RiskLevel | null;
  dentro: boolean;
  cercano: { zona: string; metros: number } | null;
  terreno: LecturaTerreno;
  clima: CategoriaClima | null;
  distrito: LecturaDistrito | null;
  barrio: string | null;
}

type AnyPolygonFeature = Feature<Polygon | MultiPolygon, Record<string, string>>;

const PERCENT = 100;
const EARTH_RADIUS_M = 6371000;
const MES_LABEL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function pointInPolygon(lat: number, lon: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const [lonA, latA] = ring[index];
      const [lonB, latB] = ring[previous];
      const crosses = latA > lat !== latB > lat && lon < ((lonB - lonA) * (lat - latA)) / (latB - latA) + lonA;
      if (crosses) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function ringsOf(feature: AnyPolygonFeature): number[][][][] {
  return feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
}

export function featureAt(collection: FeatureCollection<Polygon | MultiPolygon, Record<string, string>>, lat: number, lon: number) {
  return collection.features.find((feature) => ringsOf(feature).some((rings) => pointInPolygon(lat, lon, rings)));
}

function segmentDistanceM(lat: number, lon: number, a: number[], b: number[]): number {
  const rad = Math.PI / 180;
  const xScale = EARTH_RADIUS_M * rad * Math.cos(lat * rad);
  const yScale = EARTH_RADIUS_M * rad;
  const ax = (a[0] - lon) * xScale, ay = (a[1] - lat) * yScale;
  const bx = (b[0] - lon) * xScale, by = (b[1] - lat) * yScale;
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function nearestFeature(collection: FeatureCollection<Polygon | MultiPolygon, Record<string, string>>, lat: number, lon: number) {
  return collection.features.reduce<{ feature: AnyPolygonFeature; metros: number } | null>((best, feature) => {
    const metros = ringsOf(feature)
      .flat()
      .reduce((min, ring) => ring.reduce((distance, point, i) => Math.min(distance, segmentDistanceM(lat, lon, point, ring[(i + 1) % ring.length])), min), Number.POSITIVE_INFINITY);
    return best === null || metros < best.metros ? { feature, metros } : best;
  }, null);
}

export function categoriaDesdeGris(meta: ClimaMeta, gris: number): CategoriaClima | null {
  const index = meta.categoriaGris.findIndex((value) => Math.abs(value - gris) <= 1);
  if (index <= 0) {
    return null;
  }
  return meta.categorias[index] as CategoriaClima;
}

export function lecturaDistrito(datos: DefensaCivil, distrito: string): LecturaDistrito | null {
  const propio = datos.distritos[distrito];
  if (!propio) {
    return null;
  }
  return {
    distrito,
    participacion: datos.ciudad.total === 0 ? 0 : Math.round((propio.total / datos.ciudad.total) * PERCENT),
    mesPico: propio.mesPico,
  };
}

export function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split("-");
  return `${MES_LABEL[Number(numero) - 1]} de ${anio}`;
}

export function formatoDistancia(metros: number): string {
  return metros < 1000 ? `${Math.round(metros / 10) * 10} m` : `${(metros / 1000).toFixed(1)} km`;
}
