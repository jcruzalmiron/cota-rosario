import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Paquete propio dentro del repo de Cota: su raíz es esta carpeta, no la de Cota.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // PGlite carga WASM y archivos propios: se resuelve en runtime, no en el bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
