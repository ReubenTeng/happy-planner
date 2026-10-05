import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  MapPinned,
  SlidersHorizontal,
  ExternalLink,
  Check,
  Plane,
  Mountain,
  Sun,
} from "lucide-react";
export default function Home() {
  return (
    <>
      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-sun">✳</span> FOR THE WAY YOU WANT TO GO
          </span>
          <h1>
            Less planning.
            <br />
            More <em>possibility.</em>
          </h1>
          <p>
            Your kind of places. Your kind of pace. Turn a little wanderlust
            into a journey that feels like you.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/trips/new">
              Let’s plan your next trip <ArrowUpRight size={19} />
            </Link>
            <a className="text-link" href="#how-it-works">
              How it works <ArrowRight size={16} />
            </a>
          </div>
          <div className="hero-note">
            <span className="mini-icon">
              <Sparkles size={15} />
            </span>{" "}
            A thoughtful plan. Room for the unexpected.
          </div>
        </div>
        <div
          className="journey-art"
          aria-label="Illustration of a winding route through green mountains"
        >
          <svg
            className="landscape"
            viewBox="0 0 620 560"
            role="img"
            aria-label="A sunlit mountain landscape"
          >
            <defs>
              <linearGradient id="sky" x2="0" y2="1">
                <stop stopColor="#e1e9da" />
                <stop offset="1" stopColor="#f0e2c1" />
              </linearGradient>
              <linearGradient id="hill" x2="1" y2="1">
                <stop stopColor="#395c4f" />
                <stop offset="1" stopColor="#123c36" />
              </linearGradient>
            </defs>
            <rect width="620" height="560" rx="28" fill="url(#sky)" />
            <circle cx="462" cy="120" r="50" fill="#edbd70" />
            <path
              d="M0 330 170 120 360 365 480 220 620 360V560H0Z"
              fill="#a9b8a0"
            />
            <path d="m118 185 52-65 60 78-51-26-24 22Z" fill="#f7f0dd" />
            <path d="M0 385Q150 240 310 385T620 380V560H0Z" fill="#6d8a6d" />
            <path d="M0 460Q135 400 260 465T620 395V560H0Z" fill="url(#hill)" />
            <path
              d="M330 560C325 515 213 503 264 473S436 450 401 408 318 365 352 343"
              fill="none"
              stroke="#e7cc9e"
              strokeWidth="15"
            />
            <path
              d="M330 560C325 515 213 503 264 473S436 450 401 408 318 365 352 343"
              fill="none"
              stroke="#fbf7e8"
              strokeWidth="2"
              strokeDasharray="8 10"
            />
            <g fill="#163d34">
              <path d="m63 468 20-68 20 68Z" />
              <path d="m93 478 26-92 26 92Z" />
              <path d="m510 454 23-78 23 78Z" />
              <path d="m551 445 17-60 17 60Z" />
            </g>
            <circle cx="352" cy="343" r="12" fill="#f9f5ec" />
            <circle cx="352" cy="343" r="5" fill="#205345" />
          </svg>
          <div className="art-label">
            <span className="pill light">
              <Sun size={14} /> A little further from ordinary
            </span>
            <h2>
              The journey
              <br />
              is yours.
            </h2>
          </div>
          <div className="floating-note">
            <span className="round-icon">
              <MapPinned size={23} />
            </span>
            <div>
              <b>Made for your kind of adventure</b>
              <small>Every detail, in one beautiful plan.</small>
            </div>
            <Check size={18} className="green" />
          </div>
          <span className="art-stamp">TAKE THE SCENIC ROUTE ↗</span>
        </div>
      </section>
      <section className="value-strip shell">
        <span>
          <Check size={17} /> Plans that fit your budget
        </span>
        <span>
          <Check size={17} /> Change your mind, anytime
        </span>
        <span>
          <Check size={17} /> Book directly with providers
        </span>
      </section>
      <section id="how-it-works" className="shell section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM WHAT IF TO LET’S GO</span>
            <h2>
              A little inspiration.
              <br />A plan you can actually use.
            </h2>
          </div>
          <p>
            Keep the fun part of travel. We’ll help you bring the details
            together.
          </p>
        </div>
        <div className="feature-grid">
          {[
            {
              icon: SlidersHorizontal,
              n: "01",
              title: "Tell us your travel style",
              text: "Slow mornings or sunrise hikes? Set your pace, interests and budget. There’s no wrong way to explore.",
            },
            {
              icon: Sparkles,
              n: "02",
              title: "Shape a journey together",
              text: "Get a day-by-day plan grounded in travel sources. Ask for more nature, a free afternoon, or a different stay.",
            },
            {
              icon: ExternalLink,
              n: "03",
              title: "Make it happen",
              text: "Review prices with providers, book on their sites, and keep your confirmations and trip details together.",
            },
          ].map((f) => (
            <article className="feature" key={f.n}>
              <div className="feature-top">
                <f.icon size={25} />
                <span>{f.n}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="shell callout">
        <div>
          <span className="eyebrow">A CHANGE OF SCENERY IS CALLING</span>
          <h2>Where will your curiosity take you?</h2>
          <p>A weekend away. A long-awaited adventure. Start with a place.</p>
        </div>
        <Link className="button cream" href="/trips/new">
          Find your next chapter <Plane size={18} />
        </Link>
        <Mountain className="callout-mountain" size={190} />
      </section>
    </>
  );
}
