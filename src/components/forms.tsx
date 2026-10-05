"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { addDays, daysBetween, type Preferences } from "@/lib/domain";

export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Something went wrong. Please try again.");
  return result as T;
}
export async function pollJob(id: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (signal?.aborted) throw new Error("Request cancelled.");
    const job = await api<{
      status: string;
      error?: string;
      result?: { tripId: string; explanation?: string };
    }>(`jobs/${id}`);
    if (job.status === "completed") return job.result!;
    if (job.status === "failed")
      throw new Error(job.error ?? "We couldn't finish this request.");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "Planning is taking longer than expected. Your request is still saved; check My journeys shortly.",
  );
}
export function PreferencesForm({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("preferences", prefs);
      setMessage("Your travel style is saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel form-panel" onSubmit={submit}>
      <div className="form-intro">
        <span className="step-number">01</span>
        <div>
          <h2>There’s no wrong way to travel.</h2>
          <p>
            Pick what feels like you. You can change this whenever you like.
          </p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Your usual travel style
          <select
            value={prefs.style}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                style: e.target.value as Preferences["style"],
              })
            }
          >
            {["backpacker", "hostel", "mid-range", "luxury", "resort"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Your favorite pace
          <select
            value={prefs.pace}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                pace: e.target.value as Preferences["pace"],
              })
            }
          >
            {["relaxed", "balanced", "packed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Who you usually travel with
          <select
            value={prefs.group}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                group: e.target.value as Preferences["group"],
              })
            }
          >
            {["solo", "couple", "friends", "family"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Typical trip budget (optional)
          <input
            type="number"
            min="0"
            max="1000000"
            value={prefs.budget === null ? "" : prefs.budget / 100}
            placeholder="Set a budget per trip instead"
            onChange={(e) =>
              setPrefs({
                ...prefs,
                budget: e.target.value
                  ? Math.round(Number(e.target.value) * 100)
                  : null,
              })
            }
          />
        </label>
      </div>
      <fieldset>
        <legend>What makes you feel most alive?</legend>
        <div className="choice-row">
          {[
            "nature",
            "hiking",
            "food",
            "nightlife",
            "culture",
            "shopping",
            "sports",
          ].map((interest) => (
            <button
              type="button"
              key={interest}
              className={`choice ${prefs.interests.includes(interest as Preferences["interests"][number]) ? "selected" : ""}`}
              aria-pressed={prefs.interests.includes(
                interest as Preferences["interests"][number],
              )}
              onClick={() => {
                const i = interest as Preferences["interests"][number];
                setPrefs({
                  ...prefs,
                  interests: prefs.interests.includes(i)
                    ? prefs.interests.filter((v) => v !== i)
                    : [...prefs.interests, i],
                });
              }}
            >
              {interest}
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        A little comfort, a little adventure
        <input
          type="range"
          min="0"
          max="10"
          value={prefs.adventure}
          onChange={(e) =>
            setPrefs({ ...prefs, adventure: Number(e.target.value) })
          }
        />
        <span className="range-labels">
          <small>Comfort comes first</small>
          <small>Bring on the adventure</small>
        </span>
      </label>
      <label>
        Anything else we should know?
        <textarea
          maxLength={1000}
          value={prefs.notes}
          placeholder="Accessibility needs, dietary preferences, things you love…"
          onChange={(e) => setPrefs({ ...prefs, notes: e.target.value })}
        />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      <div className="form-actions">
        <span className="muted">All preferences are optional.</span>
        <button className="button" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Check size={17} />
          )}
          Save my travel style
        </button>
      </div>
    </form>
  );
}
export function CreateTripForm({
  currency = "SGD",
  budget,
}: {
  currency?: string;
  budget: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flexible, setFlexible] = useState(false);
  const [destinations, setDestinations] = useState([{ name: "", airport: "" }]);
  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      const { jobId } = await api<{ jobId: string }>("trips", {
        origin: data.get("origin"),
        originAirport: String(data.get("originAirport")).toUpperCase(),
        destinations: destinations.map((d) => ({
          ...d,
          airport: d.airport.toUpperCase(),
        })),
        earliestDate: start,
        latestDate: finish,
        flexible,
        dateNotes: data.get("dateNotes") ?? "",
        duration: flexible
          ? Number(data.get("duration"))
          : daysBetween(start, finish) + 1,
        travelers: Number(data.get("travelers")),
        rooms: 1,
        budget: Math.round(Number(data.get("budget")) * 100),
        currency: data.get("currency"),
      });
      const result = await pollJob(jobId);
      router.push(`/trips/${result.tripId}`);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  if (busy)
    return (
      <div className="panel generating" role="status" aria-live="polite">
        <div className="generating-orbit">
          <Sparkles size={34} />
        </div>
        <span className="eyebrow">A LITTLE WANDERLUST, TAKING SHAPE</span>
        <h2>Finding your kind of journey.</h2>
        <p>
          Exploring travel sources, making room for your interests,
          <br />
          and bringing the days together.
        </p>
        <div className="loading-line" />
        <small>This can take a few minutes. Your request is saved.</small>
      </div>
    );
  return (
    <form className="panel form-panel" onSubmit={submit}>
      <div className="form-intro">
        <span className="step-number">02</span>
        <div>
          <h2>Where are we heading?</h2>
          <p>A few details now. Plenty of possibilities ahead.</p>
        </div>
      </div>
      <fieldset>
        <legend>Your starting point</legend>
        <div className="form-grid">
          <label>
            Origin city
            <input
              name="origin"
              placeholder="Singapore"
              required
              maxLength={100}
            />
          </label>
          <label>
            Departure airport code
            <input
              name="originAirport"
              placeholder="SIN"
              required
              pattern="[A-Za-z]{3}"
              maxLength={3}
              className="uppercase"
            />
            <small>Three-letter IATA code, such as SIN or LHR.</small>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Your destination{destinations.length > 1 ? "s" : ""}</legend>
        {destinations.map((destination, index) => (
          <div className="destination-row" key={index}>
            <label>
              City or region
              <input
                required
                maxLength={100}
                placeholder="Tokyo"
                value={destination.name}
                onChange={(e) =>
                  setDestinations(
                    destinations.map((d, i) =>
                      i === index ? { ...d, name: e.target.value } : d,
                    ),
                  )
                }
              />
            </label>
            <label>
              Arrival airport
              <input
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
                placeholder="NRT"
                className="uppercase"
                value={destination.airport}
                onChange={(e) =>
                  setDestinations(
                    destinations.map((d, i) =>
                      i === index ? { ...d, airport: e.target.value } : d,
                    ),
                  )
                }
              />
            </label>
            {index > 0 && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove destination ${index + 1}`}
                onClick={() =>
                  setDestinations(destinations.filter((_, i) => i !== index))
                }
              >
                <X size={17} />
              </button>
            )}
          </div>
        ))}
        {destinations.length < 3 && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setDestinations([...destinations, { name: "", airport: "" }])
            }
          >
            <Plus size={16} /> I’m considering another destination
          </button>
        )}
      </fieldset>
      <fieldset>
        <legend>Make a little time</legend>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={!flexible}
            className={!flexible ? "active" : ""}
            onClick={() => setFlexible(false)}
          >
            I know my dates
          </button>
          <button
            type="button"
            aria-pressed={flexible}
            className={flexible ? "active" : ""}
            onClick={() => setFlexible(true)}
          >
            I can be flexible
          </button>
        </div>
        <div className="form-grid">
          <label>
            {flexible ? "Earliest departure" : "Departure date"}
            <input
              type="date"
              required
              min={tomorrow}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            {flexible ? "Latest return" : "Return date"}
            <input
              type="date"
              required
              min={start ? addDays(start, 1) : tomorrow}
              value={finish}
              onChange={(e) => setFinish(e.target.value)}
            />
          </label>
        </div>
        {flexible && (
          <div className="form-grid">
            <label>
              Days away
              <input
                name="duration"
                type="number"
                min={2}
                max={21}
                defaultValue={7}
                required
              />
            </label>
            <label>
              What dates work for you?
              <input
                name="dateNotes"
                maxLength={300}
                placeholder="Any 7 days, preferably over a weekend"
              />
            </label>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>The practical bits</legend>
        <div className="form-grid three">
          <label>
            Adult travelers
            <input
              name="travelers"
              type="number"
              min={1}
              max={6}
              defaultValue={1}
              required
            />
          </label>
          <label>
            Total trip budget
            <input
              name="budget"
              type="number"
              min={100}
              max={1000000}
              defaultValue={budget ? budget / 100 : undefined}
              placeholder="2500"
              required
            />
          </label>
          <label>
            Currency
            <select name="currency" defaultValue={currency}>
              {["SGD", "USD", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <small>
          Budget covers the whole party. Accommodation planning currently
          assumes one room. Costs and flight times are provisional until checked
          with providers.
        </small>
      </fieldset>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <span className="muted">Your plans can always evolve.</span>
        <button className="button" type="submit">
          Bring my journey to life <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}
