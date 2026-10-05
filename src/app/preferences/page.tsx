import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { getPreferences } from "@/lib/server/store";
import { PreferencesForm } from "@/components/forms";
export const dynamic = "force-dynamic";
export default async function PreferencesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <section className="shell form-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A JOURNEY THAT FEELS LIKE YOU</span>
          <h1>Find your travel rhythm.</h1>
          <p>
            A few preferences help us make your next journey a little more
            personal.
          </p>
        </div>
      </div>
      <PreferencesForm initial={await getPreferences(user.id)} />
    </section>
  );
}
