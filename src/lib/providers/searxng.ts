import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Offer, type TripRequest } from "../domain";
import { AppError, required } from "../server/errors";
import { fetchJson, safeBookingUrl } from "./http";
import type { SearchWindow, TravelProvider } from "./types";

const Result = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string().optional(),
  engine: z.string().optional(),
  engines: z.array(z.string()).optional(),
});
const ResponseSchema = z.object({
  results: z.array(Result),
  unresponsive_engines: z.array(z.unknown()).optional(),
});
type SearchResponse = z.infer<typeof ResponseSchema>;
const domains = {
  flight: [
    "skyscanner.net",
    "skyscanner.com",
    "skyscanner.com.sg",
    "trip.com",
    "kayak.com",
    "expedia.com",
    "singaporeair.com",
    "ana.co.jp",
    "jal.co.jp",
  ],
  hotel: ["booking.com", "trip.com", "expedia.com", "hotels.com", "agoda.com"],
  activity: ["getyourguide.com", "viator.com", "klook.com"],
  event: ["ticketmaster.com", "eventbrite.com"],
};
function permitted(url: string, type: keyof typeof domains) {
  try {
    const host = new URL(safeBookingUrl(url)).hostname;
    return domains[type].some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}
function canonicalUrl(value: string) {
  const url = new URL(safeBookingUrl(value));
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith("utm_") || ["msockid", "gclid", "fbclid"].includes(key))
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
export async function webSearch(query: string): Promise<SearchResponse> {
  const base = new URL(required("SEARCH_BASE_URL"));
  if (
    base.username ||
    base.password ||
    !["http:", "https:"].includes(base.protocol)
  )
    throw new AppError(503, "Search configuration is invalid.");
  const url = new URL("search", base.toString().replace(/\/?$/, "/"));
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");
  const result = ResponseSchema.parse(
    await fetchJson(
      url,
      process.env.SEARCH_API_KEY
        ? { headers: { Authorization: `Bearer ${process.env.SEARCH_API_KEY}` } }
        : undefined,
    ),
  );
  if (!result.results.length && result.unresponsive_engines?.length)
    throw new AppError(
      503,
      "Search engines are temporarily unavailable. Please try again later.",
    );
  return result;
}
export class SearxngProvider implements TravelProvider {
  readonly name = "searxng";
  constructor(private readonly search = webSearch) {}
  private async discover(
    type: Offer["type"],
    request: TripRequest,
    window: SearchWindow,
    direction?: "outbound" | "return",
  ) {
    const route =
      direction === "return"
        ? `${window.destination.name} to ${request.origin}`
        : `${request.origin} to ${window.destination.name}`;
    // Search indexed route/property pages. Future dates and complex site operators
    // suppress useful results and do not turn general web search into inventory.
    const query =
      type === "flight"
        ? `${route} flights`
        : `${window.destination.name} ${type === "hotel" ? "hotels" : type === "activity" ? "tours activities" : "events tickets"}`;
    const result = await this.search(query);
    const seen = new Set<string>();
    return result.results
      .flatMap((source) => {
        if (!permitted(source.url, type)) return [];
        const url = canonicalUrl(source.url);
        if (seen.has(url)) return [];
        seen.add(url);
        return [
          Offer.parse({
            id: randomUUID(),
            provider: this.name,
            providerOfferId: createHash("sha256")
              .update(`${type}:${direction ?? ""}:${url}`)
              .digest("hex"),
            type,
            title: source.title.slice(0, 300),
            description: (
              source.content ??
              "Travel provider page discovered through web search."
            ).slice(0, 2000),
            price: null,
            currency: request.currency,
            bookingUrl: url,
            bookingLinkKind: "source",
            availability: "unknown",
            location: {
              name: window.destination.name,
              latitude: null,
              longitude: null,
            },
            start: null,
            end: null,
            fetchedAt: new Date().toISOString(),
            metadata: {
              query,
              direction,
              window,
              domain: new URL(url).hostname,
              engines: source.engines ?? (source.engine ? [source.engine] : []),
              verifiedPrice: false,
            },
          }),
        ];
      })
      .slice(0, type === "hotel" ? 6 : 4);
  }
  async searchFlights(request: TripRequest, window: SearchWindow) {
    return [
      ...(await this.discover("flight", request, window, "outbound")),
      ...(await this.discover("flight", request, window, "return")),
    ];
  }
  async searchHotels(request: TripRequest, window: SearchWindow) {
    return this.discover("hotel", request, window);
  }
  async searchActivities(request: TripRequest, window: SearchWindow) {
    return this.discover("activity", request, window);
  }
  async searchEvents(request: TripRequest, window: SearchWindow) {
    return this.discover("event", request, window);
  }
  async getOfferDetails(offer: Offer): Promise<Offer> {
    const query = z.string().parse(offer.metadata.query);
    const found = (await this.search(query)).results.some(
      (r) =>
        permitted(r.url, offer.type) &&
        canonicalUrl(r.url) === offer.bookingUrl,
    );
    return {
      ...offer,
      availability: found ? ("unknown" as const) : ("unavailable" as const),
      fetchedAt: new Date().toISOString(),
    };
  }
  buildBookingUrl(offer: Offer) {
    if (!permitted(offer.bookingUrl, offer.type))
      throw new AppError(502, "Unrecognized booking destination.");
    return safeBookingUrl(offer.bookingUrl);
  }
}
