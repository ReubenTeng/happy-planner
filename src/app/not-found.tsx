import Link from "next/link";
export default function NotFound() {
  return (
    <section className="shell empty-state">
      <h1>This path ends here.</h1>
      <p>This journey doesn’t exist, or its sharing link has expired.</p>
      <Link className="button" href="/trips">
        Back to your journeys
      </Link>
    </section>
  );
}
