import { afterEach, describe, expect, it, vi } from "vitest";
import { AmadeusProvider } from "../src/lib/providers/amadeus";
import { StructuredAIService } from "../src/lib/ai/service";
import { WeatherMonitor } from "../src/lib/monitoring/service";
import { fixture } from "./fixtures";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("credential-backed service contracts", () => {
  it("uses Amadeus OAuth and preserves party-level flight quote provenance", async () => {
    vi.stubEnv("AMADEUS_CLIENT_ID", "test-client");
    vi.stubEnv("AMADEUS_CLIENT_SECRET", "test-secret");
    vi.stubEnv("AMADEUS_ENV", "production");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        calls.push(url.pathname);
        if (url.pathname.endsWith("/token"))
          return response({
            access_token: "test-only-access-token",
            expires_in: 1800,
          });
        return response({
          data: [
            {
              id: "1",
              price: { total: "250.00", currency: "SGD" },
              itineraries: [
                {
                  segments: [
                    {
                      departure: {
                        iataCode: url.searchParams.get("originLocationCode"),
                        at: `${url.searchParams.get("departureDate")}T08:00:00`,
                      },
                      arrival: {
                        iataCode: url.searchParams.get(
                          "destinationLocationCode",
                        ),
                        at: `${url.searchParams.get("departureDate")}T16:00:00`,
                      },
                      carrierCode: "SQ",
                      number: "638",
                    },
                  ],
                },
              ],
            },
          ],
        });
      }),
    );
    const f = fixture();
    const offers = await new AmadeusProvider().searchFlights(
      f.request,
      f.window,
    );
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      provider: "amadeus",
      price: 25000,
      currency: "SGD",
      bookingLinkKind: "search",
      availability: "available",
    });
    expect(calls.filter((path) => path.endsWith("/token"))).toHaveLength(1);
    expect(offers[1].metadata.direction).toBe("return");
  });
  it("blocks Amadeus sandbox inventory in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AMADEUS_ENV", "test");
    const f = fixture();
    await expect(
      new AmadeusProvider().searchFlights(f.request, f.window),
    ).rejects.toThrow(/sandbox/);
  });
  it("falls back from a throttled OpenAI request to validated Gemini output", async () => {
    vi.stubEnv("PLANNER_AI_API_KEY", "test-primary-key");
    vi.stubEnv("GEMINI_API_KEY", "test-fallback-key");
    const hosts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string | Request) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        hosts.push(url.hostname);
        if (url.hostname === "api.openai.com")
          return response(
            { error: { message: "Rate limited", type: "rate_limit_error" } },
            429,
          );
        return response({
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  {
                    text: JSON.stringify({
                      items: ["Waterproof jacket", "Warm layers"],
                    }),
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        });
      }),
    );
    expect(
      await new StructuredAIService().generatePackingAdvice({
        minimumTemperature: 2,
        rain: true,
      }),
    ).toEqual(["Waterproof jacket", "Warm layers"]);
    expect(hosts).toEqual([
      "api.openai.com",
      "generativelanguage.googleapis.com",
    ]);
  });
  it("does not invent an itinerary when both AI providers are absent", async () => {
    vi.stubEnv("PLANNER_AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(
      new StructuredAIService().generatePackingAdvice({}),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("does not invent a daily forecast outside the real forecast horizon", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const updates = await new WeatherMonitor().check(fixture().trip);
    expect(fetch).not.toHaveBeenCalled();
    expect(updates[0].type).toBe("readiness");
    expect(updates[0].message).toContain("not available");
  });
  it("creates weather and packing updates only from returned travel-date forecasts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-01T00:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        String(input).includes("geocoding")
          ? response({
              results: [{ latitude: 35.6, longitude: 139.6, name: "Tokyo" }],
            })
          : response({
              daily: {
                time: ["2027-03-05", "2027-03-08"],
                temperature_2m_min: [-2, 7],
                temperature_2m_max: [5, 15],
                precipitation_probability_max: [80, 10],
                weather_code: [95, 0],
              },
            }),
      ),
    );
    const updates = await new WeatherMonitor().check(fixture().trip);
    expect(updates).toHaveLength(1);
    expect(updates[0].severity).toBe("warning");
    expect(updates[0].suggestedAction).toContain("thermal layers");
    expect(updates[0].source).toBe("Open-Meteo");
  });
});
