import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/server/config";

test("adaptadores arrancan deshabilitados y un flag sin configuración es error visible", () => {
  const c = loadConfig({} as unknown as NodeJS.ProcessEnv);
  assert.equal(c.adapters.WHATSAPP.enabled, false);
  assert.equal(c.alertRule.firstAlertMin, 10);
  assert.equal(c.alertRule.followUpMin, null);
  assert.throws(() => loadConfig({ ADAPTER_WHATSAPP: "on" } as unknown as NodeJS.ProcessEnv), /WHATSAPP_VERIFY_TOKEN/);
  assert.throws(() => loadConfig({ ALERTA_PRIMER_AVISO_MIN: "0" } as unknown as NodeJS.ProcessEnv), /inválido/);
  assert.equal(loadConfig({ ALERTA_SEGUIMIENTO_MIN: "15" } as unknown as NodeJS.ProcessEnv).alertRule.followUpMin, 15);
});
