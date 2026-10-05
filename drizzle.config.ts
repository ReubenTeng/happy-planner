import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/server/schema.ts",
  out: "./.local/drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
