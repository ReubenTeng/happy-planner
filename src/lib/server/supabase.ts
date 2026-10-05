import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { required } from "./errors";
export function authConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
}
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(
    required("SUPABASE_URL"),
    required("SUPABASE_PUBLISHABLE_KEY"),
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.APP_URL?.startsWith("https://"),
        path: "/",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Middleware refreshes cookies during Server Component reads. */
          }
        },
      },
    },
  );
}
