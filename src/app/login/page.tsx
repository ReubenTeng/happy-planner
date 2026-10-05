import { Compass, ShieldCheck } from "lucide-react";
import { LoginButton } from "@/components/login-button";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = !!(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    process.env.DATABASE_URL
  );
  return (
    <section className="auth-page shell">
      <div className="auth-card">
        <span className="round-icon">
          <Compass size={28} />
        </span>
        <span className="eyebrow">YOUR NEXT CHAPTER</span>
        <h1>Welcome, wanderer.</h1>
        <p>
          Save your travel style, bring your ideas to life, and keep your
          journeys in one place.
        </p>
        {error && (
          <p className="notice error" role="alert">
            Sign-in couldn’t be completed. Please try again.
          </p>
        )}
        {!configured && (
          <p className="notice" role="status">
            We’re getting ready to welcome you. Sign-in is temporarily
            unavailable while the service is being configured.
          </p>
        )}
        <LoginButton enabled={configured} />
        <small>
          <ShieldCheck size={14} /> Secure sign-in. Your private plans stay
          yours.
        </small>
      </div>
    </section>
  );
}
