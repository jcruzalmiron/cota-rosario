import { test } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenError, ValidationError } from "../src/db/db";
import { LogbookService } from "../src/domain/logbook";
import { prefillFromText, ReportService } from "../src/domain/reports";
import { PROVISIONAL_TEMPLATE, renderReport, missingFields } from "../src/domain/report-template";
import { comercial, jefe, operador, operadorOtroCuartel, revisor, setup, T0 } from "./helpers";

const RELATO =
  "Aviso a las 10:02 por humo en Calle de Prueba 1234. Salimos 10:05 con móvil 12 y unidad 7. " +
  "Llegamos 10:19, humo en planta baja. Se ventiló y se extinguió el foco. Finalizamos 11:10.";

async function ctx(templateStatus: "pendiente_validacion" | "aprobada" = "aprobada") {
  const { db, clock } = await setup();
  const logbook = new LogbookService(db, clock);
  const reports = new ReportService(db, clock);
  await reports.ensureTemplate(PROVISIONAL_TEMPLATE.kind, PROVISIONAL_TEMPLATE.version, PROVISIONAL_TEMPLATE.schema, templateStatus);
  const ivId = await logbook.createIntervention(operador, { title: "Intervención de prueba", startedAt: T0 });
  return { db, clock, logbook, reports, ivId };
}

test("B1: texto libre genera candidatos con evidencia y pendientes visibles", async () => {
  const { logbook, ivId } = await ctx();
  const created = await logbook.addText(operador, ivId, "entrada-1", RELATO);
  assert.ok(created.length >= 4);
  for (const e of created) assert.ok(e.evidence.excerpt.length > 0 && e.evidence.ref === "entrada-1");
  const salida = created.find((e) => e.action === "salida")!;
  assert.equal(new Date(salida.at!).toISOString(), "2026-11-04T13:05:00.000Z", "10:05 en Rosario");
  assert.equal(salida.unit, "12");
  const tl = await logbook.timeline(operador, ivId);
  const sinHora = tl.find((e) => !e.at);
  assert.ok(sinHora && sinHora.pendientes.includes("hora"), "hecho sin hora queda pendiente y al final");
  assert.equal(tl.at(-1)!.at, null);
});

test("B1: transcripción apunta al segmento de audio; revisión exige hora y acción", async () => {
  const { logbook, ivId } = await ctx();
  const [ev] = await logbook.addTranscript(operador, ivId, "audio-1", [{ start: 12.5, end: 18, text: "llegamos al lugar con la autobomba 3" }]);
  assert.deepEqual([ev.evidence.source, ev.evidence.start, ev.evidence.end], ["audio", 12.5, 18]);
  await assert.rejects(logbook.review(operador, ev.id, 1, { status: "aceptado" }), ForbiddenError);
  await assert.rejects(logbook.review(jefe, ev.id, 1, { status: "aceptado" }), ValidationError, "sin hora no se acepta");
  const ok = await logbook.review(jefe, ev.id, 1, { status: "aceptado", at: new Date("2026-11-04T13:20:00Z") });
  assert.equal(ok.version, 2);
  const csv = await logbook.exportProvisional(jefe, ivId, "csv");
  assert.match(csv, /audio-1@12.5-18s/);
});

test("B3: relato incompleto genera preguntas sólo sobre faltantes aplicables", async () => {
  const { reports, ivId } = await ctx();
  const { revision, questions } = await reports.start(operador, { interventionId: ivId, templateKind: PROVISIONAL_TEMPLATE.kind, freeText: RELATO });
  assert.equal(revision.status, "incompleto");
  const asked = questions.map((q) => q.field);
  for (const known of ["hora_aviso", "hora_salida", "hora_arribo", "hora_finalizacion", "lugar", "moviles"]) {
    assert.ok(!asked.includes(known), `no repregunta ${known}`);
  }
  for (const missing of ["tipo", "jefe_a_cargo", "panorama_arribo", "victimas"]) assert.ok(asked.includes(missing));
  assert.ok(!asked.includes("causa_probable"), "opcional no se pregunta");
  assert.deepEqual(revision.field_values.moviles.value, ["12", "7"]);
  assert.match(revision.field_values.hora_salida.evidence!, /Salimos 10:05/);
});

test("B3: contradicción horaria queda para revisión y bloquea aprobación", async () => {
  const values = prefillFromText("Aviso 10:30. Salimos 10:05.", T0);
  const r = renderReport(PROVISIONAL_TEMPLATE.schema, values, { templateKind: "x", templateVersion: 1, templateStatus: "aprobada", revisionNo: 1, final: false });
  assert.match(r.text, /BORRADOR/);
  const { reports, ivId } = await ctx();
  const { revision, contradictions } = await reports.start(operador, { interventionId: ivId, templateKind: PROVISIONAL_TEMPLATE.kind, freeText: "Aviso 10:30. Salimos 10:05." });
  assert.equal(contradictions[0].message, "La salida figura antes del aviso.");
  void revision;
});

