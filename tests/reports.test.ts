import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("almacenamiento aislado: validación, escritura, confirmaciones, vencimiento y corrupción", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cota-reports-test-"));
  process.env.COTA_DATA_DIR = directory;
  const { createReport, confirmReport, listReports, validateReport } = await import("../src/lib/reports");
  const input = { lat: -32.9468, lon: -60.6393, tipo: "calle", descripcion: "Prueba local de demo" };

  await t.test("rechaza tipos heredados y puntos fuera del polígono", () => {
    assert.throws(() => validateReport({ ...input, tipo: "toString" }));
    assert.throws(() => validateReport({ ...input, lat: -32.8, lon: -60.55 }));
    assert.equal(validateReport({ ...input, descripcion: " <b>Prueba</b> " }).descripcion, "Prueba");
  });

  const report = await createReport(input, "autor-demo");
  await t.test("la misma conexión confirma una sola vez y el DTO no revela claves", async () => {
    assert.equal((await confirmReport(report.id, "observador-a")).confirmaciones, 1);
    assert.equal((await confirmReport(report.id, "observador-a")).confirmaciones, 1);
    assert.equal((await confirmReport(report.id, "observador-b")).confirmaciones, 2);
    const rows = await listReports();
    assert.equal(rows.length, 1);
    assert.equal(Object.hasOwn(rows[0], "confirmationsBy"), false);
    assert.equal(Object.hasOwn(report, "confirmationsBy"), false);
  });

  await t.test("escrituras concurrentes conservan todos los aportes", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => createReport(input, `autor-${i}`)));
    assert.equal((await listReports()).length, 9);
    assert.equal(JSON.parse(await readFile(path.join(directory, "reportes.json"), "utf8")).length, 9);
  });

  await t.test("se eliminan aportes vencidos al leer", async () => {
    const file = path.join(directory, "reportes.json");
    const rows = JSON.parse(await readFile(file, "utf8"));
    rows[0].creadoEn = new Date(Date.now() - 25 * 3600000).toISOString();
    await writeFile(file, JSON.stringify(rows));
    assert.equal((await listReports()).length, 8);
    assert.equal(JSON.parse(await readFile(file, "utf8")).length, 8);
  });

  await t.test("un archivo corrupto falla sin borrarlo ni devolver cero aportes", async () => {
    const file = path.join(directory, "reportes.json");
    await writeFile(file, "{archivo roto");
    await assert.rejects(listReports, { status: 503 });
    await assert.rejects(() => createReport(input, "autor-final"), { status: 503 });
    assert.equal(await readFile(file, "utf8"), "{archivo roto");
  });
});
