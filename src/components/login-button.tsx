"use client";
import { useState, type FormEvent } from "react";
import { api } from "./forms";
export function LoginButton({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>("auth/email", { email });
      setMessage(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="text-left">
        Email address
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          disabled={!enabled}
        />
      </label>
      <button className="button full" disabled={!enabled || busy}>
        {busy ? "Sending your link…" : "Email me a sign-in link"}
        <span aria-hidden="true">↗</span>
      </button>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void api("auth/logout", {})
          .then(() => window.location.assign("/"))
          .catch(() => setBusy(false));
      }}
    >
      Sign out
    </button>
  );
}
