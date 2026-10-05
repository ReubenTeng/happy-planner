import { OperatorContact } from "@/components/operator-contact";
export const dynamic = "force-dynamic";
export default function Privacy() {
  return (
    <article className="shell prose">
      <span className="eyebrow">YOUR DETAILS, TREATED THOUGHTFULLY</span>
      <h1>Privacy at Happy Planner</h1>
      <p>
        We store your account identifier, name and email to secure your account.
        Supabase provides email-link authentication. Your travel preferences,
        trip requests, itinerary versions and booking details are stored in our
        database.
      </p>
      <h2>When you plan a trip</h2>
      <p>
        Travel preferences and trip details are sent to OpenAI, or Google Gemini
        when configured as a fallback, to generate and edit your itinerary. We
        do not send your booking confirmation numbers or booking email to the
        AI. Destination and route searches are sent through our private SearXNG
        instance to configured search engines. When enabled, Amadeus receives
        travel search details. Open-Meteo receives destination coordinates for
        weather. Inngest processes background jobs, including trip identifiers
        and planning data needed for durable steps. These services and external
        booking providers have their own privacy policies.
      </p>
      <h2>Sharing is your choice</h2>
      <p>
        Creating a share link makes your itinerary available to anyone who has
        that link for up to 90 days. Confirmation details and private item notes
        are excluded. You can regenerate or disable the link from your trip at
        any time. People may retain copies of information they have already
        viewed.
      </p>
      <h2>Cookies and retention</h2>
      <p>
        We use essential session and sign-in security cookies. The application
        does not include advertising trackers. Trips and their history are
        retained while your account exists. Contact the operator to request
        deletion; legal retention requirements and backup retention may affect
        when all copies are removed.
      </p>
      <OperatorContact />
    </article>
  );
}
