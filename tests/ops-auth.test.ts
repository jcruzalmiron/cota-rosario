import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = "http://cota.test";
const DISABLED = "La gestión de reclamos no está habilitada en este servidor.";

test("operator access: session, origin check, status changes and CSV export", async (t) => {
  process.env.COTA_DATA_DIR = await mkdtemp(path.join(tmpdir(), "cota-ops-test-"));
  delete process.env.COTA_OPS_KEY;
  const key = randomBytes(24).toString("base64url");
  const session = await import("../src/app/api/ops/session/route");
  const opsReports = await import("../src/app/api/ops/reports/route");
  const opsReport = await import("../src/app/api/ops/reports/[id]/route");
  const opsCsv = await import("../src/app/api/ops/reports.csv/route");
  const publicReports = await import("../src/app/api/reports/route");
  const publicReport = await import("../src/app/api/reports/[id]/route");
  const confirm = await import("../src/app/api/reports/[id]/confirm/route");
  const { issueSessionToken, OPS_COOKIE } = await import("../src/lib/opsAuth");
  const { createReport } = await import("../src/lib/reports");
  const { csvCell } = await import("../src/lib/reportsCsv");
  const { argentinaStamp } = await import("../src/lib/time");

  const request = (pathname: string, init: { method?: string; cookie?: string; origin?: string; ip?: string; body?: unknown } = {}) =>
    new Request(`${BASE}${pathname}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...(init.origin ? { origin: init.origin } : {}),
        ...(init.ip ? { "cf-connecting-ip": init.ip } : {}),
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const withId = (id: string) => ({ params: Promise.resolve({ id }) });
  const patch = (id: string, body: unknown, init: { cookie?: string; origin?: string } = {}) => opsReport.PATCH(request(`/api/ops/reports/${id}`, { method: "PATCH", body, ...init }), withId(id));
  const login = (body: unknown, init: { origin?: string; ip?: string } = {}) => session.POST(request("/api/ops/session", { method: "POST", body, ...init }));
  const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

  const report = await createReport({ lat: -32.9468, lon: -60.6393, type: "street", description: '=2+5 dijo "hola", y se fue' }, "autor-ops");

  await t.test("without a long enough key every operator endpoint answers 503", async () => {
    for (const value of [undefined, "corta"]) {
      if (value === undefined) delete process.env.COTA_OPS_KEY;
      else process.env.COTA_OPS_KEY = value;
      const responses = [
        await session.GET(request("/api/ops/session")),
        await login({ key: value ?? "", name: "Ana" }),
        await session.DELETE(request("/api/ops/session", { method: "DELETE" })),
        await opsReports.GET(request("/api/ops/reports")),
        await patch(report.id, { status: "resolved" }),
        await opsCsv.GET(request("/api/ops/reports.csv")),
      ];
      for (const response of responses) {
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(await errorOf(response), DISABLED);
      }
    }
  });

  process.env.COTA_OPS_KEY = key;

  await t.test("a wrong key or a bad name opens no session", async () => {
    const wrong = await login({ key: `${key}x`, name: "Ana" });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get("set-cookie"), null);
    assert.equal((await login({ name: "Ana" })).status, 401);
    assert.equal((await login({ key, name: "A" })).status, 400);
    assert.equal((await login({ key, name: "x".repeat(41) })).status, 400);
    assert.equal((await login({ key })).status, 400);
    assert.equal((await session.POST(new Request(`${BASE}/api/ops/session`, { method: "POST", body: "{roto" }))).status, 400);
  });

  const opened = await login({ key, name: " <b>Ana</b>  Pérez " }, { origin: BASE });
  const setCookie = opened.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];

  await t.test("the right key issues a signed, HttpOnly, SameSite=Strict cookie for twelve hours", async () => {
    assert.equal(opened.status, 200);
    assert.deepEqual(await opened.json(), { ok: true, name: "Ana Pérez" });
    assert.equal(opened.headers.get("cache-control"), "no-store");
    assert.match(setCookie, new RegExp(`^${OPS_COOKIE}=[\\w-]+\\.[\\w-]+; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict$`));
    assert.equal(setCookie.includes(key), false);
    const current = await session.GET(request("/api/ops/session", { cookie }));
    assert.equal(current.status, 200);
    assert.equal(((await current.json()) as { name: string }).name, "Ana Pérez");
  });

  await t.test("the cookie is marked Secure in production", async () => {
    const environment = process.env as Record<string, string | undefined>;
    const previous = environment.NODE_ENV;
    environment.NODE_ENV = "production";
    try {
      assert.match((await login({ key, name: "Ana" })).headers.get("set-cookie") ?? "", /; Secure$/);
    } finally {
      environment.NODE_ENV = previous;
    }
  });

  await t.test("no cookie, a tampered cookie, an expired one or one signed with another key get 401", async () => {
    const [payload, signature] = cookie.slice(OPS_COOKIE.length + 1).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ name: "Intruso", exp: Date.now() + 3_600_000 })).toString("base64url");
    const expired = issueSessionToken("Ana", Date.now() - 13 * 3_600_000);
    process.env.COTA_OPS_KEY = randomBytes(24).toString("base64url");
    const foreign = issueSessionToken("Ana");
    process.env.COTA_OPS_KEY = key;
    const cookies = [undefined, `${OPS_COOKIE}=${forgedPayload}.${signature}`, `${OPS_COOKIE}=${payload}.${signature.slice(0, -2)}AA`, `${OPS_COOKIE}=${payload}`, `${OPS_COOKIE}=${payload}.${signature}.x`, `${OPS_COOKIE}=${expired}`, `${OPS_COOKIE}=${foreign}`, `otra=${payload}.${signature}`];
    for (const candidate of cookies) {
      assert.equal((await session.GET(request("/api/ops/session", { cookie: candidate }))).status, 401, candidate);
      assert.equal((await opsReports.GET(request("/api/ops/reports", { cookie: candidate }))).status, 401, candidate);
      assert.equal((await opsCsv.GET(request("/api/ops/reports.csv", { cookie: candidate }))).status, 401, candidate);
      assert.equal((await patch(report.id, { status: "resolved" }, { cookie: candidate, origin: BASE })).status, 401, candidate);
    }
  });

  await t.test("mutating requests from another origin get 403 even with a valid session", async () => {
    assert.equal((await patch(report.id, { status: "resolved" }, { cookie, origin: "https://otro.example" })).status, 403);
    assert.equal((await patch(report.id, { status: "resolved" }, { cookie, origin: "null" })).status, 403);
    assert.equal((await login({ key, name: "Ana" }, { origin: "https://otro.example" })).status, 403);
    assert.equal((await session.DELETE(request("/api/ops/session", { method: "DELETE", origin: "https://otro.example" }))).status, 403);
    const hosted = new Request(`${BASE}/api/ops/reports/${report.id}`, { method: "PATCH", headers: { cookie, host: "cota.example", origin: "https://cota.example" }, body: JSON.stringify({ status: "nada" }) });
    assert.equal((await opsReport.PATCH(hosted, withId(report.id))).status, 400);
    const unchanged = (await (await publicReport.GET(request(`/api/reports/${report.id}`), withId(report.id))).json()) as { report: { status: string } };
    assert.equal(unchanged.report.status, "new");
  });

  await t.test("an operator changes the status and the neighbour sees it without private data", async () => {
    assert.equal((await patch("no-es-un-id", { status: "resolved" }, { cookie, origin: BASE })).status, 400);
    assert.equal((await patch(report.id, ["resolved"], { cookie, origin: BASE })).status, 400);
    assert.equal((await patch(report.id, { status: "new" }, { cookie, origin: BASE })).status, 409);
    const changed = await patch(report.id, { status: "resolved", note: "Nota interna de guardia", publicNote: "@Destapamos el desagüe" }, { cookie, origin: BASE });
    assert.equal(changed.status, 200);
    assert.equal(changed.headers.get("cache-control"), "no-store");
    const { report: updated } = (await changed.json()) as { report: { status: string; resolvedAt: string; history: { by: string; note?: string }[] } };
    assert.equal(updated.status, "resolved");
    assert.deepEqual([updated.history.at(-1)?.by, updated.history.at(-1)?.note], ["Ana Pérez", "Nota interna de guardia"]);

    const seen = await publicReport.GET(request(`/api/reports/${report.id}`), withId(report.id));
    const text = await seen.text();
    assert.equal(seen.status, 200);
    assert.equal(JSON.parse(text).report.publicNote, "@Destapamos el desagüe");
    for (const secret of ["history", '"by"', "Ana", "Nota interna"]) assert.equal(text.includes(secret), false, secret);
    assert.equal((await publicReport.GET(request("/api/reports/00000000-0000-4000-8000-000000000000"), withId("00000000-0000-4000-8000-000000000000"))).status, 404);

    const confirmed = await confirm.POST(request(`/api/reports/${report.id}/confirm`, { method: "POST" }), withId(report.id));
    assert.equal(confirmed.status, 409);
    assert.match(await errorOf(confirmed), /resuelto/);
  });

  await t.test("the public list filters by date and keeps the map window, without private fields", async () => {
    const listed = await publicReports.GET(request("/api/reports"));
    const text = await listed.text();
    const body = JSON.parse(text) as { ok: boolean; from: string; to: string; truncated: boolean; counts: Record<string, number>; reports: unknown[] };
    assert.equal(listed.status, 200);
    assert.equal(body.from, body.to);
    assert.deepEqual([body.ok, body.truncated, body.reports.length], [true, false, 1]);
    assert.deepEqual(body.counts, { new: 0, in_progress: 0, resolved: 1, dismissed: 0 });
    for (const secret of ["history", '"by"', "Ana", "Nota interna"]) assert.equal(text.includes(secret), false, secret);
    const active = (await (await publicReports.GET(request("/api/reports?window=active"))).json()) as { windowHours: number; reports: unknown[] };
    assert.deepEqual([active.windowHours, active.reports.length], [24, 0]);
    for (const query of ["from=ayer", "from=2026-11-10&to=2026-11-01", "status=cerrado", "type=fuego", "window=todo", "window=active&status=new"]) {
      assert.equal((await publicReports.GET(request(`/api/reports?${query}`))).status, 400, query);
    }
    assert.equal(((await (await publicReports.GET(request("/api/reports?district=SUR"))).json()) as { reports: unknown[] }).reports.length, 1);
  });

  await t.test("operators list full records and can filter by district", async () => {
    const listed = await opsReports.GET(request("/api/ops/reports?status=resolved&district=centro", { cookie }));
    assert.equal(listed.status, 200);
    assert.equal(listed.headers.get("cache-control"), "no-store");
    const body = (await listed.json()) as { reports: { id: string; history: { by: string }[] }[]; counts: Record<string, number> };
    assert.deepEqual(body.reports.map((row) => row.id), [report.id]);
    assert.deepEqual(body.reports[0].history.map((entry) => entry.by), ["vecino", "Ana Pérez"]);
    assert.equal(JSON.stringify(body).includes("confirmationsBy"), false);
    assert.equal(((await (await opsReports.GET(request("/api/ops/reports?district=SUR", { cookie }))).json()) as { reports: unknown[] }).reports.length, 0);
    assert.equal((await opsReports.GET(request("/api/ops/reports?district=LUNA", { cookie }))).status, 400);
  });

  await t.test("the CSV has a BOM, Argentine times, escaped quotes and neutralized formulas", async () => {
    const exported = await opsCsv.GET(request("/api/ops/reports.csv", { cookie }));
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.equal(exported.headers.get("cache-control"), "no-store");
    assert.match(exported.headers.get("content-disposition") ?? "", /^attachment; filename="reclamos-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv"$/);
    const bytes = new Uint8Array(await exported.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const [header, row, rest] = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n");
    assert.equal(header, "id;creado;tipo;estado;estado_desde;resuelto;distrito;latitud;longitud;descripcion;confirmaciones;nota_publica;ultimo_cambio_por;ultima_nota_interna");
    assert.equal(rest, "");
    assert.equal(row, [report.id, argentinaStamp(report.createdAt), "Calle anegada", "Resuelto", row.split(";")[4], row.split(";")[5], "CENTRO", "-32.9468", "-60.6393", `"'=2+5 dijo ""hola"", y se fue"`, "0", "'@Destapamos el desagüe", "Ana Pérez", "Nota interna de guardia"].join(";"));
    assert.match(row.split(";")[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(argentinaStamp("2026-11-10T02:30:00.000Z"), "2026-11-09 23:30");

    assert.equal(csvCell("=1+1"), "'=1+1");
    assert.equal(csvCell("+54 341"), "'+54 341");
    assert.equal(csvCell("-1"), "'-1");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell("\tcmd"), "'\tcmd");
    assert.equal(csvCell("\rcmd"), "\"'\rcmd\"");
    assert.equal(csvCell(-32.9468), "-32.9468");
    assert.equal(csvCell("sin riesgo"), "sin riesgo");
    assert.equal(csvCell(null), "");
  });

  await t.test("ten failed attempts block that connection, even with the right key", async () => {
    const ip = "203.0.113.9";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await login({ key: "clave-equivocada-123", name: "Ana" }, { ip })).status, 401);
    }
    assert.equal((await login({ key, name: "Ana" }, { ip })).status, 429);
    assert.equal((await login({ key, name: "Ana" }, { ip: "203.0.113.10" })).status, 200);
  });

  await t.test("closing the session clears the cookie", async () => {
    const closed = await session.DELETE(request("/api/ops/session", { method: "DELETE", cookie, origin: BASE }));
    assert.equal(closed.status, 200);
    assert.match(closed.headers.get("set-cookie") ?? "", new RegExp(`^${OPS_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict$`));
  });
});
