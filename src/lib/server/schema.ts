import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  BookingDetails,
  Item,
  Offer,
  Plan,
  Preferences,
  TripRequest,
} from "../domain";
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  authSubject: text("auth_subject").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  createdAt: created(),
});
export const preferences = pgTable("travel_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Preferences>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const requests = pgTable("trip_requests", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<TripRequest>().notNull(),
  createdAt: created(),
});
export const trips = pgTable("trips", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id),
  title: text("title").notNull(),
  destination: text("destination").notNull(),
  summary: text("summary").notNull(),
  currency: text("currency").notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").default("DRAFT").notNull(),
  warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const offers = pgTable("provider_offers", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Offer>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});
export const days = pgTable(
  "trip_days",
  {
    id: uuid("id").primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    title: text("title").notNull(),
  },
  (t) => [uniqueIndex("trip_days_trip_id_date_key").on(t.tripId, t.date)],
);
export const items = pgTable("itinerary_items", {
  id: uuid("id").primaryKey(),
  dayId: uuid("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  data: jsonb("data").$type<Item>().notNull(),
});
export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .unique()
    .references(() => items.id),
  status: text("status").notNull(),
  details: jsonb("details").$type<BookingDetails>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const versions = pgTable(
  "itinerary_versions",
  {
    id: uuid("id").primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    plan: jsonb("plan").$type<Plan>().notNull(),
    reason: text("reason").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("itinerary_versions_trip_id_version_key").on(
      t.tripId,
      t.version,
    ),
  ],
);
export const shares = pgTable("share_links", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .unique()
    .references(() => trips.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});
export const updates = pgTable(
  "trip_updates",
  {
    id: uuid("id").primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    data: jsonb("data").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("trip_updates_trip_id_dedupe_key_key").on(
      t.tripId,
      t.dedupeKey,
    ),
  ],
);
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  tripId: uuid("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").default("queued").notNull(),
  result: jsonb("result"),
  error: text("error"),
  attempts: integer("attempts").default(0).notNull(),
  runAfter: timestamp("run_after", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockToken: uuid("lock_token"),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const limits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
