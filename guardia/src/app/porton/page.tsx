"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDateTime, fmtTime, type ApiError } from "../ui/api";

type Direction = "salida" | "entrada";
interface Movement {
  id: number; vehicle_code: string; gate_name: string; direction: Direction; occurred_at: string; received_at: string;
  source: "qr" | "manual" | "camara"; operator: string; status: string; dispatch_id: string | null; incident_location: string | null;
  duplicate_of: number | null; corrected_from: number | null; reason: string | null;
}
interface GateData {
  vehicles: { id: string; code: string; label: string }[];
  gates: { id: string; code: string; name: string }[];
  movements: Movement[];
}

const STATUS_LABEL: Record<string, string> = {
  confirmado: "confirmado", duplicado: "doble escaneo", corregido: "corregido", pendiente_revision: "a revisar", descartado: "descartado",
};

/** Lector de QR por cámara si el navegador trae BarcodeDetector (Chrome en Android); si no, lector USB o carga manual. */
function useCameraScanner(onCode: (code: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(typeof window !== "undefined" && "BarcodeDetector" in window), []);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        while (!stop) {
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) {
            onCode(found[0].rawValue);
            setActive(false);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setActive(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, onCode]);

  return { video, active, setActive, supported };
}

export default function PortonPage() {
  const [data, setData] = useState<GateData | null>(null);
  const [gateId, setGateId] = useState("");
  const [qr, setQr] = useState("");
  const [manual, setManual] = useState({ vehicleCode: "", direction: "", occurredAt: "" });
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const qrInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<GateData>("/api/gate");
      setData(d);
      setGateId((g) => g || d.gates[0]?.id || "");
    } catch (e) {
      setMsg({ text: (e as ApiError).error, tone: "err" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const record = useCallback(async (body: Record<string, unknown>) => {
    try {
      const r = await api<{ movement: Movement; replayed: boolean }>("/api/gate", { body: { gateId, sourceKey: crypto.randomUUID(), ...body } });
      const m = r.movement;
      setMsg({
        tone: "ok",
        text: m.status === "duplicado" ? "Doble escaneo: ya estaba registrado, no se duplicó." : `${m.direction === "salida" ? "Salida" : "Entrada"} registrada${m.dispatch_id ? " y vinculada al despacho activo" : ""}.`,
      });
      await load();
    } catch (e) {
      setMsg({ text: (e as ApiError).error, tone: "err" });
    }
  }, [gateId, load]);

  const onScan = useCallback((code: string) => void record({ source: "qr", qr: code }), [record]);
  const camera = useCameraScanner(onScan);

  async function correct(m: Movement) {
    const action = prompt("Escribí «salida», «entrada» o «descartar»:", m.direction === "salida" ? "entrada" : "salida");
    if (!action) return;
    const reason = prompt("Motivo de la corrección:");
    if (!reason) return;
    const discard = action.trim().toLowerCase().startsWith("desc");
    const direction = discard ? undefined : (action.trim().toLowerCase() as Direction);
    if (!discard && direction !== "salida" && direction !== "entrada") return setMsg({ text: "Acción no reconocida.", tone: "err" });
    try {
      await api(`/api/gate/movements/${m.id}`, { body: { direction, discard, reason } });
      await load();
    } catch (e) {
      setMsg({ text: (e as ApiError).error, tone: "err" });
    }
  }

  return (
    <div className="grid2">
      <section className="card">
        <h1>Registrar paso</h1>
        <div className="field">
          <label htmlFor="gate">Portón</label>
          <select id="gate" value={gateId} onChange={(e) => setGateId(e.target.value)}>
            {data?.gates.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <h2>Escanear QR del móvil</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (qr.trim()) void record({ source: "qr", qr: qr.trim() });
            setQr("");
            qrInput.current?.focus();
          }}
        >
          <div className="field">
            <label htmlFor="qr">Código leído</label>
            <input id="qr" ref={qrInput} value={qr} onChange={(e) => setQr(e.target.value)} autoComplete="off" placeholder="Lector USB: escaneá y se registra solo" />
          </div>
          <div className="actions">
            <button type="submit" disabled={!gateId || !qr.trim()}>Registrar</button>
            {camera.supported && (
              <button type="button" className="ghost" onClick={() => camera.setActive(!camera.active)}>{camera.active ? "Cerrar cámara" : "Usar cámara"}</button>
            )}
          </div>
        </form>
        {camera.active && <video ref={camera.video} className="scanner" muted playsInline />}

        <h2>Carga manual</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="veh">Móvil</label>
            <select id="veh" value={manual.vehicleCode} onChange={(e) => setManual({ ...manual, vehicleCode: e.target.value })}>
              <option value="">Elegí</option>
              {data?.vehicles.map((v) => <option key={v.id} value={v.code}>{v.code} · {v.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dir">Sentido</label>
            <select id="dir" value={manual.direction} onChange={(e) => setManual({ ...manual, direction: e.target.value })}>
              <option value="">Automático</option>
              <option value="salida">Salida</option>
              <option value="entrada">Entrada</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="when">Hora del paso (sólo si se carga después)</label>
          <input id="when" type="datetime-local" value={manual.occurredAt} onChange={(e) => setManual({ ...manual, occurredAt: e.target.value })} />
        </div>
        <div className="actions">
          <button
            disabled={!gateId || !manual.vehicleCode}
            onClick={() => {
              void record({
                source: "manual",
                vehicleCode: manual.vehicleCode,
                direction: manual.direction || undefined,
                occurredAt: manual.occurredAt ? new Date(`${manual.occurredAt}:00-03:00`).toISOString() : undefined,
              });
              setManual({ vehicleCode: "", direction: "", occurredAt: "" });
            }}
          >
            Registrar paso
          </button>
          <Link className="linkbtn" href="/porton/qr">QR para imprimir</Link>
        </div>
        {msg && <p className={msg.tone === "ok" ? "status" : "err"} role="status">{msg.text}</p>}
      </section>

      <section className="card">
        <h1>Últimas 24 h</h1>
        {data && !data.movements.length && <p className="hint">Sin movimientos registrados.</p>}
        <ul className="board">
          {data?.movements.map((m) => (
            <li key={m.id} className={m.status === "confirmado" ? "" : "muted"}>
              <div className="mob">
                <strong>{m.vehicle_code}</strong>
                <span className={`tag ${m.direction === "salida" ? "warn" : ""}`}>{m.direction}</span>
                <span className="tag">{STATUS_LABEL[m.status] ?? m.status}</span>
                <span className="mono">{fmtTime(m.occurred_at)}</span>
              </div>
              <div className="times">
                <span>{m.gate_name}</span>
                <span>{m.source === "qr" ? "QR" : m.source}</span>
                <span>por {m.operator}</span>
                {new Date(m.received_at).getTime() - new Date(m.occurred_at).getTime() > 120_000 && <span>cargado {fmtDateTime(m.received_at)}</span>}
              </div>
              {m.incident_location && <div className="where">Despacho: {m.incident_location}</div>}
              {m.reason && <div className="where">Motivo: {m.reason}</div>}
              {m.status === "confirmado" && (
                <div className="actions"><button className="ghost" onClick={() => correct(m)}>Corregir (jefatura)</button></div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
