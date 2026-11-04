# Guardia · Bomberos Voluntarios

Backoffice privado para el cuartel piloto (Rosario): mesa de radio con ingreso bloqueante y avisos por falta de novedad, bitácora con borradores de informe, y CRM de empresas y eventos. Implementa el primer lote (M1) del *Masterplan Cota, incidentes y bitácora de Bomberos v2* (4/11/2026).

Vive en `guardia/` dentro del repositorio de Cota como paquete independiente (su propio `package.json`, base, pruebas y despliegue). Cota no lo importa ni lo empaqueta: queda excluido de su `tsconfig` y de su imagen Docker.

Herramienta complementaria a Bravo/Brau: no escribe en Bravo/Brau ni en sistemas ajenos. La referencia a la intervención en Bravo se carga a mano hasta verificar su contrato.

## Arranque local sin Docker (PGlite)

```bash
cd guardia
npm install
cp .env.example .env.local   # deja AUTH_MODE=dev-local
npm run dev                  # http://localhost:3300
```

La base es Postgres en WASM (PGlite) dentro de `.data/`. El worker corre dentro del proceso web. En desarrollo, si cambiás código de `src/domain/` reiniciá `npm run dev`: los servicios quedan en memoria entre recargas. El selector de usuario arriba a la derecha cambia de rol (operador, jefe de guardia, revisor, administración). Todos son usuarios ficticios.

## Arranque con Postgres (Docker)

```bash
docker compose up
```

Levanta `db` (Postgres 17), `web` y `worker` como procesos separados. Migraciones: `npm run migrate`.

## Pruebas

```bash
npm test          # pruebas: dominio + Postgres (PGlite) con reloj controlado
npm run typecheck
npm run build
```

## Estructura

| Ruta | Contenido |
|---|---|
| `migrations/` | SQL versionado (Postgres). |
| `src/domain/` | Reglas y servicios: `intake` (O2), `incidents` (O1), `guard` (O2/O3), `jobs` (cola durable), `logbook` (B1), `report-template` y `reports` (B3), `crm` (A1). |
| `src/server/` | Configuración, identidad y contexto de servicios. |
| `src/app/` | Pantallas (`/guardia`, `/bandeja`, `/informes`, `/crm`) y API (`/api/...`). |
| `src/worker/` | Worker separado para Postgres. |
| `tests/` | Pruebas de unidad e integración local. |
| `docs/estado-frentes.md` | Estado por frente, decisiones y pedidos de insumos. |

## Datos y privacidad

- No cargar datos reales en modo local. Las pruebas usan escenarios ficticios.
- Contacto del denunciante en tabla aparte (`incident_contact`); los listados no lo exponen.
- CRM con rol propio: no ve incidentes, bitácoras ni informes.
- Informes: quien redacta no puede aprobar; con plantilla provisoria sólo se emiten borradores.
