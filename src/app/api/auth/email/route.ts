import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseServer } from "@/lib/server/supabase";
import { body, failure, json, rateLimit, sameOrigin } from "@/lib/server/http";
import { AppError, required } from "@/lib/server/errors";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { email } = await body(
      request,
      z.object({ email: z.email().max(254) }),
    );
    const normalized = email.trim().toLowerCase();
    await rateLimit(
      `login:${createHash("sha256").update(normalized).digest("hex")}`,
      3,
      900,
    );
    const { error } = await (
      await supabaseServer()
    ).auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: new URL(
          "/auth/callback",
          required("APP_URL"),
        ).toString(),
        shouldCreateUser: true,
      },
    });
    if (error)
      throw new AppError(
        503,
        "We couldn't send a sign-in link right now. Please try again later.",
      );
    return json({
      message:
        "Check your email for a secure sign-in link. It may take a minute to arrive.",
    });
  } catch (error) {
    return failure(error);
  }
}
