import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MY_REPORTS_MAX,
  ago,
  claimSteps,
  claimsUrl,
  dayLabel,
  districtTotals,
  filterClaims,
  forgetReport,
  groupByDay,
  historyMonths,
  momentLabel,
  overlapsHistory,
  parseMyReports,
  partialYears,
  placeLabel,
  presetRange,
  rangeLabel,
  rangeProblem,
  rememberReport,
  toggled,
  totalClaims,
  type CivilDefenseHistory,
} from "../src/lib/claims";

const TODAY = "2026-11-13";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

test("date presets are counted in Argentine calendar days and include today", () => {
  assert.deepEqual(presetRange("today", TODAY), { from: TODAY, to: TODAY });
  assert.deepEqual(presetRange("yesterday", TODAY), { from: "2026-11-12", to: "2026-11-12" });
  assert.deepEqual(presetRange("week", TODAY), { from: "2026-11-07", to: TODAY });
  assert.deepEqual(presetRange("month", "2026-03-01"), { from: "2026-01-31", to: "2026-03-01" });
});

test("a hand-picked range is rejected with a reason before it reaches the API", () => {
  assert.equal(rangeProblem({ from: "2026-11-01", to: TODAY }, TODAY), null);
  assert.equal(rangeProblem({ from: "2025-11-13", to: "2026-11-13" }, TODAY), null);
  assert.match(rangeProblem({ from: "", to: TODAY }, TODAY) ?? "", /dos fechas/);
  assert.match(rangeProblem({ from: TODAY, to: "2026-11-01" }, TODAY) ?? "", /anterior/);
  assert.match(rangeProblem({ from: TODAY, to: "2026-11-14" }, TODAY) ?? "", /futuras/);
  assert.match(rangeProblem({ from: "2025-11-12", to: "2026-11-13" }, TODAY) ?? "", /un año/);
  assert.equal(claimsUrl({ from: "2026-11-07", to: TODAY }), "/api/reports?from=2026-11-07&to=2026-11-13");
});

test("days and moments read in plain words, in Argentine time", () => {
  assert.equal(dayLabel(TODAY, TODAY), "hoy");
  assert.equal(dayLabel("2026-11-12", TODAY), "ayer");
  assert.equal(dayLabel("2026-11-02", TODAY), "2 nov");
  assert.equal(dayLabel("2021-01-05", TODAY), "5 ene 2021");
  assert.equal(rangeLabel({ from: TODAY, to: TODAY }, TODAY), "hoy");
  assert.equal(rangeLabel({ from: "2026-11-07", to: TODAY }, TODAY), "del 7 nov a hoy");
  assert.equal(rangeLabel({ from: "2021-01-01", to: "2021-03-31" }, TODAY), "del 1 ene 2021 al 31 mar 2021");
  // 17:02 UTC son las 14:02 en Argentina; 02:30 UTC del 13 todavía es el 12 a las 23:30.
  assert.equal(momentLabel("2026-11-13T17:02:00Z", TODAY), "14:02");
  assert.equal(momentLabel("2026-11-13T02:30:00Z", TODAY), "ayer 23:30");
  assert.equal(momentLabel("no es una fecha", TODAY), "—");
});

test("elapsed time never goes negative and switches units", () => {
  const now = Date.parse("2026-11-13T15:00:00Z");
  assert.equal(ago("2026-11-13T15:00:20Z", now), "recién");
  assert.equal(ago("2026-11-13T14:48:00Z", now), "hace 12 min");
  assert.equal(ago("2026-11-13T12:00:00Z", now), "hace 3 h");
  assert.equal(ago("2026-11-12T12:00:00Z", now), "hace 1 día");
  assert.equal(ago("2026-11-10T15:00:00Z", now), "hace 3 días");
  assert.equal(ago("", now), "sin hora");
});

