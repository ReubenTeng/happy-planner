# Operations

## Deploy

1. Provision Supabase, email delivery, the selected AI account(s), Inngest and private SearXNG. Add the settings from `.env.example` through encrypted deployment settings.
2. Run migrations once with a migration-capable database connection. Never run schema `push` or unreviewed SQL against a populated database.
3. Deploy the Next.js app with `npm ci` and `npm run build`; Vercel can use the standard Next.js adapter. Configure the canonical `APP_URL` and exact Supabase callback.
4. Sync Inngest functions, configure private SearXNG HTTPS access, and run real activation checks before inviting users. Set the operator/support fields and review terms for your actual jurisdiction and business.

No production deployment is performed by this repository's setup scripts. Keys, accounts, SMTP reputation, a DNS name and a hosting subscription cannot be created by committing application code.

## Database

Use managed backups/PITR appropriate to the chosen Supabase plan; free tiers may not supply the recovery guarantees your product needs. Test restoration to an isolated database. Keep all migration files immutable after application; checksum mismatches stop deployment.

The server role must be able to access application tables, while anonymous/authenticated Data API roles remain protected by RLS. The migration runner enables RLS without browser policies. Do not expose the direct database URL or any service-role key to client bundles.

Private booking details are stored in PostgreSQL and excluded from shared views. Use provider-managed encryption at rest, restrict administrator access and define a retention/export/deletion process for your users. Deleting local booking records never cancels external reservations.

## Jobs and limits

- Per account: 10 planning requests/day, 30 edits/day, 30 provider launches/hour, 4 manual monitoring checks/day, and 100 writes/hour. Email-link requests are bounded by hashed address, with Supabase's own provider limits in addition.
- Inngest executes up to three workflows concurrently. Long phases are separate durable steps. One active generation per user and one active edit per trip are enforced in PostgreSQL.
- The dispatcher runs every five minutes. Requests whose event delivery failed remain queued. Jobs abandoned for 30 minutes are recovered up to three attempts; output writes are fenced by lease token.
- Application/domain failures are persisted with a safe message. Requests can be resubmitted after correcting the cause. Do not automatically replay real provider purchases; no purchase API is implemented here.
- Inspect queued/failed job counts, age of the oldest pending job, auth/email failures, provider rate limits and database capacity. Logs intentionally contain job IDs and error categories rather than requests, keys or confirmation details.

## Search operations

Keep the search service private. With the provided Caddy gateway, only authenticated HTTPS requests are forwarded. Restart/update the pinned SearXNG image deliberately and verify JSON access and a real travel query afterward. Engine access denial/CAPTCHA is not equivalent to an empty travel inventory. Source refresh errors stop the corresponding booking launch.

SearXNG result snippets are unverified. The app never promotes snippet prices to a quote. Amadeus search and pricing calls consume quota; test and production credentials are distinct. Exact-inventory sales require additional contracts/integration.

## Cloud setup notes

Run `npm run setup:local` before Compose. In the Codex environment it mounts the platform's trusted CA into SearXNG and uses the normal certificate-verification path. No checksum, certificate or signature verification is disabled.

Local service traffic must stay local: the test gateway excludes its Docker `auth` hostname from the external proxy via `NO_PROXY`. External search requests still use the environment's managed network path.

The public app and its credentials are separate from the disposable test stack. `compose.test.yaml` uses loopback ports, a tmpfs database, actual GoTrue and Mailpit, and explicitly test-only credentials. Its data is disposable; never point production at it.

## Validation boundaries

Unit tests use provider/AI contract fixtures; database tests use isolated PostgreSQL; browser tests use actual local email-link authentication. Those passing tests do not establish live OpenAI, Gemini, Amadeus production, hosted Supabase/SMTP or hosted Inngest readiness. Complete the checks in `activation.md` after supplying real credentials.
