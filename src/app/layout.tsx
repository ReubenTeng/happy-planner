import type { Metadata } from "next";
import Link from "next/link";
import { Compass, ArrowUpRight } from "lucide-react";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Happy Planner — Make room for the journey",
    template: "%s · Happy Planner",
  },
  description:
    "A thoughtful travel companion. Plan your journey, make it your own, and keep every detail together.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Compass size={23} />
            </span>
            happy<span className="brand-light">planner</span>
            <span className="brand-dot">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/trips">My journeys</Link>
            <Link href="/preferences" className="nav-secondary">
              Travel style
            </Link>
            <Link href="/trips/new" className="button small">
              Plan a trip <ArrowUpRight size={16} />
            </Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <Link className="brand" href="/">
            happy<span className="brand-light">planner.</span>
          </Link>
          <span>Good journeys start with a little curiosity.</span>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Travel information</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
