import { test } from "node:test";
import assert from "node:assert/strict";
import civilDefense from "../public/data/civil-defense.json";
import type { RainOutlook } from "../src/lib/rain";
import { DEFAULT_STAFFING_PARAMS, STAFFING_ASSUMED_LABEL, defaultDemandModel, demandFromOutlook, estimateDemand, fitDemandModel, monthlyExpected, staffing, type DemandMonth } from "../src/lib/forecast/demand";

const series = civilDefense.series as DemandMonth[];
const fitOptions = { source: civilDefense.source, endpoints: civilDefense.endpoints, rainSource: civilDefense.rain.source, rainEndpoint: civilDefense.rain.endpoint, computedAt: civilDefense.computedAt };
const model = fitDemandModel(series, fitOptions);

/** Serie sintética sin ruido: casos = 2 · max(0, lluvia − 30). Vive solo en el test. */
function thresholdSeries(): DemandMonth[] {
  return Array.from({ length: 24 }, (_, i) => {
    const rainMm = 5 + i * 9;
    const cases = 2 * Math.max(0, rainMm - 30);
    return { month: `2001-${String(i + 1).padStart(2, "0")}`, rainMm, cases, byDistrict: { A: cases } };
  });
}

test("the model card documents data, period, candidates and limits", () => {
  const { card } = model;
  assert.equal(card.months, series.length);
  assert.deepEqual(card.period, { from: "2021-01", until: "2024-01" });
  assert.equal(card.dataSource, civilDefense.source);
  assert.deepEqual(card.endpoints, civilDefense.endpoints);
  assert.equal(card.rainEndpoint, civilDefense.rain.endpoint);
  assert.equal(card.computedAt, civilDefense.computedAt);
  assert.deepEqual(card.candidates.map((candidate) => candidate.id).sort(), ["poisson-log1p", "ratio", "threshold-power"]);
  for (const candidate of card.candidates) {
    assert.ok(Number.isFinite(candidate.looMae) && candidate.looMae > 0, candidate.id);
    assert.ok(candidate.looCoverage >= 0 && candidate.looCoverage <= 1, candidate.id);
    assert.ok(candidate.looMae < card.looMaeMeanReference, `${candidate.id} debe ganarle a la media`);
  }
  const chosen = card.candidates.filter((candidate) => candidate.chosen);
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].id, card.chosenModel);
  assert.equal(chosen[0].looMae, Math.min(...card.candidates.map((candidate) => candidate.looMae)));
  assert.ok(card.interval.looCoverage >= 0.6 && card.interval.looCoverage <= 0.95);
  const limitations = card.limitations.join(" ");
  assert.match(limitations, /mensual/);
  assert.match(limitations, /2024 solo hay un mes/);
  assert.match(limitations, /reanálisis/);
  assert.match(limitations, /atendidas/);
  assert.match(card.staffingNote, /no cifras oficiales/);
});

test("the river is not included without overlapping months and leaves a qualitative note", () => {
  assert.equal(model.card.river.included, false);
  assert.equal(model.card.river.overlappingMonths, 0);
  assert.match(model.card.river.note, /cualitativo/);
  assert.equal(estimateDemand(model, 10, 20).riverNote, model.card.river.note);
});

test("a river series unrelated to the cases is tested and only enters if it improves LOO", () => {
  const river = series.map((month, i) => ({ month: month.month, meters: 2 + ((i * 7) % 5) * 0.3 }));
  const withRiver = fitDemandModel(series, { river });
  assert.equal(withRiver.card.river.overlappingMonths, series.length);
  assert.ok(withRiver.card.river.looMaeWithRiver !== null);
  const best = Math.min(...model.card.candidates.map((candidate) => candidate.looMae));
  assert.equal(withRiver.card.river.included, withRiver.card.river.looMaeWithRiver < best);
  assert.equal(withRiver.id === "poisson-log1p-river", withRiver.card.river.included);
});

test("more rain never means fewer interventions and the range stays ordered", () => {
  let previous = { expected: 0, low: 0, high: 0 };
  for (let mm = 0; mm <= 300; mm += 2.5) {
    const { h24, h48 } = estimateDemand(model, mm, mm * 1.5);
    for (const h of [h24, h48]) {
      assert.ok(0 <= h.low && h.low <= h.expected && h.expected <= h.high, `orden a ${mm} mm`);
      assert.ok([h.low, h.expected, h.high].every(Number.isInteger));
    }
    assert.ok(h24.expected >= previous.expected && h24.low >= previous.low && h24.high >= previous.high, `monotonía a ${mm} mm`);
    assert.ok(h48.expected >= h24.expected && h48.high >= h24.high);
    previous = h24;
  }
  assert.ok(monthlyExpected(model, 200) > monthlyExpected(model, 20));
});

test("no rain means no expected interventions and a zero low bound", () => {
  const { h24, h48 } = estimateDemand(model, 0, 0);
  assert.equal(h24.expected, 0);
  assert.equal(h24.low, 0);
  assert.equal(h48.expected, 0);
  assert.equal(h48.low, 0);
  assert.ok(h24.districts.every((district) => district.expected === 0 && district.low === 0));
});

test("48 h is cumulative, invalid rain is rejected and extrapolation is flagged", () => {
  assert.equal(estimateDemand(model, 30, 10).h48.rainMm, 30);
  assert.throws(() => estimateDemand(model, -1, 0));
  assert.throws(() => estimateDemand(model, Number.NaN, 0));
  const inside = estimateDemand(model, 50, 80);
  assert.equal(inside.h48.extrapolated, false);
  assert.ok(inside.assumptions.length >= 5);
  assert.match(inside.assumptions[0], /Supuesto fuerte/);
  const outside = estimateDemand(model, 100, model.rainRange.max + 1);
  assert.equal(outside.h24.extrapolated, false);
  assert.equal(outside.h48.extrapolated, true);
  assert.match(outside.assumptions.join(" "), /extrapolación/);
});

