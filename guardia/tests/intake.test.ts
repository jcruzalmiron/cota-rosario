import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLocation, normalizePhone, validateIntake } from "../src/domain/intake";

test("teléfonos argentinos utilizables se normalizan", () => {
  assert.equal(normalizePhone("341 555-0000"), "3415550000");
  assert.equal(normalizePhone("+54 9 341 555 0000"), "3415550000");
  assert.equal(normalizePhone("0341 15 555 0000"), "341155550000");
  assert.equal(normalizePhone("4550000"), "4550000");
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone("sin teléfono"), null);
});

test("lugar acepta dirección, intersección o referencia utilizable", () => {
  assert.equal(classifyLocation("Calle de Prueba 1234"), "direccion");
  assert.equal(classifyLocation("Avenida A y Calle B"), "interseccion");
  assert.equal(classifyLocation("Avenida A esq. Calle B"), "interseccion");
  assert.equal(classifyLocation("frente a la plaza del barrio"), "referencia");
  assert.equal(classifyLocation("acá"), null);
  assert.equal(classifyLocation(""), null);
});

test("faltantes se informan por campo", () => {
  const issues = validateIntake({ callerName: "", phone: "12", locationText: "x" });
  assert.deepEqual(issues.map((i) => i.field), ["denunciante", "telefono", "lugar"]);
  assert.match(issues[1].message, /formato/);
});

test("denunciante anónimo declarado no exige nombre", () => {
  const issues = validateIntake({ anonymous: true, phone: "3415550000", locationText: "Calle de Prueba 1234" });
  assert.deepEqual(issues, []);
});
