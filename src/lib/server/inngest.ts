import { Inngest } from "inngest";
import { AppError } from "./errors";
export const inngest = new Inngest({
  id: "happy-planner",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
export function requireWorkflow() {
  if (
    process.env.INNGEST_DEV !== "1" &&
    (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY)
  )
    throw new AppError(
      503,
      "Trip planning is temporarily unavailable while background processing is configured.",
    );
}
export async function sendJobEvent(id: string, attempt = 0) {
  await inngest.send({
    id: `${id}:${attempt}`,
    name: "planner/job.requested",
    data: { jobId: id },
  });
}
