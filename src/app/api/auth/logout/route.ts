import { supabaseServer } from "@/lib/server/supabase";
import { failure, json, sameOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await (await supabaseServer()).auth.signOut({ scope: "local" });
    return json({ signedOut: true });
  } catch (error) {
    return failure(error);
  }
}
