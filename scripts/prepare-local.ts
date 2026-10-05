import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { parse } from "dotenv";

let text = await readFile(".env.local", "utf8").catch(() => "");
const current = parse(text);
const defaults = {
  DATABASE_URL:
    "postgresql://planner:planner_local_only@localhost:5432/planner",
  APP_URL: "http://localhost:3000",
  SEARCH_BASE_URL: "http://127.0.0.1:8080",
  SEARXNG_SECRET: randomBytes(48).toString("base64url"),
};
for (const [name, value] of Object.entries(defaults)) {
  if (current[name]) continue;
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  text = pattern.test(text)
    ? text.replace(pattern, line)
    : text + (text.endsWith("\n") || !text ? "" : "\n") + line + "\n";
}
await writeFile(".env.local", text, { mode: 0o600 });
await chmod(".env.local", 0o600);
await mkdir(".local", { recursive: true });
const cert = process.env.CODEX_PROXY_CERT;
const volumes: string[] = [];
if (cert) {
  await access(cert);
  volumes.push(`${cert}:/usr/local/share/ca-certificates/cloud-proxy.crt:ro`);
}
await writeFile(
  ".local/compose.cloud.json",
  JSON.stringify({ services: { search: { volumes } } }, null, 2),
);
console.log(
  "Local defaults prepared; existing non-empty configuration preserved. No external credentials were generated.",
);
