import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { DEV_USERS, devModeEnabled } from "@/server/http";
import { DevUserPicker } from "./ui/dev-user-picker";
import "./globals.css";

// Identidad por request: nunca prerenderizar.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guardia · Bomberos Voluntarios",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const dev = devModeEnabled();
  const current = dev ? (await cookies()).get("dev_user")?.value ?? "op-local" : null;
  return (
    <html lang="es-AR">
      <body>
        <header className="top">
          <span className="brand">Guardia</span>
          <nav>
            <Link href="/guardia">Mesa de radio</Link>
            <Link href="/bandeja">Bandeja</Link>
            <Link href="/informes">Bitácora e informes</Link>
            <Link href="/crm">CRM</Link>
          </nav>
          {dev && (
            <DevUserPicker
              current={current!}
              users={Object.values(DEV_USERS).map((u) => ({ id: u.id, name: u.name }))}
            />
          )}
        </header>
        {dev && <p className="devbar">Modo local con usuarios y datos ficticios. No usar con datos reales.</p>}
        <main>{children}</main>
      </body>
    </html>
  );
}
