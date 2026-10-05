CREATE TABLE users (
  id uuid PRIMARY KEY, google_sub text NOT NULL UNIQUE, email text NOT NULL,
  name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE travel_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trip_requests (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trips (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES trip_requests(id), title text NOT NULL,
  destination text NOT NULL, summary text NOT NULL, currency text NOT NULL,
  version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED')),
  warnings jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trips_owner ON trips(user_id, created_at DESC);
CREATE TABLE provider_offers (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  data jsonb NOT NULL, fetched_at timestamptz NOT NULL
);
CREATE TABLE trip_days (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date date NOT NULL, title text NOT NULL, UNIQUE(trip_id,date)
);
CREATE TABLE itinerary_items (
  id uuid PRIMARY KEY, day_id uuid NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
  position integer NOT NULL, data jsonb NOT NULL
);
CREATE TABLE bookings (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id uuid NOT NULL UNIQUE REFERENCES itinerary_items(id),
  status text NOT NULL CHECK(status IN ('UNBOOKED','BOOKING_STARTED','EXTERNAL_BOOKING','PENDING','CONFIRMED','FAILED','CANCELLED')),
  details jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE itinerary_versions (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version integer NOT NULL, plan jsonb NOT NULL, reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trip_id,version)
);
CREATE TABLE share_links (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trip_updates (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trip_id,dedupe_key)
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('generate','modify','monitor')),
  payload jsonb NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  result jsonb, error text, attempts integer NOT NULL DEFAULT 0, run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz, lock_token uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready ON jobs(run_after) WHERE status = 'queued';
CREATE UNIQUE INDEX jobs_trip_mutation ON jobs(trip_id) WHERE kind='modify' AND status IN ('queued','running');
CREATE UNIQUE INDEX jobs_user_generate ON jobs(user_id) WHERE kind='generate' AND status IN ('queued','running');
CREATE TABLE rate_limits (key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL);
