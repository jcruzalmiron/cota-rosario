import { ForbiddenError } from "../db/db";

export const ROLES = [
  "operador",
  "jefe_guardia",
  "revisor_informes",
  "admin_comercial",
  "admin_tecnico",
] as const;
export type Role = (typeof ROLES)[number];

export interface Actor {
  id: string;
  organizationId: string;
  roles: Role[];
}

/** Sistema: actor de jobs (avisos, recordatorios). Nunca se obtiene desde HTTP. */
export const systemActor = (organizationId: string): Actor => ({
  id: "sistema",
  organizationId,
  roles: ["admin_tecnico"],
});

export function requireRole(actor: Actor, ...allowed: Role[]): void {
  if (!actor.roles.some((r) => allowed.includes(r))) {
    throw new ForbiddenError(`Requiere uno de los roles: ${allowed.join(", ")}`);
  }
}

export function requireSameOrg(actor: Actor, organizationId: string): void {
  if (actor.organizationId !== organizationId) {
    throw new ForbiddenError("Registro de otra organización.");
  }
}
