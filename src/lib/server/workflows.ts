import { z } from "zod";
import { inngest } from "./inngest";
import { db } from "./db";
import { runJobWorkflow, type StepRunner } from "./jobs";
export const executeJob = inngest.createFunction(
  {
    id: "execute-planning-job",
    triggers: [{ event: "planner/job.requested" }],
    retries: 2,
    concurrency: { limit: 3 },
  },
  async ({ event, step }) => {
    const id = z.string().uuid().parse(event.data.jobId);
    const runner: StepRunner = (name, fn) =>
      step.run(name, fn) as ReturnType<typeof fn>;
    return runJobWorkflow(id, runner);
  },
);
export const dispatchDueJobs = inngest.createFunction(
  {
    id: "dispatch-due-planning-jobs",
    triggers: [{ cron: "*/5 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const jobs = await step.run("due-jobs", async () => {
      await db().query(
        "UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error='Processing was interrupted; the request has been recovered.',lock_token=NULL WHERE status='running' AND locked_at<now()-interval '30 minutes'",
      );
      await db().query(
        "DELETE FROM rate_limits WHERE reset_at<now()-interval '1 day'",
      );
      const result = await db().query(
        "SELECT id,attempts FROM jobs WHERE status='queued' AND run_after<=now() ORDER BY run_after LIMIT 25",
      );
      return result.rows as { id: string; attempts: number }[];
    });
    if (jobs.length)
      await step.sendEvent(
        "dispatch",
        jobs.map((j) => ({
          id: `${j.id}:${j.attempts}`,
          name: "planner/job.requested",
          data: { jobId: j.id },
        })),
      );
    return { dispatched: jobs.length };
  },
);
