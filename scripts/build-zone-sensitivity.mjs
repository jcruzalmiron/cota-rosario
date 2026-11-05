// Sensibilidad por zona oficial: proporción de celdas del mapa municipal de riesgo
// climático (vivienda y hábitat ante lluvias torrenciales) que caen dentro de cada
// zona, por categoría. Sólo usa archivos ya generados en public/data.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT_DIR = "public/data";
/** ~0,07 km² a 10,5 m por celda: por debajo, la proporción depende de pocos píxeles de borde. */
const MIN_CELLS = 500;
const meta = JSON.parse(await readFile(`${OUT_DIR}/climate-risk.json`, "utf8"));
const zones = JSON.parse(await readFile(`${OUT_DIR}/flood-zones.json`, "utf8"));
const { data: pixels, info } = await sharp(`${OUT_DIR}/${meta.categoriesFile}`).greyscale().raw().toBuffer({ resolveWithObject: true });
if (info.width !== meta.width || info.height !== meta.height) throw new Error("el raster no coincide con climate-risk.json");

const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const inverseMercator = (value) => (Math.atan(Math.exp(value)) * 360) / Math.PI - 90;
const { west, east, north, south } = meta.bounds;
const mercNorth = mercator(north);
const mercSpan = mercNorth - mercator(south);

function inRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (lat, lon, rings) => inRing(lat, lon, rings[0]) && !rings.slice(1).some((hole) => inRing(lat, lon, hole));

function category(gray) {
  const index = meta.grayCategories.findIndex((value) => Math.abs(value - gray) <= 1);
  return index > 0 ? meta.categories[index] : null;
}

const counts = {};
for (const feature of zones.features) {
  const zone = feature.properties.zone;
  counts[zone] ??= Object.fromEntries(meta.categories.slice(1).map((name) => [name, 0]));
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const rings of polygons) {
    const lons = rings[0].map((point) => point[0]);
    const lats = rings[0].map((point) => point[1]);
    const colFrom = Math.max(0, Math.floor(((Math.min(...lons) - west) / (east - west)) * meta.width));
    const colTo = Math.min(meta.width - 1, Math.ceil(((Math.max(...lons) - west) / (east - west)) * meta.width));
    const rowFrom = Math.max(0, Math.floor(((mercNorth - mercator(Math.max(...lats))) / mercSpan) * meta.height));
    const rowTo = Math.min(meta.height - 1, Math.ceil(((mercNorth - mercator(Math.min(...lats))) / mercSpan) * meta.height));
    for (let row = rowFrom; row <= rowTo; row++) {
      const lat = inverseMercator(mercNorth - ((row + 0.5) / meta.height) * mercSpan);
      for (let col = colFrom; col <= colTo; col++) {
        const lon = west + ((col + 0.5) / meta.width) * (east - west);
        if (!inPolygon(lat, lon, rings)) continue;
        const name = category(pixels[row * meta.width + col]);
        if (name) counts[zone][name] += 1;
      }
    }
  }
}

const share = (row) => {
  const total = Object.values(row).reduce((sum, value) => sum + value, 0);
  return { cells: total, high: total ? row.high / total : 0, mediumOrHigh: total ? (row.medium + row.high) / total : 0 };
};
const all = Object.values(counts).reduce((sum, row) => {
  for (const [name, value] of Object.entries(row)) sum[name] = (sum[name] ?? 0) + value;
  return sum;
}, {});
const reference = share(all);

const output = {
  name: "Sensibilidad de cada zona oficial según el mapa municipal de riesgo climático",
  source: meta.source,
  layer: meta.layer,
  method:
    `Proporción de celdas de riesgo medio o alto dentro de los polígonos de cada zona oficial. Una zona es más sensible cuando esa proporción supera la del conjunto de las zonas oficiales. Con menos de ${MIN_CELLS} celdas la cobertura no alcanza y no se marca.`,
  reference: { highShare: round(reference.high), mediumOrHighShare: round(reference.mediumOrHigh), cells: reference.cells },
  zones: Object.fromEntries(
    Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([zone, row]) => {
        const value = share(row);
        return [zone, { cells: value.cells, highShare: round(value.high), mediumOrHighShare: round(value.mediumOrHigh), coverage: value.cells >= MIN_CELLS ? "suficiente" : "insuficiente", moreSensitive: value.cells >= MIN_CELLS && value.mediumOrHigh > reference.mediumOrHigh }];
      }),
  ),
  computedAt: new Date().toISOString(),
};

function round(value) {
  return Math.round(value * 1000) / 1000;
}

await writeFile(`${OUT_DIR}/zone-sensitivity.json`, JSON.stringify(output, null, 2) + "\n");
console.table(Object.fromEntries(Object.entries(output.zones).map(([zone, value]) => [zone, value])));
console.log("referencia", output.reference);
