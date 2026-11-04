import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { RasterMeta } from "@/lib/rasters";
import type { RiskLevel } from "@/lib/risk";

export type ClimateCategory = "very low" | "low" | "medium" | "high";

export const CLIMATE_CATEGORY_LABEL: Record<ClimateCategory, string> = { "very low": "muy bajo", low: "bajo", medium: "medio", high: "alto" };

export interface ClimateMeta extends RasterMeta {
  name: string;
  source: string;
  unit: string;
  categories: string[];
  grayCategories: number[];
  categoriesFile: string;
}

export interface PeakMonth {
  month: string;
  cases: number;
  rainMm: number;
}

export interface FloodingSummary {
  total: number;
  byYear: Record<string, number>;
  peakMonth: PeakMonth | null;
}

export interface CivilDefense {
  period: { from: string; until: string };
  monthsPerYear: Record<string, number>;
  districts: Record<string, FloodingSummary>;
  city: FloodingSummary;
}

export interface DistrictReading {
  district: string;
  share: number;
  peakMonth: PeakMonth | null;
}

export interface TerrainMeta extends RasterMeta {
  maxScaleMeters: number;
  windowMeters: number;
  builtMask: string;
}

export type TerrainReading = { status: "low" | "flat" | "built"; meters: number } | null;

export interface Finding {
  label: string;
  zone?: string;
  level?: RiskLevel | null;
  /** Por qué la zona tiene ese color (exposición, señal y vigencia). */
  basis?: string;
  inside: boolean;
  nearest: { zone: string; meters: number } | null;
  terrain: TerrainReading;
  climateRisk: ClimateCategory | null;
  district: DistrictReading | null;
  neighbourhood: string | null;
}

type AnyPolygonFeature = Feature<Polygon | MultiPolygon, Record<string, string>>;

const PERCENT = 100;
const EARTH_RADIUS_M = 6371000;
const MONTH_LABEL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

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
  return collection.features.reduce<{ feature: AnyPolygonFeature; meters: number } | null>((best, feature) => {
    const meters = ringsOf(feature)
      .flat()
      .reduce((min, ring) => ring.reduce((distance, point, i) => Math.min(distance, segmentDistanceM(lat, lon, point, ring[(i + 1) % ring.length])), min), Number.POSITIVE_INFINITY);
    return best === null || meters < best.meters ? { feature, meters } : best;
  }, null);
}

export function categoryFromGray(meta: ClimateMeta, gray: number): ClimateCategory | null {
  const index = meta.grayCategories.findIndex((value) => Math.abs(value - gray) <= 1);
  if (index <= 0) {
    return null;
  }
  return meta.categories[index] as ClimateCategory;
}

export function districtReading(data: CivilDefense, district: string): DistrictReading | null {
  const own = data.districts[district];
  if (!own) {
    return null;
  }
  return {
    district,
    share: data.city.total === 0 ? 0 : Math.round((own.total / data.city.total) * PERCENT),
    peakMonth: own.peakMonth,
  };
}

export function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTH_LABEL[Number(number) - 1]} de ${year}`;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
