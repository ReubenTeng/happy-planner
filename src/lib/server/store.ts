import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  BookingDetails,
  Plan,
  Preferences,
  TripRequest,
  Offer,
  validatePlan,
  type Trip,
  type Booking,
} from "../domain";
import { db, orm, transaction } from "./db";
import { eq } from "drizzle-orm";
import { preferences } from "./schema";
import { AppError } from "./errors";
export type JobLease = { id: string; token: string };
async function lockJob(c: PoolClient, lease?: JobLease) {
  if (!lease) return;
  const r = await c.query(
    "SELECT id FROM jobs WHERE id=$1 AND lock_token=$2 AND status='running' FOR UPDATE",
    [lease.id, lease.token],
  );
  if (!r.rowCount)
    throw new AppError(409, "This worker no longer owns the planning request.");
}
async function finishJob(
  c: PoolClient,
  lease: JobLease | undefined,
  result: unknown,
) {
  if (lease)
    await c.query(
      "UPDATE jobs SET status='completed',result=$3,error=NULL,updated_at=now() WHERE id=$1 AND lock_token=$2",
      [lease.id, lease.token, JSON.stringify(result)],
    );
}

export async function getPreferences(userId: string) {
  const rows = await orm()
    .select({ data: preferences.data })
    .from(preferences)
    .where(eq(preferences.userId, userId));
  return Preferences.parse(rows[0]?.data ?? {});
}
export async function savePreferences(userId: string, data: Preferences) {
  const parsed = Preferences.parse(data);
  await orm()
    .insert(preferences)
    .values({ userId, data: parsed })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { data: parsed, updatedAt: new Date() },
    });
}
export async function getTrip(
  userId: string,
  id: string,
  c?: PoolClient,
): Promise<Trip> {
  if (!c)
    return transaction(async (client) => {
      await client.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      return getTrip(userId, id, client);
    });
  const r = await c.query(
    `SELECT t.*,r.data AS request FROM trips t JOIN trip_requests r ON r.id=t.request_id WHERE t.id=$1 AND t.user_id=$2`,
    [id, userId],
  );
  if (!r.rows[0]) throw new AppError(404, "Trip not found.");
  const t = r.rows[0];
  const days = await c.query(
    `SELECT d.date::text,d.title,COALESCE(jsonb_agg(i.data ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL),'[]') AS items
    FROM trip_days d LEFT JOIN itinerary_items i ON i.day_id=d.id WHERE d.trip_id=$1 GROUP BY d.id ORDER BY d.date`,
    [id],
  );
  const offers = await c.query(
    "SELECT data FROM provider_offers WHERE trip_id=$1 ORDER BY fetched_at,id",
    [id],
  );
  const bookings = await c.query(
    "SELECT item_id,status,details,updated_at FROM bookings WHERE trip_id=$1",
    [id],
  );
  const updates = await c.query(
    "SELECT id,data,created_at FROM trip_updates WHERE trip_id=$1 ORDER BY created_at DESC LIMIT 50",
    [id],
  );
  return {
    id,
    version: t.version,
    status: t.status,
    request: TripRequest.parse(t.request),
    plan: Plan.parse({
      title: t.title,
      destination: t.destination,
      summary: t.summary,
      currency: t.currency,
      days: days.rows,
    }),
    offers: offers.rows.map((o) => Offer.parse(o.data)),
    warnings: t.warnings,
    createdAt: t.created_at.toISOString(),
    bookings: bookings.rows.map((b) => ({
      itemId: b.item_id,
      status: b.status,
      details: BookingDetails.parse(b.details),
      updatedAt: b.updated_at.toISOString(),
    })),
    updates: updates.rows.map((u) => ({
      ...u.data,
      id: u.id,
      createdAt: u.created_at.toISOString(),
    })),
  };
}
async function writePlan(
  c: PoolClient,
  tripId: string,
  plan: Plan,
  version: number,
  reason: string,
) {
  const ids = plan.days.flatMap((d) => d.items.map((i) => i.id));
  // A generated identifier must never overwrite another trip's item.
  const foreign = await c.query(
    `SELECT i.id FROM itinerary_items i JOIN trip_days d ON i.day_id=d.id WHERE i.id=ANY($1::uuid[]) AND d.trip_id<>$2`,
    [ids, tripId],
  );
  if (foreign.rowCount)
    throw new AppError(
      409,
      "Conflicting itinerary identifier. Please try again.",
    );
  await c.query(
    `DELETE FROM bookings WHERE trip_id=$1 AND NOT(item_id=ANY($2::uuid[])) AND status IN ('UNBOOKED','FAILED','CANCELLED')`,
    [tripId, ids],
  );
  await c.query(
    `DELETE FROM itinerary_items WHERE day_id IN (SELECT id FROM trip_days WHERE trip_id=$1) AND NOT(id=ANY($2::uuid[]))`,
    [tripId, ids],
  );
  for (const day of plan.days) {
    const d = await c.query(
      `INSERT INTO trip_days(id,trip_id,date,title) VALUES($1,$2,$3,$4)
      ON CONFLICT(trip_id,date) DO UPDATE SET title=EXCLUDED.title RETURNING id`,
      [randomUUID(), tripId, day.date, day.title],
    );
    for (const [position, item] of day.items.entries()) {
      await c.query(
        `INSERT INTO itinerary_items(id,day_id,position,data) VALUES($1,$2,$3,$4)
        ON CONFLICT(id) DO UPDATE SET day_id=EXCLUDED.day_id,position=EXCLUDED.position,data=EXCLUDED.data`,
        [item.id, d.rows[0].id, position, JSON.stringify(item)],
      );
    }
  }
  await c.query(
    "DELETE FROM trip_days WHERE trip_id=$1 AND NOT(date=ANY($2::date[]))",
    [tripId, plan.days.map((d) => d.date)],
  );
  await c.query(
    "UPDATE trips SET title=$2,destination=$3,summary=$4,currency=$5,version=$6,status='DRAFT',updated_at=now() WHERE id=$1",
    [
      tripId,
      plan.title,
      plan.destination,
      plan.summary,
      plan.currency,
      version,
    ],
  );
  await c.query(
    "INSERT INTO itinerary_versions(id,trip_id,version,plan,reason) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), tripId, version, JSON.stringify(plan), reason],
  );
}
export async function createTrip(
  userId: string,
  request: TripRequest,
  plan: Plan,
  offers: Offer[],
  warnings: string[],
  lease?: JobLease,
) {
  validatePlan(plan, request, offers);
  return transaction(async (c) => {
    await lockJob(c, lease);
    const id = randomUUID();
    const requestId = randomUUID();
    await c.query(
      "INSERT INTO trip_requests(id,user_id,data) VALUES($1,$2,$3)",
      [requestId, userId, JSON.stringify(request)],
    );
    await c.query(
      "INSERT INTO trips(id,user_id,request_id,title,destination,summary,currency,warnings) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        userId,
        requestId,
        plan.title,
        plan.destination,
        plan.summary,
        plan.currency,
        JSON.stringify(warnings),
      ],
    );
    for (const offer of offers)
      await c.query(
        "INSERT INTO provider_offers(id,trip_id,data,fetched_at) VALUES($1,$2,$3,$4)",
        [offer.id, id, JSON.stringify(offer), offer.fetchedAt],
      );
    await writePlan(c, id, plan, 1, "Initial itinerary");
    await scheduleMonitoring(c, userId, id, plan.days[0].date);
    await finishJob(c, lease, { tripId: id });
    return id;
  });
}
export async function savePlan(
  userId: string,
  tripId: string,
  plan: Plan,
  expectedVersion: number,
  reason: string,
  newOffers: Offer[] = [],
  lease?: JobLease,
) {
  return transaction(async (c) => {
    await lockJob(c, lease);
    await lockTrip(c, userId, tripId, expectedVersion);
    const trip = await getTrip(userId, tripId, c);
    const offers = [
      ...new Map([...trip.offers, ...newOffers].map((o) => [o.id, o])).values(),
    ];
    try {
      validatePlan(plan, trip.request, offers, trip.plan, trip.bookings);
    } catch (error) {
      throw new AppError(
        422,
        error instanceof Error
          ? error.message
          : "The itinerary change is invalid.",
      );
    }
    for (const offer of newOffers)
      await c.query(
        "INSERT INTO provider_offers(id,trip_id,data,fetched_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
        [offer.id, tripId, JSON.stringify(offer), offer.fetchedAt],
      );
    await writePlan(c, tripId, plan, trip.version + 1, reason);
    await scheduleMonitoring(c, userId, tripId, plan.days[0].date);
    await finishJob(c, lease, {
      tripId,
      version: trip.version + 1,
      explanation: reason,
    });
    return trip.version + 1;
  });
}
export async function lockTrip(
  c: PoolClient,
  userId: string,
  tripId: string,
  expectedVersion?: number,
) {
  const r = await c.query(
    "SELECT version FROM trips WHERE id=$1 AND user_id=$2 FOR UPDATE",
    [tripId, userId],
  );
  if (!r.rows[0]) throw new AppError(404, "Trip not found.");
  if (expectedVersion !== undefined && r.rows[0].version !== expectedVersion)
    throw new AppError(
      409,
      "Your trip changed in another session. Refresh and try again.",
    );
}
async function scheduleMonitoring(
  c: PoolClient,
  userId: string,
  tripId: string,
  start: string,
) {
  await c.query(
    "DELETE FROM jobs WHERE trip_id=$1 AND kind='monitor' AND status='queued'",
    [tripId],
  );
  for (const lead of [30, 14, 7, 3, 1]) {
    const runAfter = new Date(start + "T08:00:00Z");
    runAfter.setUTCDate(runAfter.getUTCDate() - lead);
    if (runAfter.getTime() > Date.now())
      await c.query(
        "INSERT INTO jobs(id,user_id,trip_id,kind,payload,run_after) VALUES($1,$2,$3,'monitor',$4,$5)",
        [randomUUID(), userId, tripId, JSON.stringify({ lead }), runAfter],
      );
  }
}
export async function createShare(userId: string, tripId: string) {
  await getTrip(userId, tripId);
  const token = randomBytes(32).toString("base64url");
  await db().query(
    `INSERT INTO share_links(id,trip_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '90 days')
    ON CONFLICT(trip_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=now()`,
    [randomUUID(), tripId, hashToken(token)],
  );
  return token;
}
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function sharedTrip(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const r = await db().query(
    `SELECT t.id,t.user_id FROM share_links s JOIN trips t ON t.id=s.trip_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [hashToken(token)],
  );
  if (!r.rows[0]) return null;
  const trip = await getTrip(r.rows[0].user_id, r.rows[0].id);
  // Explicit public projection: never expose confirmation details, email, private notes or provider metadata.
  return {
    plan: {
      ...trip.plan,
      days: trip.plan.days.map((d) => ({
        ...d,
        items: d.items.map((i) => ({ ...i, notes: "" })),
      })),
    },
    bookings: trip.bookings.map((b) => ({
      itemId: b.itemId,
      status: b.status,
    })),
  };
}
export async function recordBooking(
  userId: string,
  tripId: string,
  itemId: string,
  status: Booking["status"],
  details: BookingDetails,
  version: number,
) {
  return transaction(async (c) => {
    await lockTrip(c, userId, tripId, version);
    const trip = await getTrip(userId, tripId, c);
    const item = trip.plan.days
      .flatMap((d) => d.items)
      .find((i) => i.id === itemId);
    if (!item?.offerId)
      throw new AppError(400, "This item does not have a booking offer.");
    if (trip.status !== "APPROVED")
      throw new AppError(409, "Approve the itinerary before booking.");
    if (
      status === "EXTERNAL_BOOKING" &&
      trip.bookings.some((b) => b.itemId === itemId && b.status === "CONFIRMED")
    )
      throw new AppError(409, "This item is already marked booked.");
    await c.query(
      `INSERT INTO bookings(id,trip_id,item_id,status,details) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(item_id) DO UPDATE SET status=EXCLUDED.status,details=EXCLUDED.details,updated_at=now()`,
      [randomUUID(), tripId, itemId, status, JSON.stringify(details)],
    );
  });
}
