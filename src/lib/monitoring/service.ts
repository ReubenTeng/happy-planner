import { randomUUID } from "node:crypto";
import { z } from "zod";
import { daysBetween, type Trip } from "../domain";
import { fetchJson } from "../providers/http";
import { db } from "../server/db";
import { required } from "../server/errors";

export type MonitorUpdate = {
  type: string;
  severity: "info" | "warning";
  title: string;
  message: string;
  source: string;
  suggestedAction: string;
};
export interface TripMonitor {
  check(trip: Trip): Promise<MonitorUpdate[]>;
}
const Forecast = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_min: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
  }),
});
export class WeatherMonitor implements TripMonitor {
  async check(trip: Trip): Promise<MonitorUpdate[]> {
    const start = trip.plan.days[0].date;
    const today = new Date().toISOString().slice(0, 10);
    if (daysBetween(today, start) > 15)
      return [
        {
          type: "readiness",
          severity: "info",
          title: "Your trip is on the horizon",
          message:
            "A reliable daily forecast is not available this far ahead. We'll check again closer to departure.",
          source: "Happy Planner",
          suggestedAction:
            "Review entry requirements, travel insurance and any outstanding bookings.",
        },
      ];
    const geo = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geo.searchParams.set("name", trip.plan.destination);
    geo.searchParams.set("count", "1");
    geo.searchParams.set("language", "en");
    const coords = z
      .object({
        results: z
          .array(
            z.object({
              latitude: z.number(),
              longitude: z.number(),
              name: z.string(),
            }),
          )
          .optional(),
      })
      .parse(await fetchJson(geo)).results?.[0];
    if (!coords)
      return [
        {
          type: "weather",
          severity: "info",
          title: "Choose a more specific destination for weather",
          message: "We couldn't match this destination to a weather location.",
          source: "Open-Meteo",
          suggestedAction:
            "Check the local meteorological service before departure.",
        },
      ];
    const commercial = process.env.WEATHER_COMMERCIAL === "true";
    const url = new URL(
      commercial
        ? "https://customer-api.open-meteo.com/v1/forecast"
        : "https://api.open-meteo.com/v1/forecast",
    );
    if (commercial) url.searchParams.set("apikey", required("WEATHER_API_KEY"));
    for (const [key, value] of Object.entries({
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
      timezone: "auto",
      forecast_days: "16",
    }))
      url.searchParams.set(key, value);
    const { daily } = Forecast.parse(await fetchJson(url));
    const updates: MonitorUpdate[] = [];
    for (const [i, date] of daily.time.entries()) {
      if (!trip.plan.days.some((d) => d.date === date)) continue;
      const min = daily.temperature_2m_min[i];
      const max = daily.temperature_2m_max[i];
      const rain = daily.precipitation_probability_max[i];
      const code = daily.weather_code[i];
      if (min == null || max == null || rain == null || code == null) continue;
      const severe = code >= 95 || code === 86 || code === 82;
      const wet = rain >= 65;
      const cold = min <= 0;
      updates.push({
        type: "weather",
        severity: severe || wet || cold || max >= 35 ? "warning" : "info",
        title: `${date}: ${severe ? "Storm or heavy precipitation forecast" : wet ? "Rain likely" : cold ? "Freezing temperatures possible" : `${Math.round(min)}–${Math.round(max)}°C expected`}`,
        message: `Forecast for ${coords.name}: ${min}–${max}°C; maximum precipitation probability ${rain}%. Weather forecasts can change.`,
        source: "Open-Meteo",
        suggestedAction: [
          cold
            ? "Pack thermal layers and suitable footwear."
            : "Pack layers for the temperature range.",
          wet
            ? "Bring waterproof clothing and consider an indoor alternative for outdoor activities."
            : "Carry sun protection and water.",
          severe
            ? "Check official local weather warnings before outdoor activities."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    if (!updates.length)
      updates.push({
        type: "weather",
        severity: "info",
        title: "Forecast not available for your travel dates",
        message:
          "Your dates are outside the returned forecast, or weather data is incomplete.",
        source: "Open-Meteo",
        suggestedAction: "Check again closer to departure.",
      });
    return updates;
  }
}
export async function monitorTrip(
  trip: Trip,
  monitors: TripMonitor[] = [new WeatherMonitor()],
) {
  const updates = (
    await Promise.all(monitors.map((m) => m.check(trip)))
  ).flat();
  for (const update of updates) {
    const key = `${new Date().toISOString().slice(0, 10)}:${update.type}:${update.title}`;
    await db().query(
      "INSERT INTO trip_updates(id,trip_id,dedupe_key,data) VALUES($1,$2,$3,$4) ON CONFLICT(trip_id,dedupe_key) DO UPDATE SET data=EXCLUDED.data,created_at=now()",
      [randomUUID(), trip.id, key, JSON.stringify(update)],
    );
  }
}
