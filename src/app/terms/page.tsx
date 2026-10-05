import { OperatorContact } from "@/components/operator-contact";
export const dynamic = "force-dynamic";
export default function Terms() {
  return (
    <article className="shell prose">
      <span className="eyebrow">A FEW THINGS TO KNOW</span>
      <h1>Plan thoughtfully. Book confidently.</h1>
      <h2>Your itinerary is a guide</h2>
      <p>
        AI-generated recommendations can be inaccurate. Search results discover
        travel provider pages; they do not establish current prices, opening
        hours, safety or availability. Costs are estimates unless explicitly
        marked as a provider quote. Check travel dates, flight times, visas,
        entry rules and local conditions before you travel.
      </p>
      <h2>Your bookings are with the provider</h2>
      <p>
        Happy Planner helps organize your trip and opens external provider
        pages. We do not take payments, issue tickets, or confirm reservations
        automatically. Check all prices, taxes, restrictions and cancellation
        terms directly with the provider. Marking an item as booked here is a
        record you control, not a booking confirmation from a provider. Amadeus
        comparison links do not reserve the exact quoted flight or hotel rate.
      </p>
      <h2>Weather and changes</h2>
      <p>
        Forecasts and packing suggestions are informational. Consult official
        local weather warnings and travel advisories. Clearing a booking status
        in Happy Planner does not cancel the underlying reservation.
      </p>
      <OperatorContact />
    </article>
  );
}
