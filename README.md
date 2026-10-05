# Happy Planner

A Next.js 15 travel-planning application with persistent itineraries, Supabase email-link authentication, conversational edits, version history, external booking assistance, private confirmations, revocable read-only sharing and scheduled weather updates.

**The application uses real service integrations. There is no production mock mode.** SearXNG provides discovery results with no verified price. Optional Amadeus production credentials add dated flight and hotel quotes. OpenAI generates structured plans; Gemini is an optional fallback. All generated plans and edits pass Zod and application-level timing, budget, source and booking checks before persistence.

## Start locally

Requirements: Node 22 or 24, npm, Docker Compose, and accounts/keys described in [Activation](docs/activation.md).

```sh
npm ci
npm run setup:local
docker compose --env-file .env.local -f compose.yaml -f .local/compose.cloud.json up -d --wait
npm run db:migrate
npm run dev
```

`setup:local` preserves existing non-empty settings, creates a random SearXNG secret, and configures the platform's trusted proxy certificate when present. It does not invent external credentials. The landing page works before credentials are configured; authentication and planning clearly report unavailable services.

Configure Supabase, at least one AI provider, and Inngest in `.env.local` before using the complete planning flow. Start an Inngest development server pointing to `/api/inngest`, with `INNGEST_DEV=1` in the Next.js process. See [local workflow instructions](docs/activation.md#inngest).

SearXNG and PostgreSQL data can persist across application restarts. Active web servers and workflow runners do not survive environment snapshots and must be restarted. Use the existing checkout; cloud tasks are already isolated and do not need Git worktrees.

## What the product does

- Optional, editable preferences; fixed/flexible dates; up to three candidate destinations; adult traveler counts and a party-wide budget.
- Flight, hotel, activity and event discovery through a private SearXNG instance. Optional Amadeus production flight and hotel offers are kept behind the same adapter.
- Structured days and timeline items, explicit estimates versus quotes, source timestamps, map links, provider references and deterministic validation.
- Targeted natural-language edits, source refresh, immutable versions and restoration. Active booking items cannot be silently changed.
- Itinerary approval, an external booking checklist, private confirmation numbers/emails/paid prices, and manual booking status. No payments are processed.
- Opaque, hashed, expiring share tokens; regeneration and revocation; public projections exclude private notes and confirmations.
- Durable Inngest steps, a database job outbox, scheduled checks 30/14/7/3/1 days before departure, weather and packing suggestions within the real forecast window.

## Deliberate limits

- SearXNG is a web-search service, not travel inventory. Search result prices are never promoted to verified quotes. Search engines can block requests; the adapter reports unavailable sources honestly.
- Amadeus Self-Service search does not supply consumer checkout links for the exact quoted inventory. The booking launcher opens clearly labeled comparison searches and rechecks the Amadeus quote first. Ticket issuance, exact-rate hotel checkout and payment processing require separate provider agreements and booking adapters.
- Amadeus test data is sandbox data, never live inventory. Production builds refuse sandbox quotes. Mock fixtures exist only under `tests/`.
- Flexible dates compare at most three candidate windows; the application does not claim globally cheapest travel dates. Current lodging planning assumes one room and adults only.
- AI suggestions may be wrong. Entry requirements, accessibility details, operating hours, transfers and local conditions need confirmation. Weather is informational, not an official severe-weather alert service. Official closure feeds and email/push trip notifications are not implemented; updates appear in the app.
- Public operation needs configured accounts, SMTP, monitored backups, a privacy/support contact, and suitable commercial service plans. This PR does not publish a production deployment or create those accounts.

## Validation

```sh
npm run typecheck
npm test
docker compose -f compose.test.yaml up -d --wait
DATABASE_URL=postgresql://planner:planner_test_only@127.0.0.1:5433/happy_planner_test npm run db:migrate
DATABASE_URL=postgresql://planner:planner_test_only@127.0.0.1:5433/happy_planner_test npm run test:integration
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run check:services -- --search-only --full-search
```

Browser tests use a disposable PostgreSQL database, actual Supabase GoTrue, Mailpit, and the production Next.js build. They exercise the real email-link exchange without an authentication bypass. AI/provider response fixtures are restricted to unit/integration tests. Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to select an already installed trusted Chromium when browser downloads are unavailable.

`check:services` makes real network requests and reports configuration versus verified responses separately. Without AI/auth/workflow keys it intentionally exits nonzero. `--full-search` can consume Amadeus API quota when those credentials are configured. No script prints credentials.

See [architecture](docs/architecture.md), [stack decisions](docs/stack-decisions.md), [activation](docs/activation.md), and [operations](docs/operations.md).
