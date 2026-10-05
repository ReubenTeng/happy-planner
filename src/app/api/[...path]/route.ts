import { z } from "zod";
import { BookingDetails, Plan, Preferences, TripRequest } from "@/lib/domain";
import { requireUser } from "@/lib/server/auth";
import { db, transaction } from "@/lib/server/db";
import { AppError, required } from "@/lib/server/errors";
import { body, failure, json, rateLimit, sameOrigin } from "@/lib/server/http";
import {
  createShare,
  getPreferences,
  getTrip,
  lockTrip,
  recordBooking,
  savePlan,
  savePreferences,
} from "@/lib/server/store";
import { enqueue } from "@/lib/server/jobs";
import { providers } from "@/lib/providers";
import { ExternalRedirectBookingService } from "@/lib/booking/service";
import { requireAI } from "@/lib/ai/service";
import { requireWorkflow } from "@/lib/server/inngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const Uuid = z.string().uuid();
const Version = z.object({ version: z.number().int().positive() });
export async function GET(req: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path.join("/") === "health") {
      try {
        await db().query("SELECT 1");
        return json({ status: "ok" });
      } catch {
        return json({ status: "unavailable" }, 503);
      }
    }
    const user = await requireUser();
    if (path[0] === "preferences") return json(await getPreferences(user.id));
    if (path[0] === "jobs" && path.length === 2) {
      const r = await db().query(
        "SELECT id,status,result,error FROM jobs WHERE id=$1 AND user_id=$2",
        [Uuid.parse(path[1]), user.id],
      );
      if (!r.rows[0]) throw new AppError(404, "Request not found.");
      return json(r.rows[0]);
    }
    if (path[0] === "trips" && path.length === 1) {
      const r = await db().query(
        "SELECT id,title,destination,currency,status,created_at FROM trips WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user.id],
      );
      return json(r.rows);
    }
    if (path[0] === "trips" && path[1]) {
      const trip = await getTrip(user.id, Uuid.parse(path[1]));
      if (path.length === 2) return json(trip);
      if (path[2] === "versions") {
        const r = await db().query(
          "SELECT version,reason,created_at FROM itinerary_versions WHERE trip_id=$1 ORDER BY version DESC LIMIT 50",
          [trip.id],
        );
        return json(r.rows);
      }
    }
    throw new AppError(404, "Not found.");
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request, context: Context) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    const { path } = await context.params;
    await rateLimit(`write:${user.id}`, 100, 3600);
    if (path.join("/") === "preferences") {
      const data = await body(req, Preferences);
      await savePreferences(user.id, data);
      return json(data);
    }
    if (path.join("/") === "trips") {
      requireAI();
      requireWorkflow();
      required("SEARCH_BASE_URL");
      const data = await body(req, TripRequest);
      if (data.earliestDate <= new Date().toISOString().slice(0, 10))
        throw new AppError(400, "Choose a future departure date.");
      await rateLimit(`plan:${user.id}`, 10, 86400);
      return json({ jobId: await enqueue(user.id, "generate", data) }, 202);
    }
    if (path[0] !== "trips" || path.length !== 3)
      throw new AppError(404, "Not found.");
    const tripId = Uuid.parse(path[1]);
    const action = path[2];
    const trip = await getTrip(user.id, tripId);
    if (action === "edit") {
      requireAI();
      requireWorkflow();
      required("SEARCH_BASE_URL");
      const data = await body(
        req,
        Version.extend({ text: z.string().trim().min(1).max(2000) }),
      );
      if (data.version !== trip.version)
        throw new AppError(409, "Refresh your trip before editing.");
      await rateLimit(`edit:${user.id}`, 30, 86400);
      return json(
        { jobId: await enqueue(user.id, "modify", data, tripId) },
        202,
      );
    }
    if (action === "restore") {
      const data = await body(
        req,
        Version.extend({ targetVersion: z.number().int().positive() }),
      );
      const r = await db().query(
        "SELECT plan FROM itinerary_versions WHERE trip_id=$1 AND version=$2",
        [tripId, data.targetVersion],
      );
      if (!r.rows[0]) throw new AppError(404, "Version not found.");
      return json({
        version: await savePlan(
          user.id,
          tripId,
          Plan.parse(r.rows[0].plan),
          data.version,
          `Restored version ${data.targetVersion}`,
        ),
      });
    }
    if (action === "approve") {
      const data = await body(req, Version);
      await transaction(async (c) => {
        await lockTrip(c, user.id, tripId, data.version);
        await c.query(
          "UPDATE trips SET status='APPROVED',updated_at=now() WHERE id=$1",
          [tripId],
        );
      });
      return json({ status: "APPROVED" });
    }
    if (action === "share") {
      const data = await body(req, z.object({ enabled: z.boolean() }));
      if (!data.enabled) {
        await db().query("DELETE FROM share_links WHERE trip_id=$1", [tripId]);
        return json({ url: null });
      }
      const token = await createShare(user.id, tripId);
      return json({
        url: new URL(`/share/${token}`, required("APP_URL")).toString(),
      });
    }
    if (action === "booking") {
      const data = await body(
        req,
        Version.extend({
          itemId: Uuid,
          action: z.enum(["launch", "confirm", "clear"]),
          details: BookingDetails.optional(),
        }),
      );
      if (data.version !== trip.version)
        throw new AppError(409, "Refresh your itinerary before booking.");
      if (trip.status !== "APPROVED")
        throw new AppError(409, "Approve your itinerary before booking.");
      const item = trip.plan.days
        .flatMap((d) => d.items)
        .find((i) => i.id === data.itemId);
      const offer = trip.offers.find((o) => o.id === item?.offerId);
      if (!offer)
        throw new AppError(400, "No booking source is attached to this item.");
      if (data.action === "launch") {
        await rateLimit(`book:${user.id}`, 30, 3600);
        const provider = providers().find((p) => p.name === offer.provider);
        if (!provider)
          throw new AppError(503, "This booking provider is unavailable.");
        const result = await new ExternalRedirectBookingService(
          provider,
        ).initiateBooking(offer);
        const existing = trip.bookings.find((b) => b.itemId === data.itemId);
        if (existing?.status === "CONFIRMED")
          throw new AppError(409, "This item is already marked booked.");
        await recordBooking(
          user.id,
          tripId,
          data.itemId,
          "EXTERNAL_BOOKING",
          existing?.details ?? BookingDetails.parse({}),
          data.version,
        );
        return json(
          result.kind === "redirect"
            ? { kind: result.kind, url: result.url }
            : result,
        );
      }
      await recordBooking(
        user.id,
        tripId,
        data.itemId,
        data.action === "confirm" ? "CONFIRMED" : "CANCELLED",
        data.details ?? BookingDetails.parse({}),
        data.version,
      );
      return json({
        status: data.action === "confirm" ? "CONFIRMED" : "CANCELLED",
      });
    }
    if (action === "monitor") {
      requireWorkflow();
      await rateLimit(`monitor:${user.id}`, 4, 86400);
      return json(
        { jobId: await enqueue(user.id, "monitor", {}, tripId) },
        202,
      );
    }
    throw new AppError(404, "Not found.");
  } catch (error) {
    return failure(error);
  }
}
