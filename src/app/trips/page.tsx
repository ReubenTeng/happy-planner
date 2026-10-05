import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, MapPinned, Plus, Compass } from "lucide-react";
import { currentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { LogoutButton } from "@/components/login-button";
export const dynamic = "force-dynamic";
export default async function Trips() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { rows } = await db().query(
    "SELECT t.id,t.title,t.destination,t.status,min(d.date)::text AS start,max(d.date)::text AS finish FROM trips t LEFT JOIN trip_days d ON d.trip_id=t.id WHERE t.user_id=$1 GROUP BY t.id ORDER BY t.created_at DESC LIMIT 100",
    [user.id],
  );
  return (
    <section className="shell dashboard">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR LITTLE CORNER OF THE WORLD</span>
          <h1>
            Your journeys<span className="green">.</span>
          </h1>
          <p>
            Good to see you, {user.name?.split(" ")[0] ?? "traveler"}. Let’s
            make room for something new.
          </p>
        </div>
        <Link className="button" href="/trips/new">
          <Plus size={17} /> Plan a new trip
        </Link>
      </div>
      {!rows.length ? (
        <div className="empty-state">
          <Compass size={50} />
          <h2>The world is still wide open.</h2>
          <p>
            Your saved journeys will live here. Start with a destination
            <br />
            and a little curiosity.
          </p>
          <Link className="button" href="/trips/new">
            Create your first journey <ArrowUpRight size={17} />
          </Link>
        </div>
      ) : (
        <div className="trip-grid">
          {rows.map((trip, index) => (
            <Link
              href={`/trips/${trip.id}`}
              key={trip.id}
              className="trip-card"
            >
              <div className={`trip-cover tone-${index % 3}`}>
                <MapPinned size={50} />
                <span className="pill light">
                  {trip.status === "APPROVED"
                    ? "Ready to book"
                    : "Your evolving plan"}
                </span>
                <span className="cover-destination">{trip.destination}</span>
              </div>
              <div className="trip-card-body">
                <small>
                  {trip.start} — {trip.finish}
                </small>
                <h3>{trip.title}</h3>
                <span className="text-link">
                  Open journey <ArrowUpRight size={17} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="dashboard-bottom">
        <Link href="/preferences" className="text-link">
          Edit your travel preferences <ArrowUpRight size={15} />
        </Link>
        <LogoutButton />
      </div>
    </section>
  );
}
