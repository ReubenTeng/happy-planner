import { notFound } from "next/navigation";
import { sharedTrip } from "@/lib/server/store";
import { money, totalCost } from "@/lib/domain";
import { Timeline } from "@/components/trip-view";
import { Eye } from "lucide-react";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "A shared journey",
  robots: { index: false, follow: false },
};
export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trip = await sharedTrip(token);
  if (!trip) notFound();
  return (
    <section className="shell shared-page">
      <span className="pill">
        <Eye size={14} /> A shared journey · read only
      </span>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{trip.plan.destination}</span>
          <h1>{trip.plan.title}</h1>
          <p>{trip.plan.summary}</p>
        </div>
      </div>
      <div className="shared-overview">
        <span>
          {trip.plan.days[0].date} — {trip.plan.days.at(-1)!.date}
        </span>
        <b>{money(totalCost(trip.plan), trip.plan.currency)} estimated</b>
        <span>
          {trip.bookings.filter((b) => b.status === "CONFIRMED").length}{" "}
          bookings confirmed
        </span>
      </div>
      <Timeline days={trip.plan.days} currency={trip.plan.currency} />
      <p className="fine-print">
        All costs and activity times are provisional until confirmed with
        providers. Private notes and confirmation details are not shared.
      </p>
    </section>
  );
}
