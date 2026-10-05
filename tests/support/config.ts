import { createHmac } from "node:crypto";
export const testDatabase =
  "postgresql://planner:planner_test_only@127.0.0.1:5433/happy_planner_test";
export const testAuthUrl = "http://127.0.0.1:9998";
// These credentials are exclusively for compose.test.yaml's disposable local stack.
function token(role: string) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ role, iss: "supabase", iat: 1, exp: 4102444800 }),
  ).toString("base64url");
  const signature = createHmac(
    "sha256",
    "test-only-secret-never-use-in-production-12345",
  )
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}
export const testAnonKey = token("anon");
