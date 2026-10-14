import { test } from "node:test";
import assert from "node:assert/strict";
import { clearLiveSources, readLiveSource } from "../src/lib/liveSources";

test("las respuestas se reutilizan dentro de la ventana y Actualizar vuelve a consultar", async () => {
  let calls = 0;
  const load = async () => ++calls;
  const start = Date.now();
  assert.equal(await readLiveSource("prueba:reuso", load), 1);
  assert.equal(await readLiveSource("prueba:reuso", load), 1);
  assert.equal(clearLiveSources(start + 60_000), true);
  assert.equal(await readLiveSource("prueba:reuso", load), 2);
});

test("los pedidos de actualización seguidos no vacían la memoria cada vez", async () => {
  let calls = 0;
  const load = async () => ++calls;
  const start = Date.now() + 120_000;
  assert.equal(clearLiveSources(start), true);
  await readLiveSource("prueba:limite", load);
  assert.equal(clearLiveSources(start + 1_000), false);
  assert.equal(await readLiveSource("prueba:limite", load), 1);
  assert.equal(clearLiveSources(start + 10_000), true);
  assert.equal(await readLiveSource("prueba:limite", load), 2);
});
