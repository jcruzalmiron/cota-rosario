import { createDbFromEnv } from "./db";
import { migrate } from "./migrate";

const db = await createDbFromEnv();
const applied = await migrate(db);
console.log(applied.length ? `Migraciones aplicadas: ${applied.join(", ")}` : "Base al día.");
await db.close();
