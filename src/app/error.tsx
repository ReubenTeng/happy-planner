"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="shell empty-state">
      <h1>A small detour.</h1>
      <p>We couldn’t load this page. Please try again in a moment.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
