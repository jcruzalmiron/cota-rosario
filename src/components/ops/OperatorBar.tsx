"use client";

import { useState, type FormEvent } from "react";
import { BUTTON_PLAIN, BUTTON_PRIMARY, FIELD } from "@/components/ops/ui";

interface OperatorBarProps {
  enabled: boolean;
  disabledMessage: string;
  operator: string | null;
  expired: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

const NETWORK_ERROR = "No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.";

async function errorOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export function OperatorBar({ enabled, disabledMessage, operator, expired, onLogin, onLogout }: OperatorBarProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <section className="hairline px-5 py-5" aria-label="Acceso de operadores">
        <div className="border-l-2 border-watch pl-3 text-xs leading-relaxed text-ink-soft">
          <p className="text-watch">Gestión no habilitada en este servidor.</p>
          <p className="mt-1">{disabledMessage} La cola se puede consultar, pero no cambiar estados ni exportar. Para habilitarla hay que configurar la clave de operaciones (COTA_OPS_KEY) en el servidor.</p>
        </div>
      </section>
    );
  }

  if (operator) {
    const logout = async () => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/ops/session", { method: "DELETE" });
        if (!response.ok) {
          setError(await errorOf(response, "No se pudo cerrar la sesión."));
          return;
        }
        onLogout();
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className="hairline flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3" aria-label="Sesión de operador">
        <p className="flex min-w-0 items-center gap-2 text-[0.8125rem] text-ink-soft">
          <span className="size-2 shrink-0 rounded-full bg-normal" aria-hidden="true" />
          <span className="truncate">
            Operando como <span className="text-ink">{operator}</span>
          </span>
        </p>
        <button type="button" onClick={logout} disabled={busy} className={BUTTON_PLAIN}>
          {busy ? "Saliendo…" : "Salir"}
        </button>
        {error ? <p role="alert" className="w-full text-xs text-alert">{error}</p> : null}
      </section>
    );
  }

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ops/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, name }) });
      if (!response.ok) {
        setError(await errorOf(response, "No se pudo iniciar la sesión."));
        return;
      }
      setKey("");
      onLogin();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hairline px-5 py-5" aria-label="Ingreso de operadores">
      <h2 className="meta">{expired ? "La sesión venció" : "Sólo lectura"}</h2>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        {expired ? "El cambio no se guardó. Ingresá de nuevo para seguir gestionando." : "Para tomar, resolver o descartar reclamos y exportar, ingresá con la clave de operaciones. Tu nombre queda en el historial de cada cambio."}
      </p>
      <form onSubmit={login} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
          Tu nombre
          <input className={FIELD} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={40} placeholder="Como figura en la guardia" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
          Clave de operaciones
          <input className={FIELD} type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" required />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy || !name.trim() || !key} className={BUTTON_PRIMARY}>
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
          {error ? <p role="alert" className="text-xs leading-snug text-alert">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}
