import { test } from "node:test";
import assert from "node:assert/strict";
import type { FeatureCollection, Polygon } from "geojson";
import { featureAt, nearestFeature } from "../src/lib/lookup";

test("la distancia al polígono se mide contra sus segmentos y no sólo sus vértices", () => {
  const collection: FeatureCollection<Polygon, Record<string, string>> = { type: "FeatureCollection", features: [{ type: "Feature", properties: { zona: "demo" }, geometry: { type: "Polygon", coordinates: [[[-60.67, -32.96], [-60.65, -32.96], [-60.65, -32.94], [-60.67, -32.94], [-60.67, -32.96]]] } }] };
  assert.equal(featureAt(collection, -32.95, -60.66)?.properties.zona, "demo");
  assert.equal(featureAt(collection, -32.961, -60.66), undefined);
  const nearest = nearestFeature(collection, -32.961, -60.66);
  assert.ok(nearest && nearest.metros > 100 && nearest.metros < 120);
});
