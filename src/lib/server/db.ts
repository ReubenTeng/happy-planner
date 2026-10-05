import pg from "pg";
import { required } from "./errors";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
const globals = globalThis as unknown as { plannerPool?: pg.Pool };
export function db() {
  if (!globals.plannerPool)
    globals.plannerPool = new pg.Pool({
      connectionString: required("DATABASE_URL"),
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
    });
  return globals.plannerPool;
}
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export function orm() {
  return drizzle(db(), { schema });
}
