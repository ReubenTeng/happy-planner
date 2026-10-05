# Activate the services

This repository includes the implementation and local tests, not accounts in your name. Enter credentials in `.env.local` for development or in encrypted deployment/environment settings. Never send keys in chat, commit populated environment files, or expose database/service credentials through `NEXT_PUBLIC_*` variables.

## Required for the complete planning flow

| Service     | What to create                                                            | Application variables                                                        |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Supabase    | A project, PostgreSQL connection, and Auth email delivery                 | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`                   |
| OpenAI      | API key with an available API billing/quota allowance                     | `PLANNER_AI_API_KEY`; optional `PLANNER_AI_MODEL`                            |
| Inngest     | An application connected to the deployed `/api/inngest` endpoint          | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`                                   |
| SearXNG     | The included private local service, or a separately hosted HTTPS instance | `SEARCH_BASE_URL`, `SEARXNG_SECRET`; `SEARCH_API_KEY` for the hosted gateway |
| Application | The canonical HTTPS application URL and operator contact                  | `APP_URL`, `OPERATOR_NAME`, `SUPPORT_EMAIL`                                  |

Gemini can serve as the configured AI provider when OpenAI is absent, or as fallback. At least one AI key is required. SearXNG does not require paid search credentials. Google OAuth and SerpAPI keys are not used. Earlier cloud configuration drafts may still list those obsolete requirements; they can be removed in environment settings. The final `.env.example` is the source of truth.

### Supabase

1. Create a project and copy its project URL and publishable (or legacy anon) key. The application does not need the service-role key.
2. Configure Auth's Site URL and allow the exact callback `${APP_URL}/auth/callback`. Configure a custom SMTP provider for email-link sign-in beyond Supabase's restricted development mail service. Verify a real delivered email and callback before inviting users.
3. Set `DATABASE_URL` to the Supavisor pooler connection string for serverless execution. Use TLS hostname/certificate verification, e.g. `sslmode=verify-full`, with the provider's documented CA if needed. Never disable verification.
4. Run `npm run db:migrate` using a migration-capable PostgreSQL role. A direct/session-pooled connection can be supplied through `DIRECT_DATABASE_URL` for migration execution.
5. Application tables have RLS enabled without public-client policies. Browser access to tables is intentionally denied; the server checks verified ownership. Do not add broad anonymous or authenticated policies to make direct browser queries work.

The local test stack is a disposable GoTrue/PostgreSQL/Mailpit setup, with explicitly test-only credentials. It is not a production Supabase deployment.

### OpenAI and Gemini

Set `PLANNER_AI_API_KEY` to your OpenAI API key. The default model is `gpt-4.1-mini`; change `PLANNER_AI_MODEL` to another compatible model if required. Optionally set `GEMINI_API_KEY` and `GEMINI_MODEL` (default `gemini-2.5-flash`). Both paths request structured JSON and validate it with the same runtime schema.

The application sends preferences, trip constraints and relevant itinerary/source data to the selected AI provider. Booking confirmation numbers and booking email are excluded from the editing payload. Configure quotas and privacy/data-retention policies in both AI accounts. Model and free-tier availability depend on region/account and can change.

### Inngest

For a hosted deployment, create an Inngest app, configure its event/signing keys, and sync `${APP_URL}/api/inngest`. The SDK verifies signed requests. The route permits up to 300 seconds per step; ensure the selected hosting plan supports this, or lower model timeouts before using a shorter limit.

For local development, set `INNGEST_DEV=1` in `.env.local`, restart Next.js, and run the Inngest dev server:

```sh
docker run --rm --name happy-planner-inngest --network host \
  -e NO_PROXY=localhost,127.0.0.1 \
  inngest/inngest@sha256:b251da91bd014d56816c3159c606f470d6e423be9a12fbed45808636160aa92c \
  inngest dev -u http://127.0.0.1:3000/api/inngest --no-discovery
```

`--network host` is for Linux development. On Docker Desktop use its supported host-access configuration. Verify both functions register: `execute-planning-job` and `dispatch-due-planning-jobs`.

Each generation/edit is persisted before event dispatch. A five-minute scheduled dispatcher recovers pending delivery and due monitoring jobs. Long operations use separate durable steps. Failed application validation is shown to the user, not retried forever. Expired workers are fenced and recovered at most three times.

### SearXNG

Local SearXNG binds to loopback only. For Vercel, host it separately on a persistent machine; it cannot run as a Vercel function. `deploy/compose.search.yaml` includes a Caddy HTTPS gateway authenticated with a random `SEARCH_API_KEY`. Set `SEARCH_HOSTNAME` to a domain pointing at that machine and configure `SEARCH_BASE_URL=https://that-host/` in the app.

Never expose an unauthenticated public search endpoint. Keep the backend service on its private Docker network. A hosted public SearXNG instance is not a dependable production API and may disable JSON access.

Google, Bing and DuckDuckGo are enabled. Some engines may return access denial or CAPTCHA; successful results from the remaining engines are still usable. Prices in snippets are not live quotes and are not extracted as such.

## Optional Amadeus production quotes

Create an [Amadeus Self-Service](https://developers.amadeus.com/) account and set `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` and `AMADEUS_ENV=production` after obtaining production access. Flight Offers Search/Pricing, Location Search, Hotel List and Hotel Offers are used. Inspect available inventory, API-specific access and charges in your account.

`AMADEUS_ENV=test` is allowed only outside production, marks sources as sandbox, removes purported live prices, and refuses booking. Test allowance is not production quota. Production quote validation and booking comparisons remain unverified until production credentials are supplied and the real checks run.

Amadeus search quotes are not direct consumer checkout links. The current launcher revalidates a quote, then opens a clearly labeled comparison search. To sell the exact inventory or issue tickets, obtain the necessary commercial agreements and implement the booking service separately.

## Weather and public operation

The free Open-Meteo endpoint is intended for eligible non-commercial use. For commercial operation configure the appropriate subscription with `WEATHER_COMMERCIAL=true` and `WEATHER_API_KEY`. Respect the geocoding service's separate usage terms as well. Weather attribution is included in the UI.

Set the operator's real `OPERATOR_NAME` and working `SUPPORT_EMAIL`, review the included privacy/travel-information copy, configure backups and error monitoring, and confirm hosting eligibility. Vercel Hobby is not a promise of free commercial hosting. Provider quotas are not hardcoded as entitlements.

## Verify activation

Run `npm run check:services` and `npm run check:services -- --full-search`. Then use an actual account to complete preferences → trip request → generation → edit → approval → provider review → manual confirmation → sharing/revocation. Trigger a weather check and confirm the Inngest job completes. These are required before calling a public deployment ready.
