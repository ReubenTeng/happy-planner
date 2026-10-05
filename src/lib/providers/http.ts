import { AppError } from "../server/errors";
export async function fetchJson(
  url: URL | string,
  init?: RequestInit,
): Promise<unknown> {
  // Do not log URLs or upstream bodies: providers may put credentials in query strings.
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new AppError(
      502,
      "A travel service could not be reached. Please try again shortly.",
    );
  }
  if (response.status === 429)
    throw new AppError(
      503,
      "A travel service is busy. Please try again shortly.",
    );
  if (!response.ok)
    throw new AppError(
      502,
      "A connected service rejected the request. Please try again later.",
    );
  try {
    return await response.json();
  } catch {
    throw new AppError(
      502,
      "A travel service returned an unreadable response.",
    );
  }
}
export function safeBookingUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    ) ||
    url.hostname.startsWith("[")
  ) {
    throw new AppError(502, "The provider did not return a safe booking link.");
  }
  return url.toString();
}
