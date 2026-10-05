import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { z } from "zod";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import { db } from "../src/lib/server/db";
import { webSearch } from "../src/lib/providers/searxng";
import { searchTravel } from "../src/lib/providers";
import { addDays, type TripRequest } from "../src/lib/domain";

const searchOnly = process.argv.includes("--search-only");
let failed = false;
async function check(name: string, fn: () => Promise<string>) {
  try {
    console.log(`${name}: ${await fn()}`);
  } catch {
    console.log(
      `${name}: FAILED (check configuration or service access; credentials are never logged)`,
    );
    failed = true;
  }
}
await check("SearXNG", async () => {
  const r = await webSearch("Tokyo hotels site:booking.com");
  if (!r.results.length) throw new Error("No results");
  return `${r.results.length} live discovery results; ${r.unresponsive_engines?.length ?? 0} engines unavailable`;
});
if (!searchOnly) {
  await check("PostgreSQL", async () => {
    await db().query("SELECT 1 FROM schema_migrations LIMIT 1");
    return "connected; migrations table present";
  });
  await check("Supabase Auth", async () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY)
      throw new Error("Missing configuration");
    const response = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error("Unavailable");
    return "settings endpoint reachable; verify email delivery and sign-in separately";
  });
  if (process.env.PLANNER_AI_API_KEY)
    await check("OpenAI", async () => {
      const client = new OpenAI({
        apiKey: process.env.PLANNER_AI_API_KEY,
        timeout: 30000,
        maxRetries: 0,
      });
      const response = await client.chat.completions.parse({
        model: process.env.PLANNER_AI_MODEL || "gpt-4.1-mini",
        messages: [{ role: "user", content: "Respond with status ready." }],
        response_format: zodResponseFormat(
          z.object({ status: z.literal("ready") }),
          "readiness",
        ),
      });
      if (response.choices[0]?.message.parsed?.status !== "ready")
        throw new Error("Invalid response");
      return "authenticated structured response verified";
    });
  else console.log("OpenAI: not configured");
  if (process.env.GEMINI_API_KEY)
    await check("Gemini", async () => {
      const client = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { timeout: 30000 },
      });
      const response = await client.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: 'Respond with JSON: {"status":"ready"}',
        config: { responseMimeType: "application/json" },
      });
      z.object({ status: z.literal("ready") }).parse(
        JSON.parse(response.text ?? "null"),
      );
      return "authenticated response verified";
    });
  else console.log("Gemini: not configured (optional fallback)");
  if (!process.env.PLANNER_AI_API_KEY && !process.env.GEMINI_API_KEY)
    failed = true;
  console.log(
    `Amadeus: ${process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET ? "configured; run --full-search to exercise offers" : "not configured (optional live quote provider)"}`,
  );
  console.log(
    `Inngest: ${process.env.INNGEST_DEV === "1" ? "development mode; verify function registration in the local dev server" : process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY ? "keys present; verify function sync and a completed job in the Inngest dashboard" : "not configured"}`,
  );
  if (
    process.env.INNGEST_DEV !== "1" &&
    (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY)
  )
    failed = true;
}
if (process.argv.includes("--full-search"))
  await check("Travel provider aggregation", async () => {
    const start = addDays(new Date().toISOString().slice(0, 10), 45);
    const end = addDays(start, 4);
    const request: TripRequest = {
      origin: "Singapore",
      originAirport: "SIN",
      destinations: [{ name: "Tokyo", airport: "NRT" }],
      earliestDate: start,
      latestDate: end,
      duration: 5,
      flexible: false,
      dateNotes: "",
      travelers: 1,
      rooms: 1,
      budget: 300000,
      currency: "SGD",
    };
    const result = await searchTravel(request, {
      destination: request.destinations[0],
      start,
      end,
    });
    return `${result.offers.length} sources; ${result.offers.filter((o) => o.price !== null).length} priced offers; no itinerary generation or booking attempted`;
  });
if (!searchOnly) await db().end();
process.exitCode = failed ? 1 : 0;