test("district shares add up to one and the split matches the city total", () => {
  assert.equal(model.districts.length, Object.keys(civilDefense.districts).length);
  assert.ok(Math.abs(model.districts.reduce((acc, district) => acc + district.share, 0) - 1) < 1e-9);
  for (const district of model.districts) {
    assert.ok(district.shareLow <= district.share && district.share <= district.shareHigh, district.district);
    const total = civilDefense.districts[district.district as keyof typeof civilDefense.districts].total;
    assert.ok(Math.abs(district.share - total / civilDefense.city.total) < 1e-9, district.district);
  }
  const { h24 } = estimateDemand(model, 90, 120);
  assert.equal(h24.districts.reduce((acc, district) => acc + district.expected, 0), h24.expected);
  assert.ok(Math.abs(h24.districts.reduce((acc, district) => acc + district.share, 0) - 1) < 1e-3);
  for (const district of h24.districts) assert.ok(district.low <= district.expected && district.expected <= district.high, district.district);
  assert.equal(h24.districts[0].district, "CENTRO");
});

test("staffing uses ceil math and flags every default as an assumption", () => {
  const byDefault = staffing({ horizonHours: 24, low: 23, expected: 59, high: 105 });
  assert.equal(byDefault.shifts, 3);
  assert.deepEqual(byDefault.crews, { low: 2, expected: 5, high: 9 });
  assert.deepEqual(byDefault.people, { low: 6, expected: 15, high: 27 });
  assert.deepEqual(byDefault.personShifts, { low: 18, expected: 45, high: 81 });
  for (const key of Object.keys(DEFAULT_STAFFING_PARAMS) as (keyof typeof DEFAULT_STAFFING_PARAMS)[]) {
    assert.equal(byDefault.params[key].assumed, true);
    assert.equal(byDefault.params[key].label, STAFFING_ASSUMED_LABEL);
    assert.equal(byDefault.params[key].value, DEFAULT_STAFFING_PARAMS[key]);
  }
  assert.equal(STAFFING_ASSUMED_LABEL, "supuesto a validar con Defensa Civil");

  const custom = staffing({ horizonHours: 48, low: 0, expected: 61, high: 121 }, { interventionsPerCrewPerShift: 5, shiftHours: 12 });
  assert.equal(custom.shifts, 4);
  assert.deepEqual(custom.crews, { low: 0, expected: 4, high: 7 });
  assert.deepEqual(custom.people, { low: 0, expected: 12, high: 21 });
  assert.equal(custom.params.interventionsPerCrewPerShift.assumed, false);
  assert.equal(custom.params.shiftHours.assumed, false);
  assert.equal(custom.params.peoplePerCrew.assumed, true);
  assert.throws(() => staffing({ horizonHours: 24, low: 0, expected: 1, high: 2 }, { shiftHours: 0 }));
  assert.throws(() => staffing({ horizonHours: 24, low: 0, expected: Number.NaN, high: 2 }));

  const { h24 } = estimateDemand(model, 60, 60);
  assert.equal(staffing(h24).crews.high, Math.ceil(h24.high / (4 * 3)));
});

test("fitting and estimating are deterministic", () => {
  const again = fitDemandModel([...series].reverse(), fitOptions);
  assert.deepEqual(again, model);
  assert.deepEqual(defaultDemandModel(), model);
  assert.deepEqual(estimateDemand(again, 42.5, 77), estimateDemand(model, 42.5, 77));
});

test("the outlook maps today and today plus tomorrow to 24 and 48 h", () => {
  const day = (date: string, millimeters: number) => ({ date, millimeters, probability: null, max2h: 0 });
  const days = [day("2026-11-13", 35), day("2026-11-14", 20), day("2026-11-15", 90)];
  const outlook: RainOutlook = { windowDays: 7, days, total: 145, max2h: 0, maxDay: days[2], fetchedAt: "2026-11-13T12:00:00.000Z" };
  const fromOutlook = demandFromOutlook(outlook);
  const direct = estimateDemand(model, 35, 55);
  assert.deepEqual(fromOutlook.h24, direct.h24);
  assert.deepEqual(fromOutlook.h48, direct.h48);
  assert.match(fromOutlook.assumptions.at(-1) ?? "", /día calendario/);
  assert.throws(() => demandFromOutlook({ ...outlook, days: days.slice(0, 1) }));
});

test("a synthetic thresholded series selects the threshold model and recovers it", () => {
  const fitted = fitDemandModel(thresholdSeries());
  assert.equal(fitted.id, "threshold-power");
  assert.equal(fitted.coefficients.r0, 30);
  assert.equal(fitted.coefficients.p, 1);
  assert.ok(Math.abs(fitted.coefficients.k - 2) < 1e-6);
  const ratio = fitted.card.candidates.find((candidate) => candidate.id === "ratio");
  const chosen = fitted.card.candidates.find((candidate) => candidate.chosen);
  assert.ok(ratio && chosen && chosen.looMae < ratio.looMae);
  assert.equal(estimateDemand(fitted, 20, 20).h24.expected, 0);
  assert.equal(estimateDemand(fitted, 80, 80).h24.expected, 100);
  assert.equal(fitted.districts.length, 1);
  assert.equal(fitted.districts[0].share, 1);
});

test("a series that is too short or invalid is rejected", () => {
  assert.throws(() => fitDemandModel(series.slice(0, 5)));
  assert.throws(() => fitDemandModel(series.map((month) => ({ ...month, rainMm: -1 }))));
});
