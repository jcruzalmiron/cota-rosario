import "server-only";
import { cookies } from "next/headers";
import { ROLES, type Actor, type Role } from "../domain/auth";
import { services, type Services } from "./context";

class UnauthorizedError extends Error {
  readonly status = 401;
}

/** Usuarios ficticios para el modo local. Nunca disponibles en producción. */
export const DEV_USERS: Record<string, Actor & { name: string }> = {
  "op-local": { id: "op-local", name: "Radiooperador (local)", organizationId: "cuartel-local", roles: ["operador"] },
  "jefe-local": { id: "jefe-local", name: "Jefe de guardia (local)", organizationId: "cuartel-local", roles: ["jefe_guardia", "operador"] },
  "rev-local": { id: "rev-local", name: "Revisor de informes (local)", organizationId: "cuartel-local", roles: ["revisor_informes"] },
  "adm-local": { id: "adm-local", name: "Administración (local)", organizationId: "cuartel-local", roles: ["admin_comercial"] },
};

export function devModeEnabled() {
  return process.env.AUTH_MODE === "dev-local" && process.env.NODE_ENV !== "production";
}

/**
 * Identidad. En el piloto se integra un proveedor aprobado (OIDC). Mientras tanto,
 * `AUTH_MODE=dev-local` permite elegir un usuario ficticio y sólo fuera de producción.
 */
export async function currentActor(): Promise<Actor> {
  if (devModeEnabled()) {
    const id = (await cookies()).get("dev_user")?.value ?? "op-local";
    const u = DEV_USERS[id];
    if (u) return { id: u.id, organizationId: u.organizationId, roles: u.roles.filter((r): r is Role => ROLES.includes(r)) };
  }
  throw new UnauthorizedError("Identidad no configurada: integrar el proveedor aprobado o usar AUTH_MODE=dev-local en local.");
}

export function handle<C>(fn: (req: Request, actor: Actor, s: Services, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const actor = await currentActor();
      const result = await fn(req, actor, await services(), ctx);
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (error) {
      const e = error as Error & { status?: number; fields?: unknown; currentVersion?: number };
      const status = e.status ?? 500;
      if (status === 500) console.error("[api]", e);
      return Response.json(
        { error: status === 500 ? "Error interno" : e.message, fields: e.fields, currentVersion: e.currentVersion },
        { status },
      );
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw Object.assign(new Error("JSON inválido"), { status: 400 });
  }
}
