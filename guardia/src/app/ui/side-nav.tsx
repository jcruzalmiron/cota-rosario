"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  radio: "M4 10h16v10H4zM8 10V6l10-3M8 15h.01M12 15h6",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5",
  gate: "M4 21V5h16v16M4 9h16M9 9v12M15 9v12",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3",
} as const;

const GROUPS: { title: string; links: { href: string; label: string; icon: keyof typeof I }[] }[] = [
  {
    title: "Operación",
    links: [
      { href: "/guardia", label: "Mesa de radio", icon: "radio" },
      { href: "/bandeja", label: "Bandeja", icon: "inbox" },
      { href: "/porton", label: "Portón", icon: "gate" },
      { href: "/metricas", label: "Métricas", icon: "chart" },
    ],
  },
  { title: "Registro", links: [{ href: "/informes", label: "Bitácora e informes", icon: "book" }] },
  { title: "Administración", links: [{ href: "/crm", label: "CRM", icon: "people" }] },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="sidenav" aria-label="Secciones">
      {GROUPS.map((g) => (
        <div key={g.title} className="navgroup">
          <span className="navtitle">{g.title}</span>
          {g.links.map((l) => {
            const active = path === l.href || path.startsWith(`${l.href}/`);
            return (
              <Link key={l.href} href={l.href} className={active ? "navlink active" : "navlink"} aria-current={active ? "page" : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={I[l.icon]} /></svg>
                <span>{l.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
