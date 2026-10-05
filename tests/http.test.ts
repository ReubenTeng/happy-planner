import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { body, failure, sameOrigin } from "../src/lib/server/http";
afterEach(() => vi.unstubAllEnvs());
describe("request boundaries", () => {
  it("rejects cross-origin and missing-origin writes", () => {
    vi.stubEnv("APP_URL", "https://planner.example");
    expect(() =>
      sameOrigin(
        new Request("https://planner.example/api/trips", {
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
        }),
      ),
    ).toThrow(/not allowed/);
    expect(() =>
      sameOrigin(new Request("https://planner.example/api/trips")),
    ).toThrow(/not allowed/);
  });
  it("accepts same-origin JSON writes", () => {
    vi.stubEnv("APP_URL", "https://planner.example");
    expect(() =>
      sameOrigin(
        new Request("https://planner.example/api/trips", {
          headers: {
            origin: "https://planner.example",
            "content-type": "application/json",
          },
        }),
      ),
    ).not.toThrow();
  });
  it("limits actual streamed body size even without content-length", async () => {
    await expect(
      body(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ text: "a".repeat(40000) }),
        }),
        z.unknown(),
      ),
    ).rejects.toThrow(/too large/);
  });
  it("does not reflect arbitrary upstream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = failure(new Error("api_key=private-token"));
    expect(await response.text()).not.toContain("private-token");
    spy.mockRestore();
  });
});
