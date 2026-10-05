import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TripRequest } from "../domain";
import {
  StructuredAIService,
  applyMutation,
  type AIService,
} from "../ai/service";
import { searchTravel } from "../providers";
import { db, transaction } from "./db";
import { AppError } from "./errors";
import { createTrip, getPreferences, getTrip, savePlan } from "./store";
import { monitorTrip } from "../monitoring/service";
import { sendJobEvent } from "./inngest";

export async function enqueue(
  userId: string,
  kind: "generate" | "modify" | "monitor",
  payload: unknown,
  tripId?: string,
) {
  const id = randomUUID();
  try {
    await db().query(
      "INSERT INTO jobs(id,user_id,trip_id,kind,payload) VALUES($1,$2,$3,$4,$5)",
      [id, userId, tripId ?? null, kind, JSON.stringify(payload)],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new AppError(
        409,
        "A planning request is already in progress. Please wait for it to finish.",
      );
    throw error;
  }
  if (process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV === "1") {
    try {
      await sendJobEvent(id);
    } catch {
      console.warn("job_dispatch_deferred", { id });
    }
  }
  return id;
}
type Job = {
  id: string;
  user_id: string;
  trip_id: string | null;
  kind: string;
  payload: unknown;
  lock_token: string;
  attempts: number;
};
export type JobServices = {
  ai: AIService;
  search: typeof searchTravel;
  monitor: typeof monitorTrip;
};
export type StepRunner = <T>(name: string, fn: () => Promise<T>) => Promise<T>;
const direct: StepRunner = async (_name, fn) => fn();
export async function runNextJob(
  services: JobServices = {
    ai: new StructuredAIService(),
    search: searchTravel,
    monitor: monitorTrip,
  },
) {
  const job = await transaction(async (c) => {
    // Recover a crashed worker; leases are refreshed while work is active.
    await c.query(
      "UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error='The worker stopped unexpectedly. Please retry.',lock_token=NULL WHERE status='running' AND locked_at < now()-interval '5 minutes'",
    );
    const r = await c.query(
      "SELECT * FROM jobs WHERE status='queued' AND run_after<=now() ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    if (!r.rows[0]) return null;
    const token = randomUUID();
    await c.query(
      "UPDATE jobs SET status='running',attempts=attempts+1,locked_at=now(),lock_token=$2,updated_at=now() WHERE id=$1",
      [r.rows[0].id, token],
    );
    return { ...r.rows[0], lock_token: token } as Job;
  });
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void db()
      .query(
        "UPDATE jobs SET locked_at=now() WHERE id=$1 AND lock_token=$2 AND status='running'",
        [job.id, job.lock_token],
      )
      .catch(() => {});
  }, 30000);
  try {
    const result = await execute(job, services);
    await db().query(
      "UPDATE jobs SET status='completed',result=$3,error=NULL,updated_at=now() WHERE id=$1 AND lock_token=$2 AND status='running'",
      [job.id, job.lock_token, JSON.stringify(result)],
    );
  } catch (error) {
    // Do not persist raw provider errors or credentials.
    const message =
      error instanceof AppError
        ? error.message
        : "The request couldn't be completed. Please try again.";
    await db().query(
      "UPDATE jobs SET status='failed',error=$3,updated_at=now() WHERE id=$1 AND lock_token=$2 AND status='running'",
      [job.id, job.lock_token, message],
    );
    console.error("job_failed", {
      id: job.id,
      kind: job.kind,
      category: error instanceof AppError ? error.status : "internal",
    });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
async function execute(
  job: Job,
  services: JobServices,
  step: StepRunner = direct,
) {
  const ai = services.ai;
  const lease = { id: job.id, token: job.lock_token };
  if (job.kind === "generate") {
    const request = TripRequest.parse(job.payload);
    const preferences = await step("load-preferences", () =>
      getPreferences(job.user_id),
    );
    const windows = await step("select-date-candidates", () =>
      ai.selectWindows(request),
    );
    // Keep provider concurrency and cost bounded: at most three candidates, one at a time.
    const candidates = [];
    const failures: string[] = [];
    for (const [index, window] of windows.entries()) {
      const found = await step(`search-candidate-${index}`, async () => {
        try {
          return {
            result: await services.search(request, window),
            error: null,
          };
        } catch (error) {
          if (error instanceof AppError)
            return { result: null, error: error.message };
          throw error;
        }
      });
      if (found.result) candidates.push(found.result);
      else failures.push(found.error!);
    }
    if (!candidates.length)
      throw new AppError(
        422,
        failures[0] ?? "No complete travel options were found.",
      );
    const best = candidates[0];
    const plan = await step("generate-validated-itinerary", () =>
      ai.generateItinerary(request, preferences, best),
    );
    const warnings = [
      ...best.warnings,
      `Found sources for ${candidates.length} destination/date option(s). Selected the first viable candidate; search results cannot establish the cheapest dates.`,
      ...(failures.length
        ? [`${failures.length} candidate search(es) were unavailable.`]
        : []),
    ];
    return {
      tripId: await step("persist-trip", () =>
        createTrip(job.user_id, request, plan, best.offers, warnings, lease),
      ),
    };
  }
  if (job.kind === "modify") {
    const payload = z
      .object({ text: z.string().min(1).max(2000), version: z.number().int() })
      .parse(job.payload);
    const trip = await step("load-trip", () =>
      getTrip(job.user_id, job.trip_id!),
    );
    if (trip.version !== payload.version)
      throw new AppError(
        409,
        "Your trip changed before this edit started. Please submit it again.",
      );
    const destination = trip.request.destinations.find(
      (d) => d.name === trip.plan.destination,
    )!;
    const search = await step("refresh-sources", () =>
      services.search(trip.request, {
        destination,
        start: trip.plan.days[0].date,
        end: trip.plan.days.at(-1)!.date,
      }),
    );
    const offers = [
      ...new Map(
        [...trip.offers, ...search.offers].map((o) => [o.id, o]),
      ).values(),
    ];
    const proposal = await step("propose-changes", () =>
      ai.modifyItinerary(trip, payload.text, offers),
    );
    const plan = applyMutation(trip, proposal, offers);
    const version = await step("persist-version", () =>
      savePlan(
        job.user_id,
        trip.id,
        plan,
        payload.version,
        proposal.explanation,
        search.offers,
        lease,
      ),
    );
    return { tripId: trip.id, version, explanation: proposal.explanation };
  }
  if (job.kind === "monitor") {
    await step("monitor-trip", async () =>
      services.monitor(await getTrip(job.user_id, job.trip_id!)),
    );
    return { tripId: job.trip_id };
  }
  throw new Error("Unsupported job kind");
}

// Durable steps are used by Inngest; no resident worker is required on Vercel.
export async function runJobWorkflow(
  id: string,
  durableStep: StepRunner,
  services: JobServices = {
    ai: new StructuredAIService(),
    search: searchTravel,
    monitor: monitorTrip,
  },
) {
  const job = await durableStep("claim-job", () =>
    transaction(async (c) => {
      const r = await c.query(
        "SELECT * FROM jobs WHERE id=$1 AND status='queued' AND run_after<=now() FOR UPDATE SKIP LOCKED",
        [id],
      );
      if (!r.rows[0]) return null;
      const token = randomUUID();
      await c.query(
        "UPDATE jobs SET status='running',attempts=attempts+1,locked_at=now(),lock_token=$2,updated_at=now() WHERE id=$1",
        [id, token],
      );
      return { ...r.rows[0], lock_token: token } as Job;
    }),
  );
  if (!job) return { ignored: true };
  const step: StepRunner = async (name, fn) => {
    const outcome = await durableStep(name, async () => {
      const owned = await db().query(
        "UPDATE jobs SET locked_at=now() WHERE id=$1 AND lock_token=$2 AND status='running' RETURNING id",
        [job.id, job.lock_token],
      );
      if (!owned.rowCount)
        return {
          ok: false as const,
          status: 409,
          message: "This request was already completed or recovered.",
        };
      try {
        return { ok: true as const, value: await fn() };
      } catch (error) {
        return {
          ok: false as const,
          status: error instanceof AppError ? error.status : 500,
          message:
            error instanceof AppError
              ? error.message
              : "The request couldn't be completed. Please try again.",
        };
      }
    });
    if (!outcome.ok) throw new AppError(outcome.status, outcome.message);
    return outcome.value;
  };
  try {
    const result = await execute(job, services, step);
    await durableStep("finish-job", async () => {
      await db().query(
        "UPDATE jobs SET status='completed',result=$3,error=NULL,updated_at=now() WHERE id=$1 AND lock_token=$2 AND status='running'",
        [id, job.lock_token, JSON.stringify(result)],
      );
      return true;
    });
    return result;
  } catch (error) {
    // Let Inngest's internal control flow propagate. Only application failures become job errors.
    if (!(error instanceof AppError)) throw error;
    await durableStep("record-failure", async () => {
      await db().query(
        "UPDATE jobs SET status='failed',error=$3,updated_at=now() WHERE id=$1 AND lock_token=$2 AND status='running'",
        [id, job.lock_token, error.message],
      );
      return true;
    });
    return { failed: true };
  }
}
