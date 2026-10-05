import { serve } from "inngest/next";
import { inngest } from "@/lib/server/inngest";
import { executeJob, dispatchDueJobs } from "@/lib/server/workflows";
export const runtime = "nodejs";
export const maxDuration = 300;
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executeJob, dispatchDueJobs],
});