async function completeReport(reports: ReportService, ivId: string) {
  const start = await reports.start(operador, { interventionId: ivId, templateKind: PROVISIONAL_TEMPLATE.kind, freeText: RELATO });
  return reports.answer(operador, start.revision.id, {
    tipo: { value: "incendio_estructural", source: "operador" },
    jefe_a_cargo: { value: "Jefe de prueba", source: "operador" },
    panorama_arribo: { value: "Humo en planta baja, sin llamas visibles", source: "movil" },
    acciones: { value: ["Ventilación", "Extinción del foco"], source: "operador" },
    victimas: { unknownReason: "sin información al cierre", source: "operador" },
    danos: { value: "Daño por humo en cocina", source: "operador" },
  });
}

test("B3: aprobación por revisor distinto, render determinístico y reexportación con checksum", async () => {
  const { reports, ivId } = await ctx();
  const done = await completeReport(reports, ivId);
  assert.equal(done.revision.status, "listo_para_revisar");
  assert.equal(done.revision.revision_no, 2, "revisión anterior conservada");
  await assert.rejects(reports.export(revisor, done.revision.id), ValidationError);
  const a = await reports.approve(revisor, done.revision.id);
  assert.doesNotMatch(a.text, /BORRADOR/);
  assert.match(a.text, /DESCONOCIDO \(sin información al cierre\)/);
  const e1 = await reports.export(revisor, done.revision.id);
  const e2 = await reports.export(revisor, done.revision.id);
  assert.equal(e1.checksum, a.checksum);
  assert.equal(e2.text, e1.text);
});

test("B3: plantilla provisoria sólo emite borradores", async () => {
  const { reports, ivId } = await ctx("pendiente_validacion");
  const done = await completeReport(reports, ivId);
  await assert.rejects(reports.approve(revisor, done.revision.id), /pendiente de validación/);
});

test("B3: acceso por rol y cuartel; CRM no ve informes", async () => {
  const { reports, ivId } = await ctx();
  const done = await completeReport(reports, ivId);
  await assert.rejects(reports.view(comercial, done.revision.id), ForbiddenError);
  await assert.rejects(reports.view({ ...operadorOtroCuartel }, done.revision.id), ForbiddenError);
  await assert.rejects(reports.approve(operador, done.revision.id), ForbiddenError);
  const selfApprove = { ...revisor, id: "op-1" };
  await assert.rejects(reports.approve(selfApprove, done.revision.id), /propio informe/);
});

test("B3: casos anteriores sugieren preguntas, nunca valores", async () => {
  const { reports, logbook, ivId } = await ctx();
  const done = await completeReport(reports, ivId);
  await reports.answer(operador, done.revision.id, { organismos: { value: ["Policía"], source: "operador" } });
  await reports.approve(revisor, done.revision.id + 1);
  const iv2 = await logbook.createIntervention(operador, { title: "Otra intervención", startedAt: T0 });
  const fresh = await reports.start(operador, { interventionId: iv2, templateKind: PROVISIONAL_TEMPLATE.kind, freeText: "Aviso 15:00." });
  const sug = await reports.suggestFromPrevious(operador, PROVISIONAL_TEMPLATE.kind, fresh.revision.field_values);
  assert.deepEqual(sug.map((s) => s.field), ["organismos"]);
  assert.ok(!JSON.stringify(sug).includes("Policía"), "no trae valores del otro caso");
  assert.equal(fresh.revision.field_values.organismos, undefined);
});

test("B3: bitácora revisada precarga horas con fuente 'registro'", async () => {
  const { reports, logbook, ivId } = await ctx();
  const evs = await logbook.addText(operador, ivId, "e1", "Salida 10:05 con móvil 12. Arribo 10:19.");
  for (const e of evs) await logbook.review(jefe, e.id, 1, { status: "aceptado" });
  const { revision } = await reports.start(operador, { interventionId: ivId, templateKind: PROVISIONAL_TEMPLATE.kind, freeText: "Salimos 10:07." });
  assert.equal(revision.field_values.hora_salida.source, "registro");
  assert.equal(revision.field_values.hora_salida.value, "2026-11-04T13:05:00.000Z");
  assert.ok(missingFields(PROVISIONAL_TEMPLATE.schema, revision.field_values).length > 0);
});
