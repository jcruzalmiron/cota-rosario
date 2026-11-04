import { createPgliteDb, type Db } from "../src/db/db";
import { migrate } from "../src/db/migrate";
import type { Actor } from "../src/domain/auth";
import { ManualClock } from "../src/domain/clock";

export const T0 = new Date("2026-11-04T13:00:00.000Z"); // 10:00 en Rosario

export async function setup() {
  const db: Db = await createPgliteDb();
  await migrate(db);
  await db.query("INSERT INTO organization (id, name) VALUES ('rosario','Cuartel de prueba A'), ('otro','Cuartel de prueba B')");
  const clock = new ManualClock(T0);
  return { db, clock };
}

export const operador: Actor = { id: "op-1", organizationId: "rosario", roles: ["operador"] };
export const operador2: Actor = { id: "op-2", organizationId: "rosario", roles: ["operador"] };
export const jefe: Actor = { id: "jefe-1", organizationId: "rosario", roles: ["jefe_guardia"] };
export const revisor: Actor = { id: "rev-1", organizationId: "rosario", roles: ["revisor_informes"] };
export const comercial: Actor = { id: "adm-1", organizationId: "rosario", roles: ["admin_comercial"] };
export const operadorOtroCuartel: Actor = { id: "op-9", organizationId: "otro", roles: ["operador"] };

/** Datos de ingreso de prueba (ficticios). */
export const ingresoCompleto = {
  origin: "llamada" as const,
  callerName: "Persona de prueba",
  phone: "341 555-0000",
  locationText: "Calle de Prueba 1234",
  category: "incendio_estructural",
  description: "Humo en vivienda (escenario de prueba)",
};
