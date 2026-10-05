import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/server/supabase";
import { required } from "@/lib/server/errors";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const { error } = await (
      await supabaseServer()
    ).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/trips", required("APP_URL")));
  }
  return NextResponse.redirect(
    new URL("/login?error=expired", required("APP_URL")),
  );
}
