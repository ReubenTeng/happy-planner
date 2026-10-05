import { z } from "zod";
import { AppError, required } from "./errors";
import { db } from "./db";
export async function body<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  const reader = req.body?.getReader();
  if (!reader) throw new AppError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 32768) {
      await reader.cancel();
      throw new AppError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Request must contain valid JSON.");
  }
  return schema.parse(parsed);
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(required("APP_URL")).origin)
    throw new AppError(403, "This request is not allowed.");
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Use application/json.");
}
export async function rateLimit(key: string, limit = 20, seconds = 3600) {
  const result = await db().query(
    `INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.count+1 END,
    reset_at=CASE WHEN rate_limits.reset_at<now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END RETURNING count`,
    [key, seconds],
  );
  if (result.rows[0].count > limit)
    throw new AppError(
      429,
      "You've reached the request limit. Please try again later.",
    );
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof z.ZodError)
    return json(
      {
        error: error.issues
          .map((i) => i.message)
          .join(" ")
          .slice(0, 1000),
      },
      400,
    );
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  console.error("request_failed", { category: "internal" });
  return json(
    { error: "We couldn't complete that request. Please try again." },
    500,
  );
}
