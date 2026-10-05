import { authConfigured, supabaseServer } from "./supabase";
import { orm } from "./db";
import { users } from "./schema";
import { AppError } from "./errors";

export async function currentUser() {
  if (!authConfigured()) return null;
  // getUser validates with Supabase Auth. Never authorize from getSession alone.
  const {
    data: { user },
    error,
  } = await (await supabaseServer()).auth.getUser();
  if (error || !user?.email || !user.email_confirmed_at) return null;
  const name = String(
    user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email.split("@")[0],
  ).slice(0, 150);
  await orm()
    .insert(users)
    .values({ id: user.id, authSubject: user.id, email: user.email, name })
    .onConflictDoUpdate({ target: users.id, set: { name, email: user.email } });
  return { id: user.id, name, email: user.email };
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError(401, "Please sign in to continue.");
  return user;
}
