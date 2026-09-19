"use client";

import { useEffect, useState } from "react";
import "./Hero.css";

const slides = [
  {
    image: "/images/hero/image1.jpg",
    title: "Cultural Fusion & Experience",
    description: "Immerse yourself in diverse performances and traditions. A celebration of unity and culture."
  },
  {
    image: "/images/hero/image2.jpg",
    title: "Live Concert Nights",
    description: "Feel the energy of live music with top artists. Experience unforgettable nights."
  },
  {
    image: "/images/hero/image3.jpg",
    title: "Family-Friendly Events",
    description: "Safe and fun experiences for all ages. Create memories together."
  },
  {
    image: "/images/hero/image4.jpg",
    title: "Exclusive VIP Access",
    description: "Premium seating, lounge access, and priority entry. Enjoy events in style."
  },
  {
    image: "/images/hero/image5.jpg",
    title: "Sports & Competitions",
    description: "From local tournaments to major leagues. Be part of the action."
  },
  {
    image: "/images/hero/image6.jpg",
    title: "Workshops & Conferences",
    description: "Learn, network, and grow with curated professional sessions."
  }
];

export default function Hero() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hero-container">
      {slides.map((slide, index) => (
        <div
          key={index}
          className={`hero-slide ${index === current ? "active" : ""}`}
          style={{ backgroundImage: `url(${slide.image})` }}
        >
          {index === current && (
            <div className="hero-text">
              <div className="hero-title">{slide.title}</div>
              <div className="hero-description">{slide.description}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
