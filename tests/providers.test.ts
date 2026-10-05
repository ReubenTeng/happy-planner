import { describe, expect, it, vi } from "vitest";
import { SearxngProvider } from "../src/lib/providers/searxng";
import { ExternalRedirectBookingService } from "../src/lib/booking/service";
import { safeBookingUrl } from "../src/lib/providers/http";
import { fixture } from "./fixtures";
describe("SearXNG discovery adapter", () => {
  it("keeps provenance, strips tracking and refuses snippet prices", async () => {
    const f = fixture();
    const search = vi.fn().mockResolvedValue({
      results: [
        {
          title: "Tokyo hotels from $45",
          url: "https://www.booking.com/city/jp/tokyo.html?msockid=abc&utm_source=search",
          content: "Rooms from $45",
        },
        {
          title: "Duplicate",
          url: "https://www.booking.com/city/jp/tokyo.html",
        },
        {
          title: "Spoofed domain",
          url: "https://booking.com.attacker.example/hotel",
        },
        { title: "Unknown provider", url: "https://attacker.example/travel" },
      ],
    });
    const offers = await new SearxngProvider(search).searchHotels(
      f.request,
      f.window,
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      price: null,
      availability: "unknown",
      bookingLinkKind: "source",
      bookingUrl: "https://www.booking.com/city/jp/tokyo.html",
    });
    expect(offers[0].fetchedAt).toBeTruthy();
    expect(offers[0].metadata.query).toContain("Tokyo");
  });
  it("keeps separate outbound and return source references", async () => {
    const f = fixture();
    const p = new SearxngProvider(async () => ({
      results: [{ title: "Flights", url: "https://www.trip.com/flights/" }],
    }));
    const offers = await p.searchFlights(f.request, f.window);
    expect(offers.map((o) => o.metadata.direction)).toEqual([
      "outbound",
      "return",
    ]);
    expect(offers[0].providerOfferId).not.toBe(offers[1].providerOfferId);
  });
  it.each([
    "http://booking.com/",
    "https://user:pass@booking.com/",
    "https://127.0.0.1/",
    "https://169.254.169.254/",
    "javascript:alert(1)",
    "https://[::1]/",
  ])("refuses unsafe booking URL %s", (url) => {
    expect(() => safeBookingUrl(url)).toThrow();
  });
  it("rechecks a source before offering the redirect", async () => {
    const f = fixture();
    const provider = new SearxngProvider(async () => ({
      results: [{ title: "Hotels", url: f.offers[2].bookingUrl }],
    }));
    const result = await new ExternalRedirectBookingService(
      provider,
    ).initiateBooking(f.offers[2]);
    expect(result.kind).toBe("redirect");
    expect(await provider.getOfferDetails(f.offers[2])).toMatchObject({
      price: null,
      availability: "unknown",
    });
  });
  it("does not launch a disappeared source", async () => {
    const f = fixture();
    const provider = new SearxngProvider(async () => ({ results: [] }));
    await expect(
      new ExternalRedirectBookingService(provider).initiateBooking(f.offers[2]),
    ).rejects.toThrow(/could not be found/);
  });
  it("requires a review when a future priced provider changes its price", async () => {
    const f = fixture();
    const provider = new SearxngProvider();
    provider.getOfferDetails = async (offer) => ({
      ...offer,
      price: 22000,
      availability: "available",
    });
    await expect(
      new ExternalRedirectBookingService(provider).initiateBooking({
        ...f.offers[0],
        price: 21000,
        availability: "available",
      }),
    ).rejects.toThrow(/price has changed/);
  });
});
