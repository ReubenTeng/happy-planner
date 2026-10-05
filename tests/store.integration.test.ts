import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, transaction } from "../src/lib/server/db";
import {
  createShare,
  createTrip,
  getTrip,
  recordBooking,
  savePlan,
  savePreferences,
  sharedTrip,
} from "../src/lib/server/store";
import {
  enqueue,
  runNextJob,
  runJobWorkflow,
  type StepRunner,
  type JobServices,
} from "../src/lib/server/jobs";
import { StructuredAIService } from "../src/lib/ai/service";
import { fixture } from "./fixtures";

const owner = randomUUID();
const stranger = randomUUID();
beforeAll(async () => {
  if (
    !process.env.DATABASE_URL ||
    !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
  )
    throw new Error(
      "Integration tests require an isolated database ending in _test.",
    );
  await db().query(
    "INSERT INTO users(id,auth_subject,email,name) VALUES($1,$2,'owner@example.test','Owner'),($3,$4,'stranger@example.test','Stranger')",
    [owner, owner, stranger, stranger],
  );
});
beforeEach(async () => {
  await db().query("DELETE FROM jobs WHERE user_id=ANY($1::uuid[])", [
    [owner, stranger],
  ]);
});
afterAll(async () => {
  await db().query(
    "DELETE FROM bookings WHERE trip_id IN(SELECT id FROM trips WHERE user_id=ANY($1::uuid[]))",
    [[owner, stranger]],
  );
  await db().query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, stranger],
  ]);
  await db().end();
});
describe("PostgreSQL trip workflow", () => {
  it("persists structured trips and isolates users", async () => {
    const f = fixture();
    const id = await createTrip(owner, f.request, f.plan, f.offers, []);
    expect((await getTrip(owner, id)).plan).toEqual(f.plan);
    await expect(getTrip(stranger, id)).rejects.toMatchObject({ status: 404 });
  });
  it("versions targeted edits and rejects stale writes", async () => {
    const f = fixture();
    const id = await createTrip(owner, f.request, f.plan, f.offers, []);
    const changed = structuredClone(f.plan);
    changed.days[1].items[0].title = "A riverside walk";
    expect(await savePlan(owner, id, changed, 1, "More nature")).toBe(2);
    await expect(
      savePlan(owner, id, f.plan, 1, "Stale edit"),
    ).rejects.toMatchObject({ status: 409 });
    const versions = await db().query(
      "SELECT version,plan FROM itinerary_versions WHERE trip_id=$1 ORDER BY version",
      [id],
    );
    expect(versions.rows).toHaveLength(2);
    expect(versions.rows[0].plan).toEqual(f.plan);
  });
  it("serializes concurrent edits with optimistic version checks", async () => {
    const f = fixture();
    const id = await createTrip(owner, f.request, f.plan, f.offers, []);
    const results = await Promise.allSettled([
      savePlan(owner, id, f.plan, 1, "First"),
      savePlan(owner, id, f.plan, 1, "Second"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getTrip(owner, id)).version).toBe(2);
  });
  it("protects confirmed bookings and strips private fields from public links", async () => {
    const f = fixture();
    f.plan.days[0].items[0].notes = "Private accessibility note";
    const id = await createTrip(owner, f.request, f.plan, f.offers, []);
    await db().query("UPDATE trips SET status='APPROVED' WHERE id=$1", [id]);
    const item = f.plan.days[0].items[0];
    await recordBooking(
      owner,
      id,
      item.id,
      "CONFIRMED",
      {
        confirmationNumber: "PRIVATE-123",
        email: "private@example.test",
        paidPrice: 25000,
        notes: "Private booking note",
      },
      1,
    );
    const changed = structuredClone(f.plan);
    changed.days[0].items[0].title = "A different flight";
    await expect(savePlan(owner, id, changed, 1, "Attempt")).rejects.toThrow(
      /existing booking/,
    );
    const token = await createShare(owner, id);
    const shared = await sharedTrip(token);
    const serialized = JSON.stringify(shared);
    expect(serialized).not.toMatch(
      /PRIVATE-123|private@example|accessibility|Private booking/,
    );
    expect(shared?.bookings[0].status).toBe("CONFIRMED");
    const replacement = await createShare(owner, id);
    expect(await sharedTrip(token)).toBe(null);
    expect(await sharedTrip(replacement)).not.toBe(null);
    await db().query("DELETE FROM share_links WHERE trip_id=$1", [id]);
    expect(await sharedTrip(replacement)).toBe(null);
  });
  it("expires links and stores only their hashes", async () => {
    const f = fixture();
    const id = await createTrip(owner, f.request, f.plan, f.offers, []);
    const token = await createShare(owner, id);
    const r = await db().query(
      "SELECT token_hash FROM share_links WHERE trip_id=$1",
      [id],
    );
    expect(r.rows[0].token_hash).not.toBe(token);
    await db().query(
      "UPDATE share_links SET expires_at=now()-interval '1 second' WHERE trip_id=$1",
      [id],
    );
    expect(await sharedTrip(token)).toBe(null);
  });
  it("refuses foreign item identifiers without altering either trip", async () => {
    const a = fixture();
    const b = fixture();
    const first = await createTrip(owner, a.request, a.plan, a.offers, []);
    b.plan.days[1].items[0].id = a.plan.days[1].items[0].id;
    await expect(
      createTrip(stranger, b.request, b.plan, b.offers, []),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getTrip(owner, first)).plan).toEqual(a.plan);
  });
  it("runs the durable generation and editing pipeline with injected test service contracts", async () => {
    const f = fixture();
    await savePreferences(owner, f.preferences);
    const ai = new StructuredAIService();
    ai.selectWindows = async () => [f.window];
    ai.generateItinerary = async () => f.plan;
    ai.modifyItinerary = async (trip) => {
      const item = trip.plan.days[1].items[0];
      return {
        explanation: "More nature",
        operations: [
          {
            kind: "replace",
            date: "2027-03-06",
            itemId: item.id,
            item: { ...item, title: "A riverside walk", cost: 0 },
          },
        ],
      };
    };
    const services: JobServices = {
      ai,
      search: async () => ({
        window: f.window,
        offers: f.offers,
        warnings: [],
      }),
      monitor: async () => {},
    };
    const id = await enqueue(owner, "generate", f.request);
    await expect(enqueue(owner, "generate", f.request)).rejects.toMatchObject({
      status: 409,
    });
    expect(await runNextJob(services)).toBe(true);
    const job = (
      await db().query("SELECT status,result FROM jobs WHERE id=$1", [id])
    ).rows[0];
    expect(job.status).toBe("completed");
    const tripId = job.result.tripId;
    expect((await getTrip(owner, tripId)).version).toBe(1);
    const editId = await enqueue(
      owner,
      "modify",
      { text: "More nature", version: 1 },
      tripId,
    );
    await runNextJob(services);
    expect(
      (await db().query("SELECT status FROM jobs WHERE id=$1", [editId]))
        .rows[0].status,
    ).toBe("completed");
    const updated = await getTrip(owner, tripId);
    expect(updated.version).toBe(2);
    expect(updated.plan.days[1].items[0].title).toBe("A riverside walk");
  });
  it("fences expired workers before committing output", async () => {
    const f = fixture();
    const id = await enqueue(owner, "generate", f.request);
    await expect(
      createTrip(owner, f.request, f.plan, f.offers, [], {
        id,
        token: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("replays durable workflow steps without duplicating the trip", async () => {
    const f = fixture();
    const ai = new StructuredAIService();
    ai.selectWindows = async () => [f.window];
    ai.generateItinerary = async () => f.plan;
    const services: JobServices = {
      ai,
      search: async () => ({
        window: f.window,
        offers: f.offers,
        warnings: [],
      }),
      monitor: async () => {},
    };
    const cache = new Map<string, unknown>();
    const step: StepRunner = async (name, fn) => {
      if (!cache.has(name)) cache.set(name, await fn());
      return cache.get(name) as Awaited<ReturnType<typeof fn>>;
    };
    const id = await enqueue(owner, "generate", f.request);
    const first = await runJobWorkflow(id, step, services);
    const second = await runJobWorkflow(id, step, services);
    expect(first).toEqual(second);
    expect(cache.has("generate-validated-itinerary")).toBe(true);
    expect(
      (await db().query("SELECT status FROM jobs WHERE id=$1", [id])).rows[0]
        .status,
    ).toBe("completed");
  });
  it("atomically rolls back failed database mutations", async () => {
    const key = `test:${randomUUID()}`;
    await expect(
      transaction(async (c) => {
        await c.query(
          "INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now())",
          [key],
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      (await db().query("SELECT key FROM rate_limits WHERE key=$1", [key]))
        .rowCount,
    ).toBe(0);
  });
});
