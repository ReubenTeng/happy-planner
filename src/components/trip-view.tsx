"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  CloudSun,
  ExternalLink,
  History,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Mountain,
  Plane,
  Share2,
  ShieldCheck,
  Sparkles,
  Utensils,
  BedDouble,
  X,
} from "lucide-react";
import {
  money,
  totalCost,
  type Trip,
  type Item,
  type BookingDetails,
} from "@/lib/domain";
import { api, pollJob } from "./forms";

const icons = {
  transport: Plane,
  accommodation: BedDouble,
  activity: Mountain,
  meal: Utensils,
  "free-time": CloudSun,
};
export function Timeline({
  days,
  currency,
}: {
  days: Trip["plan"]["days"];
  currency: string;
}) {
  return (
    <>
      {days.map((day, index) => (
        <section className="day" id={`day-${index + 1}`} key={day.date}>
          <div className="day-heading">
            <span className="day-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <span className="eyebrow">
                {new Date(day.date + "T12:00:00Z").toLocaleDateString("en", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </span>
              <h2>{day.title}</h2>
            </div>
          </div>
          <div className="timeline">
            {day.items.map((item) => (
              <TimelineItem key={item.id} item={item} currency={currency} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
function TimelineItem({
  item,
  currency,
  replace,
  source,
}: {
  item: Item;
  currency: string;
  replace?: () => void;
  source?: Trip["offers"][number];
}) {
  const Icon = icons[item.type];
  return (
    <article className="timeline-item">
      <div className="timeline-time">
        <span>{item.startTime}</span>
        <small>{item.endTime}</small>
      </div>
      <span className={`timeline-icon ${item.type}`}>
        <Icon size={17} />
      </span>
      <div className="itinerary-card">
        <div className="item-heading">
          <span className="item-type">{item.type.replace("-", " ")}</span>
          <span className="item-price">
            {item.cost ? money(item.cost, currency) : "No planned cost"}
            {item.cost > 0 && (
              <small>
                {item.costKind === "estimate" ? "estimated" : "quoted"}
              </small>
            )}
          </span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className="item-footer">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location.latitude !== null && item.location.longitude !== null ? `${item.location.latitude},${item.location.longitude}` : item.location.name)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin size={13} />
            {item.location.name}
            <ArrowUpRight size={12} />
          </a>
          {replace && (
            <button className="text-button" onClick={replace}>
              Replace <ArrowUpRight size={13} />
            </button>
          )}
        </div>
        {item.notes && <p className="item-note">{item.notes}</p>}
        {source && (
          <div className="source-note">
            Source: {String(source.metadata.domain ?? source.provider)} · Found{" "}
            {new Date(source.fetchedAt).toLocaleDateString()} ·{" "}
            {source.price === null
              ? "Price and availability unverified"
              : "Price may change"}
          </div>
        )}
      </div>
    </article>
  );
}
type Versions = { version: number; reason: string; created_at: string }[];
export default function TripView({ initial }: { initial: Trip }) {
  const [trip, setTrip] = useState(initial);
  const [tab, setTab] = useState("itinerary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [edit, setEdit] = useState("");
  const [versions, setVersions] = useState<Versions | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [bookingItem, setBookingItem] = useState<string | null>(null);
  const [providerLink, setProviderLink] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const total = totalCost(trip.plan);
  const booked = trip.bookings.filter((b) => b.status === "CONFIRMED").length;
  const bookable = trip.plan.days
    .flatMap((d) => d.items)
    .filter((i) => i.offerId);
  async function refresh() {
    setTrip(await api<Trip>(`trips/${trip.id}`));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editTrip(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const { jobId } = await api<{ jobId: string }>(`trips/${trip.id}/edit`, {
        text: edit,
        version: trip.version,
      });
      const result = await pollJob(jobId);
      await refresh();
      setEdit("");
      setProviderLink(null);
      setMessage(
        result.explanation ??
          "Your journey has been updated. Review and approve the changes before booking.",
      );
    });
  }
  async function confirmation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const details: BookingDetails = {
      confirmationNumber: String(data.get("confirmationNumber")),
      email: String(data.get("email")),
      paidPrice: data.get("paidPrice")
        ? Math.round(Number(data.get("paidPrice")) * 100)
        : null,
      notes: String(data.get("notes")),
    };
    await run(async () => {
      await api(`trips/${trip.id}/booking`, {
        itemId: bookingItem,
        action: "confirm",
        details,
        version: trip.version,
      });
      await refresh();
      setBookingItem(null);
      setMessage("Booking details saved privately.");
    });
  }
  return (
    <section className="shell trip-page">
      <Link href="/trips" className="back-link">
        <ArrowLeft size={15} /> All journeys
      </Link>
      <div className="journey-heading">
        <div>
          <span className="eyebrow">
            YOUR NEXT CHAPTER · {trip.plan.destination.toUpperCase()}
          </span>
          <h1>{trip.plan.title}</h1>
          <div className="trip-meta">
            <span>
              <CalendarDays size={15} />
              {trip.plan.days[0].date} — {trip.plan.days.at(-1)!.date}
            </span>
            <span>
              {trip.request.travelers} traveler
              {trip.request.travelers > 1 ? "s" : ""}
            </span>
            <span className="pill">
              {trip.status === "APPROVED" ? "Approved" : "Your evolving plan"}
            </span>
          </div>
        </div>
        <div className="heading-actions">
          <button
            className="button outline small"
            onClick={() =>
              void run(async () =>
                setVersions(await api(`trips/${trip.id}/versions`)),
              )
            }
            disabled={busy}
          >
            <History size={16} /> History
          </button>
          <button
            className="button outline small"
            onClick={() => setShareOpen(true)}
            disabled={busy}
          >
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>
      <p className="trip-summary">{trip.plan.summary}</p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
      <div className="trip-layout">
        <div className="trip-main">
          <div className="tabs" role="tablist" aria-label="Trip sections">
            {[
              { value: "itinerary", title: "Your itinerary", icon: MapPin },
              {
                value: "bookings",
                title: "Booking checklist",
                icon: CheckCheck,
              },
              { value: "updates", title: "Trip updates", icon: CloudSun },
            ].map((t) => (
              <button
                role="tab"
                id={`tab-${t.value}`}
                aria-controls={`panel-${t.value}`}
                aria-selected={tab === t.value}
                key={t.value}
                onClick={() => setTab(t.value)}
              >
                <t.icon size={16} />
                {t.title}
                {t.value === "updates" && trip.updates.length > 0 && (
                  <span className="count">{trip.updates.length}</span>
                )}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "itinerary" && (
              <>
                <div className="day-links">
                  {trip.plan.days.map((d, i) => (
                    <a key={d.date} href={`#day-${i + 1}`}>
                      Day {i + 1}
                    </a>
                  ))}
                </div>
                {trip.plan.days.map((day, index) => (
                  <section
                    className="day"
                    id={`day-${index + 1}`}
                    key={day.date}
                  >
                    <div className="day-heading">
                      <span className="day-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <span className="eyebrow">
                          {new Date(day.date + "T12:00:00Z").toLocaleDateString(
                            "en",
                            {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            },
                          )}
                        </span>
                        <h2>{day.title}</h2>
                      </div>
                    </div>
                    <div className="timeline">
                      {day.items.map((item) => (
                        <TimelineItem
                          key={item.id}
                          item={item}
                          currency={trip.plan.currency}
                          source={trip.offers.find(
                            (o) => o.id === item.offerId,
                          )}
                          replace={() => {
                            setEdit(
                              `Replace "${item.title}" on ${day.date} with a suitable alternative.`,
                            );
                            document.getElementById("edit-trip")?.focus();
                            document
                              .getElementById("edit-trip")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                        />
                      ))}
                    </div>
                  </section>
                ))}
                <form className="edit-panel" onSubmit={editTrip}>
                  <div className="edit-heading">
                    <span className="round-icon">
                      <Sparkles size={21} />
                    </span>
                    <div>
                      <h3>A little more you?</h3>
                      <p>
                        Make a change. We’ll keep the rest of your journey in
                        place.
                      </p>
                    </div>
                  </div>
                  <div className="edit-suggestions">
                    {[
                      "Give me more nature",
                      "Make this trip less rushed",
                      "Give me one free afternoon",
                    ].map((t) => (
                      <button
                        type="button"
                        key={t}
                        className="choice"
                        onClick={() => setEdit(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <label className="sr-only" htmlFor="edit-trip">
                    Change your itinerary
                  </label>
                  <textarea
                    id="edit-trip"
                    value={edit}
                    onChange={(e) => setEdit(e.target.value)}
                    required
                    maxLength={2000}
                    placeholder="I’d love more local food and a quieter afternoon…"
                  />
                  <div className="form-actions">
                    <small>
                      <History size={13} /> Every version is saved. You can
                      always go back.
                    </small>
                    <button className="button" disabled={busy}>
                      {busy ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <Sparkles size={17} />
                      )}
                      Update my journey
                    </button>
                  </div>
                </form>
              </>
            )}
            {tab === "bookings" && (
              <div className="booking-section">
                <h2>From plan to packed.</h2>
                <p>
                  Check current dates, prices and availability with each
                  provider. Mark a booking confirmed after completing it on
                  their site.
                </p>
                {trip.status !== "APPROVED" && (
                  <p className="notice">
                    Review and approve your itinerary to enable booking.
                  </p>
                )}
                <div className="progress">
                  <span
                    style={{
                      width: `${bookable.length ? (booked / bookable.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <small>
                  {booked} of {bookable.length} items marked booked
                </small>
                {bookable.map((item) => {
                  const offer = trip.offers.find((o) => o.id === item.offerId)!;
                  const booking = trip.bookings.find(
                    (b) => b.itemId === item.id,
                  );
                  const confirmed = booking?.status === "CONFIRMED";
                  return (
                    <article key={item.id} className="booking-card">
                      <div className="booking-title">
                        <span
                          className={`booking-check ${confirmed ? "done" : ""}`}
                        >
                          {confirmed ? (
                            <Check size={19} />
                          ) : (
                            <ExternalLink size={18} />
                          )}
                        </span>
                        <div>
                          <h3>{item.title}</h3>
                          <small>
                            {String(offer.metadata.domain ?? offer.provider)} ·{" "}
                            {money(item.cost, trip.plan.currency)}{" "}
                            {item.costKind === "estimate"
                              ? "estimated"
                              : "quoted"}
                          </small>
                        </div>
                        <span className="pill">
                          {confirmed
                            ? "Booked"
                            : booking?.status === "EXTERNAL_BOOKING"
                              ? "Awaiting confirmation"
                              : "To book"}
                        </span>
                      </div>
                      <p className="muted">
                        {offer.bookingLinkKind === "source"
                          ? "Provider page found through web search. Enter your exact dates and traveler details on the provider’s site."
                          : offer.bookingLinkKind === "search"
                            ? "This opens a comparison search. The exact Amadeus quote is not directly bookable here; provider prices and inventory may differ."
                            : "Verify final details with the provider before purchase."}
                      </p>
                      {confirmed && (
                        <dl className="confirmation-details">
                          <div>
                            <dt>Confirmation</dt>
                            <dd>
                              {booking.details.confirmationNumber ||
                                "Not recorded"}
                            </dd>
                          </div>
                          <div>
                            <dt>Paid</dt>
                            <dd>
                              {booking.details.paidPrice === null
                                ? "Not recorded"
                                : money(
                                    booking.details.paidPrice,
                                    trip.plan.currency,
                                  )}
                            </dd>
                          </div>
                          <div>
                            <dt>Email</dt>
                            <dd>{booking.details.email || "Not recorded"}</dd>
                          </div>
                          {booking.details.notes && (
                            <div>
                              <dt>Notes</dt>
                              <dd>{booking.details.notes}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                      <div className="booking-actions">
                        {!confirmed && (
                          <>
                            <button
                              className="button small"
                              disabled={busy || trip.status !== "APPROVED"}
                              onClick={() =>
                                void run(async () => {
                                  const result = await api<{
                                    kind: string;
                                    url: string;
                                  }>(`trips/${trip.id}/booking`, {
                                    itemId: item.id,
                                    action: "launch",
                                    version: trip.version,
                                  });
                                  if (result.kind === "redirect")
                                    setProviderLink({
                                      id: item.id,
                                      url: result.url,
                                    });
                                  await refresh();
                                })
                              }
                            >
                              Review with provider <ArrowUpRight size={14} />
                            </button>
                            <button
                              className="button outline small"
                              disabled={busy || trip.status !== "APPROVED"}
                              onClick={() => setBookingItem(item.id)}
                            >
                              I’ve booked this <Check size={14} />
                            </button>
                          </>
                        )}
                        {booking &&
                          !["UNBOOKED", "CANCELLED", "FAILED"].includes(
                            booking.status,
                          ) && (
                            <button
                              className="text-button"
                              disabled={busy || trip.status !== "APPROVED"}
                              onClick={() =>
                                void run(async () => {
                                  await api(`trips/${trip.id}/booking`, {
                                    itemId: item.id,
                                    action: "clear",
                                    version: trip.version,
                                  });
                                  await refresh();
                                  setMessage(
                                    "Local booking status cleared. Any real reservation must be cancelled directly with the provider.",
                                  );
                                })
                              }
                            >
                              Clear local status
                            </button>
                          )}
                      </div>
                      {providerLink?.id === item.id && (
                        <a
                          className="provider-link"
                          href={providerLink.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Continue to provider <ExternalLink size={15} />
                        </a>
                      )}
                    </article>
                  );
                })}
                <p className="fine-print">
                  Clearing a status here does not cancel a reservation or
                  request a refund. Confirmation details are private and
                  excluded from shared trip pages.
                </p>
              </div>
            )}
            {tab === "updates" && (
              <div className="updates-section">
                <div className="section-heading">
                  <div>
                    <h2>A little heads-up.</h2>
                    <p>
                      Weather and packing notes, as your journey gets closer.
                    </p>
                  </div>
                  <button
                    className="button outline small"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const { jobId } = await api<{ jobId: string }>(
                          `trips/${trip.id}/monitor`,
                          {},
                        );
                        await pollJob(jobId);
                        await refresh();
                        setMessage("Trip information refreshed.");
                      })
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <CloudSun size={16} />
                    )}
                    Check now
                  </button>
                </div>
                {!trip.updates.length && (
                  <div className="empty-state compact">
                    <CloudSun size={38} />
                    <h3>We’ll keep an eye on the forecast.</h3>
                    <p>
                      Checks are scheduled 30, 14, 7, 3 and 1 day before
                      departure.
                      <br />
                      Daily forecasts appear within the available forecast
                      window.
                    </p>
                  </div>
                )}
                {trip.updates.map((update) => (
                  <article
                    className={`update-card ${update.severity}`}
                    key={update.id}
                  >
                    <span className="pill">
                      {update.severity === "warning"
                        ? "Worth a look"
                        : "For your journey"}
                    </span>
                    <h3>{update.title}</h3>
                    <p>{update.message}</p>
                    <p className="suggested-action">{update.suggestedAction}</p>
                    <small>
                      {update.source} ·{" "}
                      {new Date(update.createdAt).toLocaleString()}
                    </small>
                  </article>
                ))}
                <p className="fine-print">
                  Forecasts are not official severe-weather alerts. Always check
                  local authorities for warnings, closures and entry
                  requirements.{" "}
                  <a
                    href="https://open-meteo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Weather data by Open-Meteo.
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
        <aside className="trip-sidebar">
          <div className="budget-card">
            <span className="eyebrow">YOUR JOURNEY AT A GLANCE</span>
            <span className="budget-total">
              {money(total, trip.plan.currency)}
            </span>
            <p>Estimated total · all travelers</p>
            <div className="budget-bar">
              <span
                style={{
                  width: `${Math.min(100, (total / trip.request.budget) * 100)}%`,
                }}
              />
            </div>
            <div className="budget-detail">
              <span>Your budget</span>
              <b>{money(trip.request.budget, trip.plan.currency)}</b>
            </div>
            <div className="budget-detail">
              <span>Room to breathe</span>
              <b>{money(trip.request.budget - total, trip.plan.currency)}</b>
            </div>
            <hr />
            <div className="budget-detail">
              <span>
                <CalendarDays size={15} /> Days away
              </span>
              <b>{trip.plan.days.length}</b>
            </div>
            <div className="budget-detail">
              <span>
                <CheckCheck size={15} /> Bookings confirmed
              </span>
              <b>
                {booked} / {bookable.length}
              </b>
            </div>
            {trip.status === "DRAFT" ? (
              <button
                className="button full"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`trips/${trip.id}/approve`, {
                      version: trip.version,
                    });
                    await refresh();
                    setTab("bookings");
                    setMessage(
                      "Itinerary approved. Check live prices with each provider before booking.",
                    );
                  })
                }
              >
                <Check size={17} />
                Approve this itinerary
              </button>
            ) : (
              <button
                className="button full"
                onClick={() => setTab("bookings")}
              >
                Open booking checklist <ArrowUpRight size={17} />
              </button>
            )}
            <small className="budget-footnote">
              Estimates are a guide, not a price guarantee.
            </small>
          </div>
          <div className="thoughtful-note">
            <ShieldCheck size={21} />
            <h3>A plan with room to change.</h3>
            <p>
              Review every detail before booking. Your itinerary is saved, and
              previous versions are always there.
            </p>
          </div>
          <details className="trip-disclosures">
            <summary>
              About this plan <ChevronDown size={14} />
            </summary>
            {trip.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </details>
        </aside>
      </div>
      {versions && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Itinerary history"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close history"
              onClick={() => setVersions(null)}
            >
              <X />
            </button>
            <History size={25} />
            <h2>Every turn in the journey.</h2>
            <p>
              Restoring creates a new version. Active bookings are protected.
            </p>
            <div className="version-list">
              {versions.map((v) => (
                <div key={v.version}>
                  <div>
                    <b>
                      Version {v.version}
                      {v.version === trip.version ? " · Current" : ""}
                    </b>
                    <p>{v.reason}</p>
                    <small>{new Date(v.created_at).toLocaleString()}</small>
                  </div>
                  <button
                    className="button outline small"
                    disabled={busy || v.version === trip.version}
                    onClick={() =>
                      void run(async () => {
                        await api(`trips/${trip.id}/restore`, {
                          version: trip.version,
                          targetVersion: v.version,
                        });
                        await refresh();
                        setVersions(null);
                        setMessage(
                          "Version restored. Review and approve it before booking.",
                        );
                      })
                    }
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {shareOpen && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Share journey"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close sharing"
              onClick={() => setShareOpen(false)}
            >
              <X />
            </button>
            <Share2 size={25} />
            <h2>Good journeys are worth sharing.</h2>
            <p>
              Anyone with the link can read your itinerary for 90 days. Booking
              confirmations and private notes stay private. Creating a new link
              disables the old one.
            </p>
            {shareUrl && (
              <label>
                Read-only trip link
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{ url: string }>(
                      `trips/${trip.id}/share`,
                      { enabled: true },
                    );
                    setShareUrl(result.url);
                  })
                }
              >
                {shareUrl ? "Regenerate link" : "Create share link"}
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`trips/${trip.id}/share`, { enabled: false });
                    setShareUrl("");
                    setShareOpen(false);
                    setMessage(
                      "Sharing is disabled. Previous links no longer work.",
                    );
                  })
                }
              >
                Disable sharing
              </button>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
      {bookingItem && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save booking confirmation"
            onSubmit={confirmation}
          >
            <button
              type="button"
              className="modal-close icon-button"
              aria-label="Close confirmation"
              onClick={() => setBookingItem(null)}
            >
              <X />
            </button>
            <CheckCheck size={25} />
            <h2>One step closer.</h2>
            <p>
              Only mark this confirmed after completing the booking with the
              provider. These details are optional and private.
            </p>
            <label>
              Confirmation number
              <input name="confirmationNumber" maxLength={150} />
            </label>
            <div className="form-grid">
              <label>
                Booking email
                <input name="email" type="email" />
              </label>
              <label>
                Final paid price ({trip.plan.currency})
                <input name="paidPrice" type="number" step="0.01" min="0" />
              </label>
            </div>
            <label>
              Notes
              <textarea name="notes" maxLength={2000} />
            </label>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="button full" disabled={busy}>
              Save as booked <Check size={16} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
