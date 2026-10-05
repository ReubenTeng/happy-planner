import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Offer, type TripRequest } from "../domain";
import { AppError, required } from "../server/errors";
import { fetchJson, safeBookingUrl } from "./http";
import type { SearchWindow, TravelProvider } from "./types";

const FlightOffer = z
  .object({
    id: z.string(),
    price: z.object({ total: z.string(), currency: z.string() }).passthrough(),
    itineraries: z
      .array(
        z
          .object({
            segments: z
              .array(
                z
                  .object({
                    departure: z
                      .object({ iataCode: z.string(), at: z.string() })
                      .passthrough(),
                    arrival: z
                      .object({ iataCode: z.string(), at: z.string() })
                      .passthrough(),
                    carrierCode: z.string(),
                    number: z.string(),
                  })
                  .passthrough(),
              )
              .min(1),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
const HotelResult = z.object({
  hotel: z
    .object({
      hotelId: z.string(),
      name: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .passthrough(),
  available: z.boolean().optional(),
  offers: z
    .array(
      z
        .object({
          id: z.string(),
          checkInDate: z.string(),
          checkOutDate: z.string(),
          price: z.object({ total: z.string(), currency: z.string() }),
          room: z
            .object({
              type: z.string().optional(),
              description: z.object({ text: z.string() }).optional(),
            })
            .passthrough()
            .optional(),
          boardType: z.string().optional(),
        })
        .passthrough(),
    )
    .optional(),
});
function cents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new AppError(502, "The provider returned an unsupported price.");
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n))
    throw new AppError(502, "The provider returned an invalid price.");
  return n;
}
export class AmadeusProvider implements TravelProvider {
  readonly name = "amadeus";
  private cached?: { token: string; expires: number };
  private pending?: Promise<string>;
  private base() {
    const environment = process.env.AMADEUS_ENV || "production";
    if (!["production", "test"].includes(environment))
      throw new AppError(
        503,
        "Amadeus environment must be production or test.",
      );
    if (environment === "test" && process.env.NODE_ENV === "production")
      throw new AppError(
        503,
        "Amadeus sandbox data cannot be used in a production deployment.",
      );
    return environment === "test"
      ? "https://test.api.amadeus.com"
      : "https://api.amadeus.com";
  }
  private async token() {
    if (this.cached && this.cached.expires > Date.now())
      return this.cached.token;
    if (!this.pending)
      this.pending = (async () => {
        const response = z
          .object({ access_token: z.string(), expires_in: z.number() })
          .parse(
            await fetchJson(`${this.base()}/v1/security/oauth2/token`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: required("AMADEUS_CLIENT_ID"),
                client_secret: required("AMADEUS_CLIENT_SECRET"),
              }),
            }),
          );
        this.cached = {
          token: response.access_token,
          expires: Date.now() + (response.expires_in - 60) * 1000,
        };
        return response.access_token;
      })().finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  private async request(
    path: string,
    query: Record<string, string> = {},
    body?: unknown,
  ) {
    const url = new URL(path, this.base());
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return fetchJson(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async searchFlights(request: TripRequest, window: SearchWindow) {
    const offers: Offer[] = [];
    for (const direction of ["outbound", "return"] as const) {
      const from =
        direction === "outbound"
          ? request.originAirport
          : window.destination.airport;
      const to =
        direction === "outbound"
          ? window.destination.airport
          : request.originAirport;
      const date = direction === "outbound" ? window.start : window.end;
      const response = z.object({ data: z.array(FlightOffer) }).parse(
        await this.request("/v2/shopping/flight-offers", {
          originLocationCode: from,
          destinationLocationCode: to,
          departureDate: date,
          adults: String(request.travelers),
          currencyCode: request.currency,
          max: "5",
        }),
      );
      for (const raw of response.data) {
        if (raw.price.currency !== request.currency) continue;
        const segments = raw.itineraries.flatMap((i) => i.segments);
        const first = segments[0],
          last = segments.at(-1)!;
        const link = new URL("https://www.google.com/travel/flights");
        link.searchParams.set(
          "q",
          `Flights from ${from} to ${to} on ${date} for ${request.travelers} adults`,
        );
        offers.push(
          Offer.parse({
            id: randomUUID(),
            provider: this.name,
            providerOfferId: createHash("sha256")
              .update(
                JSON.stringify(
                  segments.map((s) => [
                    s.carrierCode,
                    s.number,
                    s.departure.at,
                  ]),
                ),
              )
              .digest("hex"),
            type: "flight",
            title: `${first.carrierCode} ${first.number} · ${from} → ${to}`,
            description:
              "Amadeus flight quote for the requested adults. The outbound link opens a comparison search, not a ticket for this exact quote; availability and final price may differ.",
            price:
              process.env.AMADEUS_ENV === "test"
                ? null
                : cents(raw.price.total),
            currency: request.currency,
            bookingUrl: link.toString(),
            bookingLinkKind: "search",
            availability:
              process.env.AMADEUS_ENV === "test" ? "unknown" : "available",
            location: { name: to, latitude: null, longitude: null },
            start: first.departure.at,
            end: last.arrival.at,
            fetchedAt: new Date().toISOString(),
            metadata: {
              direction,
              window,
              raw,
              sandbox: process.env.AMADEUS_ENV === "test",
              domain: "Amadeus · compare on Google Flights",
            },
          }),
        );
      }
    }
    return offers;
  }
  async searchHotels(request: TripRequest, window: SearchWindow) {
    const locations = z
      .object({
        data: z.array(
          z.object({
            iataCode: z.string(),
            address: z.object({ cityCode: z.string() }),
          }),
        ),
      })
      .parse(
        await this.request("/v1/reference-data/locations", {
          subType: "AIRPORT",
          keyword: window.destination.airport,
        }),
      );
    const cityCode = locations.data.find(
      (l) => l.iataCode === window.destination.airport,
    )?.address.cityCode;
    if (!cityCode) return [];
    const hotels = z
      .object({ data: z.array(z.object({ hotelId: z.string() })) })
      .parse(
        await this.request("/v1/reference-data/locations/hotels/by-city", {
          cityCode,
        }),
      );
    const ids = hotels.data.slice(0, 8).map((h) => h.hotelId);
    if (!ids.length) return [];
    return this.hotelOffers(request, window, ids);
  }
  private async hotelOffers(
    request: Pick<TripRequest, "travelers" | "currency">,
    window: SearchWindow,
    ids: string[],
  ) {
    const response = z.object({ data: z.array(HotelResult) }).parse(
      await this.request("/v3/shopping/hotel-offers", {
        hotelIds: ids.join(","),
        adults: String(request.travelers),
        roomQuantity: "1",
        checkInDate: window.start,
        checkOutDate: window.end,
        currency: request.currency,
      }),
    );
    return response.data.flatMap((h) =>
      (h.available === false ? [] : (h.offers ?? [])).flatMap((raw) => {
        if (
          raw.price.currency !== request.currency ||
          raw.checkInDate !== window.start ||
          raw.checkOutDate !== window.end
        )
          return [];
        const link = new URL("https://www.google.com/travel/hotels");
        link.searchParams.set(
          "q",
          `${h.hotel.name} ${window.destination.name} ${window.start} to ${window.end}`,
        );
        return [
          Offer.parse({
            id: randomUUID(),
            provider: this.name,
            providerOfferId: `${h.hotel.hotelId}:${raw.room?.type ?? ""}:${raw.boardType ?? ""}`,
            type: "hotel",
            title: h.hotel.name,
            description: `${raw.room?.description?.text ?? "One room, full stay"}. Amadeus quote; the comparison link is not a checkout for this exact rate. Confirm taxes and restrictions with the provider.`,
            price:
              process.env.AMADEUS_ENV === "test"
                ? null
                : cents(raw.price.total),
            currency: request.currency,
            bookingUrl: link.toString(),
            bookingLinkKind: "search",
            availability:
              process.env.AMADEUS_ENV === "test" ? "unknown" : "available",
            location: {
              name: h.hotel.name,
              latitude: h.hotel.latitude ?? null,
              longitude: h.hotel.longitude ?? null,
            },
            start: raw.checkInDate,
            end: raw.checkOutDate,
            fetchedAt: new Date().toISOString(),
            metadata: {
              window,
              hotelId: h.hotel.hotelId,
              raw,
              travelers: request.travelers,
              sandbox: process.env.AMADEUS_ENV === "test",
              domain: "Amadeus · compare on Google Hotels",
            },
          }),
        ];
      }),
    );
  }
  async searchActivities(): Promise<Offer[]> {
    return [];
  }
  async searchEvents(): Promise<Offer[]> {
    return [];
  }
  async getOfferDetails(offer: Offer) {
    if (offer.metadata.sandbox)
      throw new AppError(
        409,
        "Sandbox results cannot be booked. Use production search credentials.",
      );
    if (offer.type === "flight") {
      const raw = FlightOffer.parse(offer.metadata.raw);
      const result = z
        .object({
          data: z.object({ flightOffers: z.array(FlightOffer).min(1) }),
        })
        .parse(
          await this.request(
            "/v1/shopping/flight-offers/pricing",
            {},
            { data: { type: "flight-offers-pricing", flightOffers: [raw] } },
          ),
        );
      const current = result.data.flightOffers[0];
      if (current.price.currency !== offer.currency)
        throw new AppError(
          409,
          "The refreshed quote uses a different currency.",
        );
      return {
        ...offer,
        price: cents(current.price.total),
        fetchedAt: new Date().toISOString(),
        availability: "available" as const,
        metadata: { ...offer.metadata, raw: current },
      };
    }
    const window = z
      .object({
        destination: z.object({ name: z.string(), airport: z.string() }),
        start: z.string(),
        end: z.string(),
      })
      .parse(offer.metadata.window);
    const current = (
      await this.hotelOffers(
        {
          travelers: z.number().parse(offer.metadata.travelers),
          currency: offer.currency,
        },
        window,
        [z.string().parse(offer.metadata.hotelId)],
      )
    ).find((o) => o.providerOfferId === offer.providerOfferId);
    return current
      ? { ...current, id: offer.id }
      : { ...offer, availability: "unavailable" as const };
  }
  buildBookingUrl(offer: Offer) {
    const url = new URL(safeBookingUrl(offer.bookingUrl));
    if (
      url.hostname !== "www.google.com" ||
      !["/travel/flights", "/travel/hotels"].includes(url.pathname)
    )
      throw new AppError(502, "Unexpected booking comparison destination.");
    return url.toString();
  }
}
