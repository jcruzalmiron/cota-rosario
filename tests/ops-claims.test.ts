import { test } from "node:test";
import assert from "node:assert/strict";
import { claimStats, claimsApiParams, claimsViewFromParams, claimsViewParams, durationFigure, formatDuration, periodRange, triageOrder } from "../src/lib/opsClaims";
import type { Report, ReportStatus, ReportType } from "../src/lib/reportTypes";

const TODAY = "2026-11-13";
/** 13/11/2026 15:00 en Argentina. */
const NOW = Date.parse("2026-11-13T18:00:00Z");

/** Reclamo armado en el test; no sale de ninguna fuente ni se muestra en la app. */
function claim(id: string, status: ReportStatus, createdAt: string, extra: Partial<Report> = {}): Report {
  return { id, lat: -32.95, lon: -60.64, type: "street" as ReportType, description: "", createdAt, confirmations: 0, status, statusAt: createdAt, district: "CENTRO", timeline: [{ status: "new", at: createdAt }], ...extra };
}

test("relative periods resolve against the Argentine day", () => {
  assert.deepEqual(periodRange("hoy", TODAY), { from: TODAY, to: TODAY });
  assert.deepEqual(periodRange("ayer", TODAY), { from: "2026-11-12", to: "2026-11-12" });
  assert.deepEqual(periodRange("7d", TODAY), { from: "2026-11-07", to: TODAY });
  assert.deepEqual(periodRange("30d", TODAY), { from: "2026-10-15", to: TODAY });
});

test("the view defaults to today and ignores invalid parameters", () => {
  const view = claimsViewFromParams({ periodo: "siempre", status: "new,bogus", type: "volcano", orden: "x" }, TODAY);
  assert.deepEqual(view, { period: "hoy", from: TODAY, to: TODAY, statuses: ["new"], type: null, district: null, order: "prioridad" });
  assert.equal(claimsViewParams(view).toString(), "status=new");
});

test("an explicit range wins over the relative period and is normalised", () => {
  const view = claimsViewFromParams({ periodo: "7d", from: "2026-11-10", to: "2026-11-01", district: "sur", status: "resolved,new" }, TODAY);
  assert.equal(view.period, "rango");
  assert.equal(view.from, "2026-11-01");
  assert.equal(view.to, "2026-11-10");
  assert.equal(view.district, "SUR");
  assert.deepEqual(view.statuses, ["new", "resolved"]);
  assert.equal(claimsViewParams(view).toString(), "from=2026-11-01&to=2026-11-10&status=new%2Cresolved&district=SUR");
  assert.equal(claimsApiParams(view).toString(), "from=2026-11-01&to=2026-11-10&status=new%2Cresolved&district=SUR");
});

test("a shared relative link keeps the period instead of fixed dates", () => {
  const view = claimsViewFromParams({ periodo: "7d", type: "home", orden: "recientes" }, TODAY);
  assert.equal(claimsViewParams(view).toString(), "periodo=7d&type=home&orden=recientes");
  assert.equal(claimsApiParams(view).get("from"), "2026-11-07");
  assert.equal(claimsViewFromParams({ from: "2026-02-30" }, TODAY).period, "hoy");
});

test("triage puts untaken first, then homes, confirmations and the longest wait", () => {
  const ordered = triageOrder([
    claim("closed", "resolved", "2026-11-13T10:00:00Z", { statusAt: "2026-11-13T12:00:00Z" }),
    claim("street-new", "new", "2026-11-13T09:00:00Z"),
    claim("taken-home", "in_progress", "2026-11-13T08:00:00Z", { type: "home" }),
    claim("street-old", "new", "2026-11-13T07:00:00Z"),
    claim("confirmed", "new", "2026-11-13T11:00:00Z", { confirmations: 4 }),
    claim("home-new", "new", "2026-11-13T12:00:00Z", { type: "home" }),
    claim("dismissed", "dismissed", "2026-11-13T06:00:00Z"),
  ]);
  assert.deepEqual(ordered.map((item) => item.id), ["home-new", "confirmed", "street-old", "street-new", "taken-home", "closed", "dismissed"]);
});

test("stats count the open backlog, today's closures and resolution time", () => {
  const stats = claimStats(
    [
      claim("old-open", "new", "2026-11-11T12:00:00Z", { type: "home" }),
      claim("taken", "in_progress", "2026-11-13T14:00:00Z"),
      claim("fixed-today", "resolved", "2026-11-13T13:00:00Z", { statusAt: "2026-11-13T15:00:00Z", resolvedAt: "2026-11-13T15:00:00Z" }),
      claim("fixed-today-slow", "resolved", "2026-11-12T11:00:00Z", { statusAt: "2026-11-13T15:00:00Z", resolvedAt: "2026-11-13T15:00:00Z" }),
      claim("fixed-yesterday", "resolved", "2026-11-12T10:00:00Z", { statusAt: "2026-11-12T11:00:00Z", resolvedAt: "2026-11-12T11:00:00Z" }),
      claim("dropped", "dismissed", "2026-11-13T16:00:00Z", { statusAt: "2026-11-13T16:30:00Z" }),
    ],
    NOW,
  );
  assert.equal(stats.waiting, 1);
  assert.equal(stats.inProgress, 1);
  assert.equal(stats.receivedToday, 3);
  assert.equal(stats.resolvedToday, 2);
  assert.equal(stats.dismissedToday, 1);
  assert.equal(stats.meanResolveMsToday, 15 * 3_600_000);
  assert.equal(stats.resolvedRecent, 3);
  assert.equal(stats.oldestOpen?.id, "old-open");
  assert.equal(stats.oldestOpen?.waitMs, 54 * 3_600_000);
  assert.equal(stats.openHomes, 1);
  assert.equal(stats.total, 6);
  assert.equal(stats.resolvedTotal, 3);
  assert.equal(stats.firstAt, "2026-11-11T12:00:00Z");
});

test("stats without data report nothing instead of zeros that look measured", () => {
  const stats = claimStats([], NOW);
  assert.equal(stats.meanResolveMsToday, null);
  assert.equal(stats.meanResolveMsRecent, null);
  assert.equal(stats.oldestOpen, null);
  assert.equal(stats.firstAt, null);
});

test("a resolution late at night counts on the Argentine day, not the UTC day", () => {
  const stats = claimStats([claim("late", "resolved", "2026-11-13T01:00:00Z", { statusAt: "2026-11-13T02:30:00Z", resolvedAt: "2026-11-13T02:30:00Z" })], NOW);
  assert.equal(stats.resolvedToday, 0);
  assert.equal(stats.receivedToday, 0);
});

test("durations read naturally", () => {
  assert.equal(formatDuration(20_000), "menos de 1 min");
  assert.equal(formatDuration(12 * 60_000), "12 min");
  assert.equal(formatDuration(3 * 3_600_000 + 20 * 60_000), "3 h 20 min");
  assert.equal(formatDuration(2 * 86_400_000 + 4 * 3_600_000), "2 d 4 h");
  assert.deepEqual(durationFigure(45 * 60_000), { value: 45, unit: "min", decimals: 0 });
  assert.deepEqual(durationFigure(90 * 60_000), { value: 1.5, unit: "h", decimals: 1 });
});
