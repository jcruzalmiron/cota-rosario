import { test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("isolated store: validation, writes, confirmations, tracking, retention and corruption", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cota-reports-test-"));
  process.env.COTA_DATA_DIR = directory;
  const { createReport, confirmReport, getReport, listReports, parseReportFilter, queryOpsReports, queryReports, updateReportStatus, validateReport } = await import("../src/lib/reports");
  const { REPORT_STATUSES } = await import("../src/lib/reportTypes");
  const { argentinaDay } = await import("../src/lib/time");
  const input = { lat: -32.9468, lon: -60.6393, type: "street", description: "Prueba local de demo" };
  const file = path.join(directory, "reports.json");
  const stored = async () => JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>[];
  const filterFor = (query: string, now?: number) => parseReportFilter(new URLSearchParams(query), { allowDistrict: true, now });
  const today = () => filterFor("");

  await t.test("rejects inherited names and points outside the polygon", () => {
    assert.throws(() => validateReport({ ...input, type: "toString" }));
    assert.throws(() => validateReport({ ...input, lat: -32.8, lon: -60.55 }));
    assert.equal(validateReport({ ...input, description: " <b>Prueba</b> " }).description, "Prueba");
  });

  await t.test("status labels are in Spanish", () => {
    assert.deepEqual(Object.values(REPORT_STATUSES).map((status) => status.label), ["Nuevo", "En atención", "Resuelto", "Descartado"]);
  });

  const report = await createReport(input, "autor-demo");
  await t.test("a new report starts as new, with its district and a private first history entry", async () => {
    assert.equal(report.status, "new");
    assert.equal(report.statusAt, report.createdAt);
    assert.equal(report.district, "CENTRO");
    assert.deepEqual(report.timeline, [{ status: "new", at: report.createdAt }]);
    assert.equal(Object.hasOwn(report, "history"), false);
    assert.deepEqual((await stored())[0].history, [{ status: "new", at: report.createdAt, by: "vecino" }]);
  });

  await t.test("the same connection confirms once and the DTO reveals no keys", async () => {
    assert.equal((await confirmReport(report.id, "observador-a")).confirmations, 1);
    assert.equal((await confirmReport(report.id, "observador-a")).confirmations, 1);
    assert.equal((await confirmReport(report.id, "observador-b")).confirmations, 2);
    const rows = await listReports();
    assert.equal(rows.length, 1);
    assert.equal(Object.hasOwn(rows[0], "confirmationsBy"), false);
    assert.equal(Object.hasOwn(report, "confirmationsBy"), false);
  });

  await t.test("concurrent writes keep every report", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => createReport(input, `autor-${i}`)));
    assert.equal((await listReports()).length, 9);
    assert.equal((await stored()).length, 9);
  });

  await t.test("reports older than the map window are kept and stay trackable", async () => {
    const rows = await stored();
    const old = new Date(Date.now() - 25 * 3600000).toISOString();
    rows[0].createdAt = old;
    await writeFile(file, JSON.stringify(rows));
    assert.equal((await listReports()).length, 8);
    assert.equal((await stored()).length, 9);
    assert.equal((await getReport(report.id)).createdAt, old);
    const range = await queryReports(filterFor(`from=${argentinaDay(Date.parse(old))}&to=${argentinaDay()}`));
    assert.equal(range.reports.length, 9);
    assert.equal(range.counts.new, 9);
    assert.equal(range.truncated, false);
    await assert.rejects(() => getReport("no-existe"), { status: 404 });
  });

  await t.test("date filters use the Argentine calendar day", async () => {
    const rows = await stored();
    rows[1].createdAt = "2026-11-10T02:30:00.000Z"; // 9 de noviembre, 23:30 en Argentina
    rows[2].createdAt = "2026-11-10T03:00:00.000Z"; // 10 de noviembre, 00:00 en Argentina
    await writeFile(file, JSON.stringify(rows));
    const ninth = await queryReports(filterFor("from=2026-11-09&to=2026-11-09"));
    assert.deepEqual(ninth.reports.map((row) => row.id), [rows[1].id]);
    const tenth = await queryReports(filterFor("from=2026-11-10"));
    assert.deepEqual(tenth.reports.map((row) => row.id), [rows[2].id]);
    assert.deepEqual([tenth.from, tenth.to], ["2026-11-10", "2026-11-10"]);
    const both = await queryReports(filterFor("from=2026-11-09&to=2026-11-10"));
    assert.deepEqual(both.reports.map((row) => row.id), [rows[2].id, rows[1].id]);
    const atNight = filterFor("", Date.parse("2026-11-10T02:30:00.000Z"));
    assert.deepEqual([atNight.from, atNight.to], ["2026-11-09", "2026-11-09"]);
  });

  await t.test("invalid filters are rejected", () => {
    for (const query of ["from=2026-02-30", "from=10/11/2026", "from=2026-11-10&to=2026-11-09", "from=2025-01-01&to=2026-01-02", "status=abierto", "status=", "type=toString", "district=LUNA"]) {
      assert.throws(() => filterFor(query), { status: 400 }, query);
    }
    assert.equal(filterFor("from=2025-11-10&to=2026-11-10").from, "2025-11-10");
    assert.deepEqual(filterFor("status=new,resolved&type=home&district=centro,sur"), { ...today(), statuses: ["new", "resolved"], types: ["home"], districts: ["CENTRO", "SUR"] });
    assert.equal(parseReportFilter(new URLSearchParams("district=LUNA")).districts, null);
  });

  const tracked = await createReport({ ...input, type: "home", description: "Agua en el pasillo" }, "autor-seguimiento");
  await t.test("operators move a report through valid transitions only", async () => {
    await assert.rejects(() => updateReportStatus(tracked.id, { status: "archivado" }, "Ana"), { status: 400 });
    await assert.rejects(() => updateReportStatus(tracked.id, { status: "new" }, "Ana"), { status: 409 });
    await assert.rejects(() => updateReportStatus("no-existe", { status: "resolved" }, "Ana"), { status: 404 });
    await assert.rejects(() => updateReportStatus(tracked.id, { status: "in_progress", publicNote: "x".repeat(141) }, "Ana"), { status: 400 });

    const attending = await updateReportStatus(tracked.id, { status: "in_progress", note: "Sale cuadrilla interna 7", publicNote: " <i>Una cuadrilla va en camino</i> " }, "Ana");
    assert.equal(attending.status, "in_progress");
    assert.equal(attending.publicNote, "Una cuadrilla va en camino");
    assert.equal(attending.resolvedAt, undefined);
    assert.deepEqual(attending.history.at(-1), { status: "in_progress", at: attending.statusAt, by: "Ana", note: "Sale cuadrilla interna 7" });

    const noted = await updateReportStatus(tracked.id, { status: "in_progress", note: "Sigue el agua" }, "Ana");
    assert.equal(noted.statusAt, attending.statusAt);
    assert.equal(noted.publicNote, "Una cuadrilla va en camino");
    assert.equal(noted.history.length, 3);
    assert.equal(noted.timeline.length, 2);

    const resolved = await updateReportStatus(tracked.id, { status: "resolved" }, "Beto");
    assert.equal(resolved.resolvedAt, resolved.statusAt);
    await assert.rejects(() => updateReportStatus(tracked.id, { status: "dismissed" }, "Beto"), { status: 409 });
    await assert.rejects(() => updateReportStatus(tracked.id, { status: "new" }, "Beto"), { status: 409 });

    const reopened = await updateReportStatus(tracked.id, { status: "in_progress", publicNote: "" }, "Beto");
    assert.equal(reopened.resolvedAt, undefined);
    assert.equal(reopened.publicNote, undefined);
    assert.equal(Object.hasOwn((await stored()).find((row) => row.id === tracked.id)!, "resolvedAt"), false);

    assert.equal((await updateReportStatus(tracked.id, { status: "new" }, "Beto")).status, "new");
    const dismissed = await updateReportStatus(tracked.id, { status: "dismissed", note: "Duplicado" }, "Beto");
    assert.equal(dismissed.status, "dismissed");
    await assert.rejects(() => updateReportStatus(tracked.id, { status: "resolved" }, "Beto"), { status: 409 });
    await assert.rejects(() => updateReportStatus(tracked.id, { status: "in_progress" }, "Beto"), { status: 409 });
    assert.deepEqual(dismissed.history.map((entry) => entry.status), ["new", "in_progress", "in_progress", "resolved", "in_progress", "new", "dismissed"]);
  });

  await t.test("public views never expose the history, the operator or internal notes", async () => {
    const page = await queryReports(today());
    const single = await getReport(tracked.id);
    const text = JSON.stringify([page, single, await listReports()]);
    for (const secret of ["history", '"by"', "Ana", "Beto", "cuadrilla interna", "Duplicado", "confirmationsBy", '"note"']) {
      assert.equal(text.includes(secret), false, secret);
    }
    assert.equal(single.status, "dismissed");
    assert.equal(single.description, "");
    assert.deepEqual(single.timeline.map((step) => step.status), ["new", "in_progress", "resolved", "in_progress", "new", "dismissed"]);
    assert.equal(page.counts.dismissed, 1);
    assert.equal((await queryReports(filterFor("status=dismissed"))).reports.length, 1);
    assert.equal((await queryReports(filterFor("status=dismissed"))).counts.new, page.counts.new);
    const ops = (await queryOpsReports(filterFor("status=dismissed"))).reports[0];
    assert.equal(ops.description, "Agua en el pasillo");
    assert.equal(ops.history.at(-1)?.by, "Beto");
    assert.equal((await queryOpsReports(filterFor("district=SUR"))).reports.length, 0);
  });

  await t.test("closed reports cannot be confirmed and leave the map", async () => {
    await assert.rejects(() => confirmReport(tracked.id, "observador-c"), { status: 409, message: /descartado/ });
    await updateReportStatus(tracked.id, { status: "new" }, "Beto");
    await updateReportStatus(tracked.id, { status: "resolved" }, "Beto");
    await assert.rejects(() => confirmReport(tracked.id, "observador-c"), { status: 409, message: /resuelto/ });
    await assert.rejects(() => confirmReport("no-existe", "observador-c"), { status: 404 });
    assert.equal((await listReports()).some((row) => row.id === tracked.id), false);
  });

  await t.test("only open reports count towards the cap and long ranges are truncated", async () => {
    const original = await readFile(file, "utf8");
    const [template] = await stored();
    const createdAt = new Date().toISOString();
    const rows = Array.from({ length: 2001 }, (_, i) => ({ ...template, id: `fila-${i}`, createdAt, status: i < 500 ? "new" : "resolved", statusAt: createdAt }));
    await writeFile(file, JSON.stringify(rows));
    await assert.rejects(() => createReport(input, "autor-tope"), { status: 503 });
    const page = await queryReports(today());
    assert.equal(page.reports.length, 2000);
    assert.equal(page.truncated, true);
    assert.deepEqual(page.counts, { new: 500, in_progress: 0, resolved: 1501, dismissed: 0 });
    rows[0].status = "resolved";
    await writeFile(file, JSON.stringify(rows));
    assert.equal((await createReport(input, "autor-tope")).status, "new");
    await writeFile(file, original);
  });

  await t.test("a corrupt file fails without deleting it or returning zero reports", async () => {
    await writeFile(file, "{archivo roto");
    await assert.rejects(listReports, { status: 503 });
    await assert.rejects(() => queryReports(today()), { status: 503 });
    await assert.rejects(() => createReport(input, "autor-final"), { status: 503 });
    assert.equal(await readFile(file, "utf8"), "{archivo roto");
    await writeFile(file, JSON.stringify([{ ...report, status: "archivado" }]));
    await assert.rejects(listReports, { status: 503 });
  });

  await t.test("rows stored before tracking become new reports with district and history", async () => {
    const createdAt = new Date().toISOString();
    await writeFile(file, JSON.stringify([{ id: "previo", lat: input.lat, lon: input.lon, type: "drain", description: "Boca de tormenta tapada", createdAt, confirmations: 1, confirmationsBy: ["clave"] }]));
    const [migrated] = (await queryOpsReports(today())).reports;
    assert.equal(migrated.status, "new");
    assert.equal(migrated.statusAt, createdAt);
    assert.equal(migrated.district, "CENTRO");
    assert.deepEqual(migrated.history, [{ status: "new", at: createdAt, by: "vecino" }]);
    await updateReportStatus("previo", { status: "in_progress" }, "Ana");
    const [row] = await stored();
    assert.equal(row.status, "in_progress");
    assert.deepEqual(row.confirmationsBy, ["clave"]);
    assert.equal((row.history as unknown[]).length, 2);
  });

  await t.test("reads a legacy Spanish store, migrates its rows and removes it on the next write", async () => {
    await unlink(file);
    const legacy = path.join(directory, "reportes.json");
    await writeFile(legacy, JSON.stringify([{ id: "legado", lat: input.lat, lon: input.lon, tipo: "vivienda", descripcion: "Agua en la casa", creadoEn: new Date().toISOString(), confirmaciones: 2 }]));
    const [migrated] = await listReports();
    assert.equal(migrated.type, "home");
    assert.equal(migrated.description, "Agua en la casa");
    assert.equal(migrated.confirmations, 2);
    assert.equal(migrated.status, "new");
    assert.equal(migrated.district, "CENTRO");
    await createReport(input, "after-migration");
    const rows = await stored();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0].history, [{ status: "new", at: rows[0].createdAt, by: "vecino" }]);
    await assert.rejects(() => access(legacy));
  });
});
