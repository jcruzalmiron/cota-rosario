/**
 * Arranque de una base vacía para uso LOCAL: crea el cuartel ficticio que usan los
 * usuarios de AUTH_MODE=dev-local. En el piloto, el alta de organización y usuarios
 * se hace con el proveedor de identidad aprobado.
 */
import { createDbFromEnv } from "./db";
import { migrate } from "./migrate";

const db = await createDbFromEnv();
await migrate(db);
await db.query("INSERT INTO organization (id, name) VALUES ('cuartel-local', 'Cuartel local de prueba') ON CONFLICT DO NOTHING");
console.log("Organización local lista: cuartel-local");
await db.close();
