import { z } from "zod";

export const Currency = z.enum(["USD", "SGD", "EUR", "GBP"]);
export const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date");
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const Preferences = z.object({
  style: z
    .enum(["backpacker", "hostel", "mid-range", "luxury", "resort"])
    .default("mid-range"),
  pace: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  group: z.enum(["solo", "couple", "friends", "family"]).default("solo"),
  adventure: z.number().min(0).max(10).default(5),
  interests: z
    .array(
      z.enum([
        "nature",
        "hiking",
        "food",
        "nightlife",
        "culture",
        "shopping",
        "sports",
      ]),
    )
    .max(7)
    .default([]),
  budget: z.number().int().min(0).max(100_000_000).nullable().default(null),
  notes: z.string().max(1000).default(""),
});
export const TripRequest = z
  .object({
    origin: z.string().trim().min(2).max(100),
    originAirport: z.string().regex(/^[A-Z]{3}$/),
    destinations: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(100),
          airport: z.string().regex(/^[A-Z]{3}$/),
        }),
      )
      .min(1)
      .max(3),
    earliestDate: DateOnly,
    latestDate: DateOnly,
    duration: z.number().int().min(2).max(21),
    flexible: z.boolean(),
    dateNotes: z.string().max(300).default(""),
    travelers: z.number().int().min(1).max(6),
    rooms: z.literal(1),
    budget: z.number().int().min(10000).max(100_000_000),
    currency: Currency,
  })
  .superRefine((v, ctx) => {
    const span = daysBetween(v.earliestDate, v.latestDate) + 1;
    if (span < v.duration || span > 90)
      ctx.addIssue({
        code: "custom",
        message: "Date window must fit your trip and be at most 90 days.",
      });
    if (!v.flexible && span !== v.duration)
      ctx.addIssue({
        code: "custom",
        message: "For fixed dates, duration must match the date range.",
      });
    if (v.rooms > v.travelers)
      ctx.addIssue({
        code: "custom",
        message: "Rooms cannot exceed travelers.",
      });
  });
export const Location = z.object({
  name: z.string().max(200),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});