test("the public timeline names each step and marks a reopened claim", () => {
  const base = { createdAt: "2026-11-13T17:02:00Z", status: "resolved" as const, statusAt: "2026-11-13T19:10:00Z" };
  const steps = claimSteps({
    ...base,
    timeline: [
      { status: "new", at: "2026-11-13T17:02:00Z" },
      { status: "in_progress", at: "2026-11-13T17:30:00Z" },
      { status: "new", at: "2026-11-13T18:00:00Z" },
      { status: "resolved", at: "2026-11-13T19:10:00Z" },
    ],
  });
  assert.deepEqual(steps.map((step) => step.label), ["Recibido", "En atención", "Reabierto", "Resuelto"]);
  assert.deepEqual(claimSteps({ ...base, timeline: [] }), [{ status: "new", label: "Recibido", at: base.createdAt }]);
});

test("the place shown for a claim is the district, never an address", () => {
  assert.equal(placeLabel("NOROESTE"), "Distrito Noroeste");
  assert.equal(placeLabel("sudoeste"), "Distrito Sudoeste");
  assert.equal(placeLabel(null), "Rosario");
});

test("filters pass everything when empty and combine status with type", () => {
  const reports = [
    { id: "a", status: "new" as const, type: "street" as const },
    { id: "b", status: "resolved" as const, type: "street" as const },
    { id: "c", status: "resolved" as const, type: "drain" as const },
  ];
  assert.equal(filterClaims(reports, { statuses: [], types: [] }).length, 3);
  assert.deepEqual(filterClaims(reports, { statuses: ["resolved"], types: ["street"] }).map((report) => report.id), ["b"]);
  assert.deepEqual(toggled(["new"], "resolved"), ["new", "resolved"]);
  assert.deepEqual(toggled(["new", "resolved"], "new"), ["resolved"]);
  assert.equal(totalClaims({ new: 2, in_progress: 1, resolved: 4, dismissed: 1 }), 8);
});

test("claims are grouped by Argentine day keeping the newest first", () => {
  const groups = groupByDay([{ createdAt: "2026-11-13T12:00:00Z" }, { createdAt: "2026-11-13T02:00:00Z" }, { createdAt: "2026-11-12T20:00:00Z" }]);
  assert.deepEqual(groups.map((group) => [group.day, group.reports.length]), [["2026-11-13", 1], ["2026-11-12", 2]]);
});

test("my reports keep only valid ids, newest first, capped", () => {
  assert.deepEqual(parseMyReports(null), []);
  assert.deepEqual(parseMyReports("{no json"), []);
  assert.deepEqual(parseMyReports(JSON.stringify({ id: ID_A })), []);
  assert.deepEqual(parseMyReports(JSON.stringify([ID_A, 7, "<script>", ID_A, ID_B])), [ID_A, ID_B]);
  assert.deepEqual(rememberReport([ID_A], ID_B), [ID_B, ID_A]);
  assert.deepEqual(rememberReport([ID_A, ID_B], ID_A), [ID_A, ID_B]);
  assert.deepEqual(rememberReport([ID_A], "not-an-id"), [ID_A]);
  const many = Array.from({ length: MY_REPORTS_MAX + 3 }, (_, index) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`);
  assert.equal(many.reduce<string[]>((list, id) => rememberReport(list, id), []).length, MY_REPORTS_MAX);
  assert.deepEqual(forgetReport([ID_A, ID_B], ID_A), [ID_B]);
});

test("the Civil Defense history is read by month and never matched to days outside its period", () => {
  const history = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "civil-defense.json"), "utf8")) as CivilDefenseHistory;
  assert.equal(overlapsHistory(history, { from: "2021-01-10", to: "2021-03-02" }), true);
  assert.equal(overlapsHistory(history, { from: "2024-01-31", to: "2024-02-10" }), true);
  assert.equal(overlapsHistory(history, { from: "2024-02-01", to: "2024-03-01" }), false);
  assert.equal(overlapsHistory(history, { from: "2026-11-07", to: TODAY }), false);
  assert.deepEqual(historyMonths(history, { from: "2021-01-10", to: "2021-03-02" }).map((entry) => entry.month), ["2021-01", "2021-02", "2021-03"]);
  assert.deepEqual(historyMonths(history, { from: "2026-11-07", to: TODAY }), []);
  const totals = districtTotals(history);
  assert.equal(totals.reduce((sum, entry) => sum + entry.total, 0), history.city.total);
  assert.ok(totals.every((entry, index) => index === 0 || entry.total <= totals[index - 1].total));
  assert.ok(partialYears(history).some((entry) => entry.year === "2024"));
});
