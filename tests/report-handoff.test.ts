import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DRAFT, draftFromQuery, reportHrefFor } from "../src/lib/reportFlow";
import { reportsNear } from "../src/lib/reportTypes";

const report = (id: string, lat: number, lon: number, createdAt = "2026-10-24T05:00:00Z") => ({ id, lat, lon, type: "street" as const, description: "", createdAt, confirmations: 0, status: "new" as const, statusAt: createdAt, district: null, timeline: [] });

test("report link carries the searched point and its label", () => {
  const href = reportHrefFor({ lat: -32.952912345, lon: -60.631234567, label: "Mendoza 512, Centro" });
  const url = new URL(href, "https://cota.test");
  assert.equal(url.pathname, "/reportar");
  assert.equal(url.searchParams.get("lat"), "-32.95291");
  assert.equal(url.searchParams.get("lon"), "-60.63123");
  assert.equal(url.searchParams.get("lugar"), "Mendoza 512, Centro");
});

test("a valid query prefills the place of the draft", () => {
  assert.deepEqual(draftFromQuery({ lat: "-32.95291", lon: "-60.63123", lugar: "Mendoza 512, Centro" }), {
    ...EMPTY_DRAFT,
    lat: -32.95291,
    lon: -60.63123,
    placeLabel: "Mendoza 512, Centro",
  });
});

test("a point outside Rosario or garbage leaves the draft empty", () => {
  assert.deepEqual(draftFromQuery({ lat: "-34.6", lon: "-58.38", lugar: "Buenos Aires" }), EMPTY_DRAFT);
  assert.deepEqual(draftFromQuery({ lat: "abc", lon: "-60.6" }), EMPTY_DRAFT);
  assert.deepEqual(draftFromQuery({ lat: ["-32.95", "-32.9"], lon: "-60.63" }), EMPTY_DRAFT);
  assert.deepEqual(draftFromQuery({}), EMPTY_DRAFT);
});

test("a prefilled label is trimmed and capped, and defaults when missing", () => {
  const long = "x".repeat(300);
  assert.equal(draftFromQuery({ lat: "-32.95", lon: "-60.63", lugar: `  ${long}  ` }).placeLabel.length, 120);
  assert.equal(draftFromQuery({ lat: "-32.95", lon: "-60.63" }).placeLabel, "Dirección consultada");
});

test("nearby reports are the ones within the radius, closest first", () => {
  const point = { lat: -32.9529, lon: -60.6312 };
  const near = report("near", -32.9531, -60.6314);
  const mid = report("mid", -32.9555, -60.6312);
  const far = report("far", -32.97, -60.65);
  assert.deepEqual(reportsNear([far, mid, near], point, 500).map((entry) => entry.report.id), ["near", "mid"]);
  assert.ok(reportsNear([near], point, 500)[0].meters < 50);
});
