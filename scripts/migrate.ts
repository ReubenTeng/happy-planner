import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (process.env.DIRECT_DATABASE_URL)
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db, transaction } from "../src/lib/server/db";
await transaction(async (c) => {
  await c.query("SELECT pg_advisory_xact_lock(7341901)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())",
  );
  for (const name of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`migrations/${name}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await c.query(
      "SELECT checksum FROM schema_migrations WHERE name=$1",
      [name],
    );
    if (existing.rows.length) {
      if (existing.rows[0].checksum !== checksum)
        throw new Error(`Applied migration was modified: ${name}`);
      continue;
    }
    await c.query(sql);
    await c.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
    console.log(`Applied ${name}`);
  }
});
await db().end();
