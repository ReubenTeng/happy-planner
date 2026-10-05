import type { Offer } from "../domain";
import type { TravelProvider } from "../providers/types";
import { AppError } from "../server/errors";
export type BookingInitiation =
  | { kind: "redirect"; url: string; offer: Offer }
  | { kind: "checkout"; checkoutId: string };
export interface BookingService {
  initiateBooking(offer: Offer): Promise<BookingInitiation>;
  getBookingStatus(): Promise<
    "EXTERNAL_BOOKING" | "PENDING" | "CONFIRMED" | "FAILED" | "CANCELLED"
  >;
  cancelBooking(): Promise<{ providerCancellationRequired: boolean }>;
}
export class ExternalRedirectBookingService implements BookingService {
  constructor(private readonly provider: TravelProvider) {}
  async initiateBooking(offer: Offer): Promise<BookingInitiation> {
    const fresh = await this.provider.getOfferDetails(offer);
    if (fresh.availability === "unavailable")
      throw new AppError(
        409,
        "This source could not be found again. Replace it before booking.",
      );
    if (fresh.price !== null && fresh.availability !== "available")
      throw new AppError(
        409,
        "This priced offer could not be verified. Replace it before booking.",
      );
    if (fresh.currency !== offer.currency || fresh.price !== offer.price)
      throw new AppError(
        409,
        "This price has changed. Refresh or replace the itinerary item and approve the new quote before booking.",
      );
    return {
      kind: "redirect",
      url: this.provider.buildBookingUrl(fresh),
      offer: fresh,
    };
  }
  async getBookingStatus() {
    return "EXTERNAL_BOOKING" as const;
  }
  async cancelBooking() {
    return { providerCancellationRequired: true };
  }
}
