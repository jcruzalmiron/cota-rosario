import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { DEV_USERS, devModeEnabled } from "@/server/http";
import { DevUserPicker } from "./ui/dev-user-picker";
import { PageHeader } from "./ui/page-header";
import { SideNav } from "./ui/side-nav";
import { AskHost } from "./ui/ask";
import "./globals.css";

// Identidad por request: nunca prerenderizar.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guardia · Bomberos Voluntarios",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14171c" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const dev = devModeEnabled();
  const current = dev ? (await cookies()).get("dev_user")?.value ?? "op-local" : null;
  return (
    <html lang="es-AR">
      <body>
        <div className="shell">
          <aside className="rail">
            <div className="brand">
              <span className="mark" aria-hidden="true" />
              <span>
                <strong>Guardia</strong>
                <small>Bomberos Voluntarios</small>
              </span>
            </div>
            <SideNav />
            {dev && (
              <div className="railfoot">
                <DevUserPicker current={current!} users={Object.values(DEV_USERS).map((u) => ({ id: u.id, name: u.name }))} />
                <p className="devbar">Modo local · usuarios y datos ficticios</p>
              </div>
            )}
          </aside>
          <main>
            <PageHeader />
            {children}
          </main>
        </div>
        <AskHost />
      </body>
    </html>
  );
}
