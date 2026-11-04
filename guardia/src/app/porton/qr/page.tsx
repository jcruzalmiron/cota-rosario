"use client";

import { useEffect, useState } from "react";
import { api, type ApiError } from "../../ui/api";

interface Code { code: string; label: string; svg: string }

export default function QrPrintPage() {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Code[]>("/api/gate/qr").then(setCodes).catch((e: ApiError) => setError(e.error));
  }, []);

  return (
    <section className="card">
      <div className="summary-head">
        <h1>Códigos</h1>
        <button className="noprint" onClick={() => window.print()} disabled={!codes?.length}>Imprimir</button>
      </div>
      <p className="hint noprint">Pegá cada código en su móvil, en un lugar que el lector alcance desde el portón. Si se pierde o se copia, cambiá QR_SECRET y reimprimí todos.</p>
      {error && <p className="err">{error}</p>}
      {codes && !codes.length && <p className="hint">No hay móviles en el inventario.</p>}
      <div className="qrgrid">
        {codes?.map((c) => (
          <figure key={c.code}>
            {/* SVG generado en el servidor a partir de un texto firmado propio; no incluye contenido de usuarios. */}
            <div className="qr" dangerouslySetInnerHTML={{ __html: c.svg }} />
            <figcaption><strong>{c.code}</strong><span>{c.label}</span></figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
