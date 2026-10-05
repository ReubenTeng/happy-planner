import { describe, expect, it } from "vitest";
import {
  DateOnly,
  TripRequest,
  totalCost,
  validatePlan,
} from "../src/lib/domain";
import { applyMutation } from "../src/lib/ai/service";
import { fixture } from "./fixtures";
describe("structured itinerary constraints", () => {
  it("validates a complete estimate-based itinerary without inventing quotes", () => {
    const f = fixture();
    expect(validatePlan(f.plan, f.request, f.offers)).toEqual(f.plan);
    expect(totalCost(f.plan)).toBe(91500);
  });
  it("rejects impossible calendar dates and mismatched fixed durations", () => {
    expect(DateOnly.safeParse("2027-02-29").success).toBe(false);
    const f = fixture();
    expect(TripRequest.safeParse({ ...f.request, duration: 7 }).success).toBe(
      false,
    );
  });
  it("rejects overlapping activities", () => {
    const f = fixture();
    f.plan.days[0].items[1].startTime = "15:00";
    expect(() => validatePlan(f.plan, f.request, f.offers)).toThrow(/overlap/);
  });
  it("rejects over-budget plans", () => {
    const f = fixture();
    expect(() =>
      validatePlan(f.plan, { ...f.request, budget: 10000 }, f.offers),
    ).toThrow(/budget/);
  });
  it("does not allow a search result to become a verified quote", () => {
    const f = fixture();
    f.plan.days[0].items[0].costKind = "quote";
    expect(() => validatePlan(f.plan, f.request, f.offers)).toThrow(
      /no verified price/,
    );
  });
  it("rejects fabricated offer references", () => {
    const f = fixture();
    f.plan.days[0].items[0].offerId = crypto.randomUUID();
    expect(() => validatePlan(f.plan, f.request, f.offers)).toThrow(
      /unavailable offer/,
    );
  });
  it("rejects omitted return journeys", () => {
    const f = fixture();
    f.plan.days[2].items.pop();
    expect(() => validatePlan(f.plan, f.request, f.offers)).toThrow(
      /return flight/,
    );
  });
  it("rejects duplicate costs and duplicate item IDs", () => {
    const f = fixture();
    f.plan.days[1].items[0].type = "transport";
    f.plan.days[1].items[0].offerId = f.offers[0].id;
    expect(() => validatePlan(f.plan, f.request, f.offers)).toThrow(
      /charged once/,
    );
    f.plan.days[1].items[0].offerId = null;
    f.plan.days[1].items[0].id = f.plan.days[0].items[0].id;
    expect(() => validatePlan(f.plan, f.request, f.offers)).toThrow(
      /Duplicate/,
    );
  });
  it("rejects a hotel from the wrong date window", () => {
    const f = fixture();
    f.offers[2].metadata.window = { ...f.window, start: "2027-03-06" };
    expect(() => validatePlan(f.plan, f.request, f.offers)).toThrow(
      /dates and destination/,
    );
  });
  it("preserves confirmed booking items", () => {
    const f = fixture();
    const prior = structuredClone(f.plan);
    f.plan.days[0].items[0].title = "Changed flight";
    expect(() =>
      validatePlan(f.plan, f.request, f.offers, prior, [
        {
          itemId: prior.days[0].items[0].id,
          status: "CONFIRMED",
          details: f.emptyBooking,
          updatedAt: new Date().toISOString(),
        },
      ]),
    ).toThrow(/existing booking/);
  });
  it("applies targeted changes and preserves untouched items and the prior version", () => {
    const f = fixture();
    const original = structuredClone(f.plan);
    const target = f.plan.days[1].items[0];
    const next = applyMutation(
      f.trip,
      {
        explanation: "More nature",
        operations: [
          {
            kind: "replace",
            itemId: target.id,
            date: "2027-03-06",
            item: { ...target, title: "A riverside walk", cost: 0 },
          },
        ],
      },
      f.offers,
    );
    expect(next.days[1].items[0].title).toBe("A riverside walk");
    expect(next.days[0]).toEqual(original.days[0]);
    expect(f.trip.plan).toEqual(original);
  });
  it("rejects conflicting mutations to one item", () => {
    const f = fixture();
    const item = f.plan.days[1].items[0];
    const op = {
      kind: "replace" as const,
      itemId: item.id,
      date: "2027-03-06",
      item,
    };
    expect(() =>
      applyMutation(
        f.trip,
        { explanation: "Bad edit", operations: [op, op] },
        f.offers,
      ),
    ).toThrow(/conflicting/);
  });
});
