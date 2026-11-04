import { cookies } from "next/headers";
import { DEV_USERS, devModeEnabled } from "@/server/http";

/** Selector de usuario ficticio, sólo en AUTH_MODE=dev-local fuera de producción. */
export async function POST(req: Request) {
  if (!devModeEnabled()) return Response.json({ error: "No disponible" }, { status: 404 });
  const { user } = (await req.json()) as { user: string };
  if (!DEV_USERS[user]) return Response.json({ error: "Usuario desconocido" }, { status: 400 });
  (await cookies()).set("dev_user", user, { httpOnly: true, sameSite: "strict", path: "/" });
  return Response.json({ ok: true });
}
