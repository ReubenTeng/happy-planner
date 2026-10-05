import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { getPreferences } from "@/lib/server/store";
import { CreateTripForm } from "@/components/forms";
export const dynamic = "force-dynamic";
export default async function CreateTrip() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const prefs = await getPreferences(user.id);
  return (
    <section className="shell form-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVERY GREAT JOURNEY STARTS SOMEWHERE</span>
          <h1>Let’s make a little escape.</h1>
          <p>Tell us what you have in mind. We’ll help you connect the dots.</p>
        </div>
      </div>
      <CreateTripForm budget={prefs.budget} />
    </section>
  );
}
