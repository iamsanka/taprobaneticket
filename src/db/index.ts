import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/* ============================
   NEON POSTGRES CLIENT
============================ */

const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

/* ============================
   DRIZZLE ORM INSTANCE
============================ */

export const db = drizzle(client, { schema });
