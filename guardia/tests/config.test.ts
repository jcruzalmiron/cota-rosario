import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/server/config";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const base = { QR_SECRET: "secreto-de-prueba" };

test("adaptadores arrancan deshabilitados y un flag sin configuración es error visible", () => {
  const c = loadConfig(env(base));
  assert.equal(c.adapters.WHATSAPP.enabled, false);
  assert.equal(c.alertRule.firstAlertMin, 10);
  assert.equal(c.alertRule.followUpMin, null);
  assert.throws(() => loadConfig(env({ ...base, ADAPTER_WHATSAPP: "on" })), /WHATSAPP_VERIFY_TOKEN/);
  assert.throws(() => loadConfig(env({ ...base, ALERTA_PRIMER_AVISO_MIN: "0" })), /inválido/);
  assert.equal(loadConfig(env({ ...base, ALERTA_SEGUIMIENTO_MIN: "15" })).alertRule.followUpMin, 15);
});

test("QR_SECRET es obligatorio fuera del modo local", () => {
  assert.throws(() => loadConfig(env({})), /QR_SECRET/);
  assert.throws(() => loadConfig(env({ AUTH_MODE: "dev-local", NODE_ENV: "production" })), /QR_SECRET/);
  assert.ok(loadConfig(env({ AUTH_MODE: "dev-local", NODE_ENV: "development" })).qrSecret);
});
