import { randomUUID } from "node:crypto";
import {
  BookingDetails,
  Preferences,
  type Item,
  type Offer,
  type Plan,
  type Trip,
  type TripRequest,
} from "../src/lib/domain";
export function fixture() {
  const request: TripRequest = {
    origin: "Singapore",
    originAirport: "SIN",
    destinations: [{ name: "Tokyo", airport: "NRT" }],
    earliestDate: "2027-03-05",
    latestDate: "2027-03-07",
    duration: 3,
    flexible: false,
    dateNotes: "",
    travelers: 1,
    rooms: 1,
    budget: 150000,
    currency: "SGD",
  };
  const window = {
    destination: request.destinations[0],
    start: request.earliestDate,
    end: request.latestDate,
  };
  const offers: Offer[] = ["outbound", "return", "hotel"].map((type) => ({
    id: randomUUID(),
    provider: "searxng",
    providerOfferId: randomUUID(),
    type: type === "hotel" ? "hotel" : "flight",
    title:
      type === "hotel"
        ? "Tokyo accommodation options"
        : `${type} flight options`,
    description: "Recorded test discovery result",
    price: null,
    currency: "SGD",
    bookingUrl:
      type === "hotel"
        ? "https://www.booking.com/city/jp/tokyo.html"
        : "https://www.trip.com/flights/singapore-to-tokyo/airfares-sin-tyo/",
    bookingLinkKind: "source",
    availability: "unknown",
    location: { name: "Tokyo", latitude: null, longitude: null },
    start: null,
    end: null,
    fetchedAt: "2026-10-05T00:00:00.000Z",
    metadata: {
      direction: type === "hotel" ? undefined : type,
      window,
      query: "Tokyo travel",
      domain: type === "hotel" ? "www.booking.com" : "www.trip.com",
    },
  }));
  const item = (
    title: string,
    startTime: string,
    endTime: string,
    cost: number,
    type: Item["type"],
    offerId: string | null = null,
  ): Item => ({
    id: randomUUID(),
    title,
    startTime,
    endTime,
    cost,
    type,
    offerId,
    costKind: "estimate",
    description: "A considered moment in the journey.",
    location: { name: "Tokyo", latitude: null, longitude: null },
    notes: "",
  });
  const plan: Plan = {
    title: "A little Tokyo, at your own pace",
    destination: "Tokyo",
    summary: "Neighborhood walks, local food and room to explore.",
    currency: "SGD",
    days: [
      {
        date: "2027-03-05",
        title: "Arrive and settle in",
        items: [
          item(
            "Outbound flight",
            "08:00",
            "16:00",
            25000,
            "transport",
            offers[0].id,
          ),
          item(
            "Your Tokyo stay",
            "18:00",
            "19:00",
            35000,
            "accommodation",
            offers[2].id,
          ),
        ],
      },
      {
        date: "2027-03-06",
        title: "Find your Tokyo rhythm",
        items: [
          item("Explore the neighborhood", "09:00", "11:00", 2000, "activity"),
          item("A free afternoon", "14:00", "17:00", 1500, "free-time"),
        ],
      },
      {
        date: "2027-03-07",
        title: "One last look",
        items: [
          item("Morning market", "08:00", "10:00", 3000, "meal"),
          item(
            "Return flight",
            "15:00",
            "23:00",
            25000,
            "transport",
            offers[1].id,
          ),
        ],
      },
    ],
  };
  const trip: Trip = {
    id: randomUUID(),
    version: 1,
    status: "DRAFT",
    request,
    plan,
    offers,
    bookings: [],
    updates: [],
    createdAt: new Date().toISOString(),
    warnings: ["All prices are planning estimates."],
  };
  return {
    request,
    window,
    offers,
    plan,
    trip,
    preferences: Preferences.parse({ interests: ["food", "nature"] }),
    emptyBooking: BookingDetails.parse({}),
  };
}
