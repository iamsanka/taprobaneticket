"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import "./Hero.css";

const slides = [
  {
    image: "/images/hero/image1.jpg",
    eyebrow: "Featured",
    title: "Cultural Fusion & Experience",
    description:
      "Immerse yourself in diverse performances and traditions. A celebration of unity and culture.",
  },
  {
    image: "/images/hero/image2.jpg",
    eyebrow: "Live Now",
    title: "Live Concert Nights",
    description:
      "Feel the energy of live music with top artists. Experience unforgettable nights.",
  },
  {
    image: "/images/hero/image3.jpg",
    eyebrow: "Family Friendly",
    title: "Memories For All Ages",
    description:
      "Safe and fun experiences for the whole family. Create memories together.",
  },
  {
    image: "/images/hero/image4.jpg",
    eyebrow: "VIP Access",
    title: "Exclusive VIP Experiences",
    description:
      "Premium seating, lounge access, and priority entry. Enjoy events in style.",
  },
  {
    image: "/images/hero/image5.jpg",
    eyebrow: "Sports",
    title: "Sports & Competitions",
    description:
      "From local tournaments to major leagues. Be part of the action.",
  },
  {
    image: "/images/hero/image6.jpg",
    eyebrow: "Workshops",
    title: "Workshops & Conferences",
    description:
      "Learn, network, and grow with curated professional sessions.",
  },
];

const SLIDE_DURATION_MS = 7000;

export default function Hero() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  // Auto-advance — pauses on hover / focus
  useEffect(() => {
    if (paused) return;

    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, SLIDE_DURATION_MS);

    return () => clearInterval(interval);
  }, [paused]);

  function goToEvents() {
    if (pathname === "/") {
      const el = document.querySelector("#events");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push("/#events");
    }
  }

  function goToSlide(index: number) {
    setCurrent(index);
  }

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* ---- Background slides ---- */}
      <div className="hero-bg-layer" aria-hidden="true">
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`hero-slide ${index === current ? "active" : ""}`}
            style={{ backgroundImage: `url(${slide.image})` }}
          />
        ))}
      </div>

      {/* ---- Overlay gradients ---- */}
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-overlay-vignette" aria-hidden="true" />

      {/* ---- Content ---- */}
      <div className="hero-content">
        <div className="hero-content-inner">
          {slides.map((slide, index) => {
            if (index !== current) return null;
            return (
              <div key={index} className="hero-panel">
                <span className="hero-eyebrow">{slide.eyebrow}</span>
                <h1 className="hero-title">{slide.title}</h1>
                <p className="hero-description">{slide.description}</p>
                <div className="hero-actions">
                  <button className="hero-btn hero-btn-primary" onClick={goToEvents}>
                    Browse Events
                    <ArrowRightIcon />
                  </button>
                  <button
                    className="hero-btn hero-btn-ghost"
                    onClick={() =>
                      document
                        .querySelector("#about")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Learn More
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Slide indicators ---- */}
      <div className="hero-indicators" role="tablist" aria-label="Slides">
        {slides.map((_, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === current}
            aria-label={`Go to slide ${index + 1}`}
            className={`hero-indicator ${index === current ? "active" : ""}`}
            onClick={() => goToSlide(index)}
          >
            <span className="hero-indicator-fill" />
          </button>
        ))}
      </div>

      {/* ---- Scroll cue ---- */}
      <button
        className="hero-scroll-cue"
        onClick={goToEvents}
        aria-label="Scroll to events"
      >
        <ChevronDownIcon />
      </button>
    </section>
  );
}

// ======================================================
// Icons
// ======================================================

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}