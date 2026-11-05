import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import floodZones from "../../public/data/flood-zones.json";
import { featureAt } from "@/lib/lookup";
import type { Report } from "@/lib/reportTypes";
import type { ZoneReports } from "@/lib/zoneAlert";

const zones = floodZones as unknown as FeatureCollection<Polygon | MultiPolygon, Record<string, string>>;

/** Agrupa los reportes activos por la zona oficial que los contiene. Los de afuera no cuentan. */
export function reportsByZone(reports: readonly Report[], collection = zones): Record<string, ZoneReports> {
  const byZone: Record<string, ZoneReports> = {};
  for (const report of reports) {
    const zone = featureAt(collection, report.lat, report.lon)?.properties?.zone;
    if (!zone) continue;
    const entry = (byZone[zone] ??= { count: 0, homes: 0, confirmations: 0 });
    entry.count += 1;
    if (report.type === "home") entry.homes += 1;
    entry.confirmations += report.confirmations;
  }
  return byZone;
}
