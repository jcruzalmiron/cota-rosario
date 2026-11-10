"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SECTIONS: { prefix: string; title: string; lead: string }[] = [
  { prefix: "/guardia", title: "Mesa de radio", lead: "Ingreso de llamadas, despacho y seguimiento de móviles en servicio." },
  { prefix: "/bandeja", title: "Bandeja de incidentes", lead: "Casos por estado, prioridad y tipo, con historial y resumen del período." },
  { prefix: "/porton/qr", title: "QR de los móviles", lead: "Códigos firmados para imprimir y pegar en cada unidad." },
  { prefix: "/porton", title: "Portón", lead: "Entradas y salidas de móviles por QR, cámara o carga manual." },
  { prefix: "/metricas", title: "Métricas de guardia", lead: "Tiempos y pendientes con su definición, casos medidos y excluidos." },
  { prefix: "/informes", title: "Bitácora e informes", lead: "Del relato a la cronología revisada y al borrador de informe." },
  { prefix: "/crm", title: "CRM", lead: "Empresas, seguimientos y reservas para eventos del cuartel." },
];

const ZONE = "America/Argentina/Buenos_Aires";
const hourFmt = new Intl.DateTimeFormat("es-AR", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("es-AR", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" });

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="clock" dateTime={now?.toISOString()}>
      <b>{now ? hourFmt.format(now) : "--:--"}</b>
      <span>{now ? dayFmt.format(now) : " "}</span>
    </time>
  );
}

export function PageHeader() {
  const path = usePathname();
  const s = SECTIONS.find((x) => path === x.prefix || path.startsWith(`${x.prefix}/`));
  if (!s) return null;
  return (
    <header className="pagehead">
      <div>
        <h1>{s.title}</h1>
        <p>{s.lead}</p>
      </div>
      <Clock />
    </header>
  );
}
