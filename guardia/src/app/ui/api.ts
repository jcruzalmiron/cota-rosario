export interface ApiError {
  error: string;
  fields?: { field: string; message: string }[];
  currentVersion?: number;
  status: number;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw { ...(data as object), status: res.status } as ApiError;
  return data as T;
}

export const fmtTime = (iso: string | Date | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
    : "—";

export const fmtDateTime = (iso: string | Date | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }).format(new Date(iso))
    : "—";
