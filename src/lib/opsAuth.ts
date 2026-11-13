import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { BodyTooLargeError } from "@/lib/requestGuard";
import { ReportError } from "@/lib/reports";

export const OPS_COOKIE = "cota_ops";
export const OPS_SESSION_SECONDS = 12 * 3600;
export const OPS_DISABLED_MESSAGE = "La gestión de reclamos no está habilitada en este servidor.";

const MIN_KEY_CHARS = 16;
const NAME_MIN_CHARS = 2;
const NAME_MAX_CHARS = 40;
const MAX_FAILED_ATTEMPTS = 10;
const FAILED_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED_CLIENTS = 5000;
const NO_STORE = { "cache-control": "no-store" } as const;

const failedAttempts = new Map<string, number[]>();

export interface OpsSession {
  name: string;
  /** Vencimiento en milisegundos Unix. */
  exp: number;
}

export class OpsAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function opsKey(): string {
  const key = process.env.COTA_OPS_KEY ?? "";
  if (key.length < MIN_KEY_CHARS) throw new OpsAuthError(OPS_DISABLED_MESSAGE, 503);
  return key;
}

function sign(payload: string, key: string): Buffer {
  const secret = createHmac("sha256", key).update("cota-ops-session").digest();
  return createHmac("sha256", secret).update(payload).digest();
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new OpsAuthError("Escribí tu nombre para registrar los cambios.", 400);
  const name = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < NAME_MIN_CHARS || name.length > NAME_MAX_CHARS) {
    throw new OpsAuthError(`El nombre tiene que tener entre ${NAME_MIN_CHARS} y ${NAME_MAX_CHARS} caracteres.`, 400);
  }
  return name;
}

export function issueSessionToken(name: string, now = Date.now()): string {
  const key = opsKey();
  const payload = Buffer.from(JSON.stringify({ name, exp: now + OPS_SESSION_SECONDS * 1000 } satisfies OpsSession)).toString("base64url");
  return `${payload}.${sign(payload, key).toString("base64url")}`;
}

export function verifySessionToken(token: string, now = Date.now()): OpsSession | null {
  const key = opsKey();
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length > 0) return null;
  const expected = sign(payload, key);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OpsSession>;
    if (typeof session.name !== "string" || typeof session.exp !== "number" || !Number.isFinite(session.exp) || session.exp <= now) return null;
    return { name: session.name, exp: session.exp };
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/** Los pedidos que modifican tienen que venir del mismo sitio: si el navegador manda Origin, debe coincidir con el host. */
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (originHost === null || originHost.toLowerCase() !== host.toLowerCase()) {
    throw new OpsAuthError("Pedido rechazado: viene de otro sitio.", 403);
  }
}

/** Primer control de toda ruta de operaciones: 503 si la gestión está deshabilitada y, en pedidos que modifican, 403 por origen ajeno. */
export function guardOpsRequest(request: Request, options: { mutating?: boolean } = {}): void {
  opsKey();
  if (options.mutating) assertSameOrigin(request);
}

/** Sesión de operador vigente; suma a guardOpsRequest el 401 cuando no hay cookie válida. */
export function requireOperator(request: Request, options: { mutating?: boolean; now?: number } = {}): OpsSession {
  guardOpsRequest(request, options);
  const token = cookieValue(request, OPS_COOKIE);
  const session = token ? verifySessionToken(token, options.now) : null;
  if (!session) throw new OpsAuthError("Ingresá con la clave de operaciones para gestionar reclamos.", 401);
  return session;
}

/** Valida clave y nombre y devuelve el token de sesión. Diez intentos fallidos por conexión cada quince minutos. */
export function openSession(input: { key?: unknown; name?: unknown }, ip: string, now = Date.now()): { token: string; name: string } {
  const key = opsKey();
  for (const [client, times] of failedAttempts) {
    const kept = times.filter((time) => now - time < FAILED_WINDOW_MS);
    if (kept.length === 0) failedAttempts.delete(client);
    else failedAttempts.set(client, kept);
  }
  const failures = failedAttempts.get(ip) ?? [];
  if (failures.length >= MAX_FAILED_ATTEMPTS || (!failedAttempts.has(ip) && failedAttempts.size >= MAX_TRACKED_CLIENTS)) {
    throw new OpsAuthError("Demasiados intentos fallidos desde esta conexión; probá de nuevo en un rato.", 429);
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const provided = typeof input.key === "string" ? input.key : "";
  if (!timingSafeEqual(digest(provided), digest(key))) {
    failedAttempts.set(ip, [...failures, now]);
    throw new OpsAuthError("La clave no es correcta.", 401);
  }
  const name = cleanName(input.name);
  return { token: issueSessionToken(name, now), name };
}

function cookie(value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OPS_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

export function sessionCookie(token: string): string {
  return cookie(token, OPS_SESSION_SECONDS);
}

export function clearedSessionCookie(): string {
  return cookie("", 0);
}

export function opsJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

export function opsErrorResponse(error: unknown, context: string): Response {
  if (error instanceof OpsAuthError || error instanceof ReportError) {
    return opsJson({ ok: false, error: error.message }, { status: error.status });
  }
  if (error instanceof BodyTooLargeError) {
    return opsJson({ ok: false, error: "El pedido es demasiado grande." }, { status: 413 });
  }
  console.error(`Failed to handle ${context}:`, error instanceof Error ? error.name : "Error");
  return opsJson({ ok: false, error: "No se pudo completar la operación." }, { status: 500 });
}
