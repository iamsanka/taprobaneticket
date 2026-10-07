"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StoryModal, type ExternalLink } from "./StoryModal";
import "./Events.css";

type PublicEvent = {
  id: number;
  title: string;
  description: string;
  coverImage: string | null;
  location: string;
  eventTime: string;
  visibility: "ongoing" | "past" | "draft" | string;
};

type EventDetail = PublicEvent & {
  pastEventTitle: string;
  pastEventStory: string;
  externalLinks: ExternalLink[];
};

export default function Events() {
  const [ongoingEvents, setOngoingEvents] = useState<PublicEvent[]>([]);
  const [pastEvents, setPastEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [storyEvent, setStoryEvent] = useState<EventDetail | null>(null);
  const [loadingStoryId, setLoadingStoryId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/events/public", {
          cache: "no-store",
        });

        const data = await res.json();
        const events: PublicEvent[] = data.events || [];

        setOngoingEvents(events.filter((e) => e.visibility === "ongoing"));
        setPastEvents(events.filter((e) => e.visibility === "past"));
      } catch (err) {
        console.error("Failed to load public events:", err);
      }

      setLoading(false);
    }

    load();
  }, []);

  async function openStory(eventId: number) {
    if (loadingStoryId !== null) return;
    setLoadingStoryId(eventId);

    try {
      const res = await fetch(`/api/events/public/${eventId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.event) {
        setStoryEvent(data.event);
      }
    } catch (err) {
      console.error("Failed to load story:", err);
    } finally {
      setLoadingStoryId(null);
    }
  }

  const hasAny = ongoingEvents.length > 0 || pastEvents.length > 0;

  return (
    <section id="events" className="events-section">
      <div className="events-shell">
        <header className="events-header">
          <span className="events-eyebrow">Events</span>
          <h2 className="events-heading">
            Experiences across{" "}
            <span className="events-heading-accent">Europe</span>
          </h2>
          <p className="events-intro">
            Discover multicultural performances, festivals, and creative
            productions happening across the continent.
          </p>
        </header>

        {loading && (
          <div className="events-state">
            <div className="events-state-spinner" />
            <p className="events-state-text">Loading events…</p>
          </div>
        )}

        {!loading && ongoingEvents.length > 0 && (
          <div className="events-group">
            <div className="events-group-header">
              <h3 className="events-group-title">Ongoing Events</h3>
              <span className="events-group-count">
                {ongoingEvents.length}{" "}
                {ongoingEvents.length === 1 ? "event" : "events"}
              </span>
            </div>

            <div className="events-grid">
              {ongoingEvents.slice(0, 6).map((event) => (
                <EventCard key={event.id} event={event} variant="ongoing" />
              ))}
            </div>
          </div>
        )}

        {!loading && pastEvents.length > 0 && (
          <div className="events-group events-group-past">
            <div className="events-group-header">
              <h3 className="events-group-title">Past Events</h3>
              <span className="events-group-count">
                {pastEvents.length}{" "}
                {pastEvents.length === 1 ? "event" : "events"}
              </span>
            </div>

            <div className="events-grid">
              {pastEvents.slice(0, 3).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  variant="past"
                  onOpen={() => openStory(event.id)}
                  loading={loadingStoryId === event.id}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && !hasAny && (
          <div className="events-state">
            <div className="events-state-icon">
              <CalendarIcon />
            </div>
            <p className="events-state-title">No events yet</p>
            <p className="events-state-text">
              New events will appear here as soon as they're published.
            </p>
          </div>
        )}
      </div>

      {storyEvent && (
        <StoryModal
          coverImage={storyEvent.coverImage}
          eventTitle={storyEvent.title}
          eventLocation={storyEvent.location}
          eventTime={storyEvent.eventTime}
          pastTitle={storyEvent.pastEventTitle}
          pastStory={storyEvent.pastEventStory}
          externalLinks={storyEvent.externalLinks}
          onClose={() => setStoryEvent(null)}
        />
      )}
    </section>
  );
}

// ======================================================
// Event card
// ======================================================

function EventCard({
  event,
  variant,
  onOpen,
  loading,
}: {
  event: PublicEvent;
  variant: "ongoing" | "past";
  onOpen?: () => void;
  loading?: boolean;
}) {
  const truncated =
    event.description.length > 110
      ? event.description.slice(0, 110).trimEnd() + "…"
      : event.description;

  const cardInner = (
    <article className={`event-card event-card-${variant}`}>
      <div className="event-card-image">
        {event.coverImage ? (
          <img src={event.coverImage} alt={event.title} loading="lazy" />
        ) : (
          <div className="event-card-image-placeholder">
            <CalendarIcon />
          </div>
        )}

        <span className={`event-card-badge event-card-badge-${variant}`}>
          {variant === "ongoing" ? "Ongoing" : "Past Event"}
        </span>

        {variant === "past" && (
          <span className="event-card-story-pill">
            <BookIcon />
            Story
          </span>
        )}
      </div>

      <div className="event-card-body">
        <h4 className="event-card-title">{event.title}</h4>
        <p className="event-card-description">{truncated}</p>

        <ul className="event-card-meta">
          <li className="event-card-meta-item">
            <LocationIcon />
            <span>{event.location}</span>
          </li>
          <li className="event-card-meta-item">
            <ClockIcon />
            <span>{event.eventTime}</span>
          </li>
        </ul>

        {variant === "ongoing" && (
          <div className="event-card-cta event-card-cta-primary">
            <span className="event-card-cta-text">Buy Tickets</span>
            <ArrowRightIcon />
          </div>
        )}

        {variant === "past" && (
          <div className="event-card-cta event-card-cta-story">
            <BookIcon />
            <span className="event-card-cta-text">View Post</span>
            <ArrowRightIcon />
          </div>
        )}
      </div>
    </article>
  );

  if (variant === "ongoing") {
    return (
      <Link href={`/events/${event.id}`} className="event-card-link">
        {cardInner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="event-card-button"
      onClick={onOpen}
      disabled={loading}
      aria-label={`Read the story of ${event.title}`}
    >
      {cardInner}

      {loading && (
        <span className="event-card-loading-overlay">
          <span className="event-card-loading-spinner" />
        </span>
      )}
    </button>
  );
}

// ======================================================
// Icons
// ======================================================

function LocationIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="event-card-cta-arrow">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}