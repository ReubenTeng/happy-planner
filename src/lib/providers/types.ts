import type { Offer, TripRequest } from "../domain";
export type SearchWindow = {
  destination: { name: string; airport: string };
  start: string;
  end: string;
};
export interface TravelProvider {
  readonly name: string;
  searchFlights(request: TripRequest, window: SearchWindow): Promise<Offer[]>;
  searchHotels(request: TripRequest, window: SearchWindow): Promise<Offer[]>;
  searchActivities(
    request: TripRequest,
    window: SearchWindow,
  ): Promise<Offer[]>;
  searchEvents(request: TripRequest, window: SearchWindow): Promise<Offer[]>;
  getOfferDetails(offer: Offer): Promise<Offer>;
  buildBookingUrl(offer: Offer): string;
}
export type SearchResult = {
  window: SearchWindow;
  offers: Offer[];
  warnings: string[];
};