export const Offer = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  providerOfferId: z.string(),
  type: z.enum(["flight", "hotel", "activity", "event"]),
  title: z.string().min(1).max(300),
  description: z.string().max(2000),
  price: z.number().int().nonnegative().nullable(),
  currency: Currency,
  bookingUrl: z.string().url(),
  bookingLinkKind: z.enum(["offer", "search", "source"]),
  availability: z.enum(["available", "unknown", "unavailable"]),
  location: Location,
  start: z.string().nullable(),
  end: z.string().nullable(),
  fetchedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
});
export const Item = z.object({
  id: z.string().uuid(),
  startTime: Time,
  endTime: Time,
  type: z.enum(["transport", "accommodation", "activity", "meal", "free-time"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  location: Location,
  cost: z.number().int().nonnegative(),
  costKind: z.enum(["quote", "estimate"]),
  offerId: z.string().uuid().nullable(),
  notes: z.string().max(1000),
});
export const Plan = z.object({
  title: z.string().min(1).max(200),
  destination: z.string().min(1).max(100),
  summary: z.string().max(2000),
  currency: Currency,
  days: z
    .array(
      z.object({
        date: DateOnly,
        title: z.string().max(200),
        items: z.array(Item).min(1).max(12),
      }),
    )
    .min(2)
    .max(21),
});
export const BookingStatus = z.enum([
  "UNBOOKED",
  "BOOKING_STARTED",
  "EXTERNAL_BOOKING",
  "PENDING",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
]);
export const BookingDetails = z.object({
  confirmationNumber: z.string().max(150).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  paidPrice: z.number().int().nonnegative().nullable().default(null),
  notes: z.string().max(2000).default(""),
});
export type Preferences = z.infer<typeof Preferences>;
export type TripRequest = z.infer<typeof TripRequest>;
export type Offer = z.infer<typeof Offer>;
export type Plan = z.infer<typeof Plan>;
export type Item = z.infer<typeof Item>;
export type BookingDetails = z.infer<typeof BookingDetails>;
export type Booking = {
  itemId: string;
  status: z.infer<typeof BookingStatus>;
  details: BookingDetails;
  updatedAt: string;
};
export type TripUpdate = {
  id: string;
  type: string;
  severity: "info" | "warning";
  title: string;
  message: string;
  source: string;
  suggestedAction: string;
  createdAt: string;
};
export type Trip = {
  id: string;
  version: number;
  status: "DRAFT" | "APPROVED";
  request: TripRequest;
  plan: Plan;
  offers: Offer[];
  bookings: Booking[];
  updates: TripUpdate[];
  createdAt: string;
  warnings: string[];
};
export function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function totalCost(plan: Plan) {
  return plan.days.flatMap((d) => d.items).reduce((sum, i) => sum + i.cost, 0);
}
export function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function validatePlan(
  plan: Plan,
  request: TripRequest,
  offers: Offer[],
  previous?: Plan,
  bookings: Booking[] = [],
) {
  Plan.parse(plan);
  if (plan.currency !== request.currency)
    throw new Error("Itinerary currency changed.");
  if (
    !request.destinations.some(
      (d) => d.name.toLowerCase() === plan.destination.toLowerCase(),
    )
  )
    throw new Error("Destination is outside your request.");
  if (plan.days.length !== request.duration)
    throw new Error("Itinerary duration does not match your request.");
  const first = plan.days[0].date;
  if (
    first < request.earliestDate ||
    plan.days.at(-1)!.date > request.latestDate
  )
    throw new Error("Itinerary is outside your travel window.");
  const ids = new Set<string>();
  const usedOffers = new Set<string>();
  for (const [n, day] of plan.days.entries()) {
    if (day.date !== addDays(first, n))
      throw new Error("Itinerary dates must be consecutive.");
    let end = "00:00";
    for (const item of day.items) {
      if (ids.has(item.id)) throw new Error("Duplicate itinerary item.");
      ids.add(item.id);
      if (item.startTime >= item.endTime || item.startTime < end)
        throw new Error("Itinerary activities overlap or have invalid times.");
      end = item.endTime;
      if (item.offerId) {
        const offer = offers.find((o) => o.id === item.offerId);
        if (
          !offer ||
          offer.currency !== plan.currency ||
          offer.availability === "unavailable"
        )
          throw new Error("Itinerary refers to an unavailable offer.");
        const expectedType =
          offer.type === "flight"
            ? "transport"
            : offer.type === "hotel"
              ? "accommodation"
              : "activity";
        if (item.type !== expectedType)
          throw new Error(
            "The itinerary item does not match its provider source type.",
          );
        if (offer.metadata.sandbox && process.env.NODE_ENV === "production")
          throw new Error(
            "Sandbox travel data cannot be used in a production itinerary.",
          );
        if (usedOffers.has(offer.id))
          throw new Error("An offer may only be charged once.");
        usedOffers.add(offer.id);
        if (
          offer.price !== null &&
          (item.cost !== offer.price || item.costKind !== "quote")
        )
          throw new Error("Quoted prices must match provider offers.");
        if (offer.price === null && item.costKind !== "estimate")
          throw new Error(
            "A discovery result has no verified price; use a planning estimate.",
          );
      } else if (item.costKind === "quote")
        throw new Error("A quoted price requires a provider offer.");
    }
  }
  const selected = offers.filter((o) => usedOffers.has(o.id));
  if (
    selected.filter((o) => o.type === "hotel").length !== 1 ||
    selected.filter((o) => o.metadata.direction === "outbound").length !== 1 ||
    selected.filter((o) => o.metadata.direction === "return").length !== 1
  ) {
    throw new Error(
      "Include one accommodation quote, one outbound flight and one return flight.",
    );
  }
  for (const offer of selected) {
    const window = offer.metadata.window as
      | { start?: string; end?: string; destination?: { name?: string } }
      | undefined;
    if (
      window &&
      (window.start !== first ||
        window.end !== plan.days.at(-1)!.date ||
        window.destination?.name !== plan.destination)
    )
      throw new Error(
        "Selected offers do not match the itinerary dates and destination.",
      );
  }
  if (totalCost(plan) > request.budget)
    throw new Error(
      "The itinerary exceeds your total budget. Increase your budget or change your request.",
    );
  if (previous) {
    for (const booking of bookings.filter(
      (b) => !["UNBOOKED", "FAILED", "CANCELLED"].includes(b.status),
    )) {
      const before = previous.days
        .flatMap((d) => d.items.map((i) => ({ date: d.date, ...i })))
        .find((i) => i.id === booking.itemId);
      const after = plan.days
        .flatMap((d) => d.items.map((i) => ({ date: d.date, ...i })))
        .find((i) => i.id === booking.itemId);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error(
          "Cancel or resolve the existing booking before changing its itinerary item.",
        );
    }
  }
  return plan;
}
