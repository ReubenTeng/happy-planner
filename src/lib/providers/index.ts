import type { TripRequest } from "../domain";
import { AppError } from "../server/errors";
import { SearxngProvider } from "./searxng";
import { AmadeusProvider } from "./amadeus";
import type { SearchResult, SearchWindow, TravelProvider } from "./types";
export function providers(): TravelProvider[] {
  return [
    ...(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET
      ? [new AmadeusProvider()]
      : []),
    new SearxngProvider(),
  ];
}
export async function searchTravel(
  request: TripRequest,
  window: SearchWindow,
  registry = providers(),
): Promise<SearchResult> {
  const results = await Promise.allSettled(
    registry.flatMap((p) => [
      p.searchFlights(request, window),
      p.searchHotels(request, window),
      p.searchActivities(request, window),
      p.searchEvents(request, window),
    ]),
  );
  const offers = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  if (
    !offers.some((o) => o.type === "hotel") ||
    !offers.some((o) => o.metadata.direction === "outbound") ||
    !offers.some((o) => o.metadata.direction === "return")
  ) {
    throw new AppError(
      422,
      "We couldn't find enough flight and accommodation sources. Try another destination, or try again when search is available.",
    );
  }
  return {
    window,
    offers,
    warnings: [
      "Costs labeled estimated are planning estimates. Amadeus production results may include dated quotes; SearXNG discovers provider pages without verified pricing or availability. Confirm final prices and dates at the provider.",
      "Flights are planned as separate outbound and return journeys. Confirm arrival times, baggage, transfers, opening hours and entry requirements before travel.",
      ...results
        .filter((r) => r.status === "rejected")
        .map(() => "One travel source was unavailable during this search."),
    ],
  };
}
