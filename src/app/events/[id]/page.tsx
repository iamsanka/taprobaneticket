"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { StoryModal, type ExternalLink } from "@/components/StoryModal";
import "./events.css";

type EventTicket = {
  id: number;
  ticketTypeId: number;
  price: number;
  categoryName: string;
  typeName: string;
};

export default function CustomerEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [showStory, setShowStory] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      try {
        const res = await fetch(`/api/events/public/${eventId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setError("Event not found");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setEvent(data.event);
      } catch (err) {
        console.error("Failed to load event:", err);
        setError("Failed to load event");
      } finally {
        setLoading(false);
      }
    }

    loadEvent();
  }, [eventId]);

  const tickets: EventTicket[] = event?.eventTickets ?? [];

  const totalQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities]
  );

  const totalPrice = useMemo(() => {
    return tickets.reduce((sum, t) => {
      const q = quantities[t.id] || 0;
      return sum + t.price * q;
    }, 0);
  }, [tickets, quantities]);

  function increment(id: number) {
    setQuantities((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  function decrement(id: number) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max((prev[id] || 0) - 1, 0),
    }));
  }

  function addToCart() {
    const selected = tickets
      .filter((t) => quantities[t.id] > 0)
      .map((t) => ({
        typeId: t.ticketTypeId,
        quantity: quantities[t.id],
        price: t.price,
        categoryName: t.categoryName,
        typeName: t.typeName,
        eventId: event.id,
      }));

    if (selected.length === 0) {
      alert("Please select at least one ticket");
      return;
    }

    localStorage.setItem("cart", JSON.stringify(selected));
    router.push("/cart");
  }

  // ==================================================
  // Loading / error
  // ==================================================

  if (loading) {
    return (
      <div className="event-page">
        <div className="event-state">
          <div className="event-state-spinner" />
          <p className="event-state-text">Loading event…</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="event-page">
        <button className="event-back" onClick={() => router.push("/")}>
          ← Back to Events
        </button>
        <div className="event-state">
          <p className="event-state-title">Event not found</p>
          <p className="event-state-text">
            It may have been removed or the link is incorrect.
          </p>
        </div>
      </div>
    );
  }

  const galleryImages: string[] = event.galleryImages ?? [];
  const isPast = event.visibility === "past";
  const pastTitle: string = event.pastEventTitle || "";
  const pastStory: string = event.pastEventStory || "";
  const externalLinks: ExternalLink[] = event.externalLinks ?? [];

  const hasStoryContent =
    isPast &&
    (pastTitle.trim().length > 0 ||
      pastStory.trim().length > 0 ||
      externalLinks.length > 0);

  return (
    <div className="event-page">
      {/* ---- Back link ---- */}
      <button className="event-back" onClick={() => router.push("/")}>
        <ArrowLeftIcon />
        Back to Events
      </button>

      {/* ---- Cover with overlay ---- */}
      <div className="event-cover">
        {event.coverImage ? (
          <img src={event.coverImage} alt={event.title} />
        ) : (
          <div className="event-cover-placeholder" />
        )}

        <div className="event-cover-overlay" />

        <div className="event-cover-content">
          <div className="event-cover-eyebrow-row">
            <span className="event-cover-eyebrow">
              {isPast ? "Past Event" : "Event"}
            </span>

            {hasStoryContent && (
              <button
                className="event-story-trigger"
                onClick={() => setShowStory(true)}
              >
                <StarIcon />
                View the story
              </button>
            )}
          </div>

          <h1 className="event-cover-title">{event.title}</h1>
          <div className="event-cover-meta">
            <span className="event-cover-meta-item">
              <PinIcon />
              {event.location}
            </span>
            <span className="event-cover-meta-divider" aria-hidden="true" />
            <span className="event-cover-meta-item">
              <ClockIcon />
              {event.eventTime}
            </span>
          </div>
        </div>
      </div>

      {/* ---- Description ---- */}
      {event.description && (
        <section className="event-description-section">
          <h2 className="event-section-title">
            {isPast ? "What it was about" : "About this event"}
          </h2>
          <p className="event-description">{event.description}</p>
        </section>
      )}

      {/* ---- Gallery ---- */}
      {galleryImages.length > 0 && (
        <section className="event-gallery-section">
          <h2 className="event-section-title">Gallery</h2>
          <div className="event-gallery">
            <div className="event-gallery-track">
              {[...galleryImages, ...galleryImages].map((img, i) => (
                <img
                  key={i}
                  src={img}
                  className="event-gallery-img"
                  alt={`Gallery ${i + 1}`}
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- Tickets (only for non-past events) ---- */}
      {!isPast && (
        <section className="event-tickets-section">
          <div className="event-tickets-header">
            <h2 className="event-section-title">Select Tickets</h2>
            {totalQuantity > 0 && (
              <span className="event-tickets-count">
                {totalQuantity} selected
              </span>
            )}
          </div>

          {tickets.length === 0 ? (
            <div className="event-state">
              <p className="event-state-title">Tickets not yet available</p>
              <p className="event-state-text">
                Ticket types for this event will appear here shortly.
              </p>
            </div>
          ) : (
            <div className="event-tickets-list">
              {tickets.map((ticket) => {
                const qty = quantities[ticket.id] || 0;
                const subtotal = qty * ticket.price;
                const isActive = qty > 0;

                return (
                  <div
                    key={ticket.id}
                    className={`event-ticket-row ${
                      isActive ? "active" : ""
                    }`}
                  >
                    <div className="event-ticket-info">
                      <div className="event-ticket-name">
                        <span className="event-ticket-category">
                          {ticket.categoryName}
                        </span>
                        <span className="event-ticket-dash">—</span>
                        <span className="event-ticket-type">
                          {ticket.typeName}
                        </span>
                      </div>
                      <div className="event-ticket-price">
                        €{(ticket.price / 100).toFixed(2)}
                        <span className="event-ticket-price-unit">
                          / ticket
                        </span>
                      </div>
                    </div>

                    <div className="event-ticket-controls">
                      <div className="event-qty">
                        <button
                          type="button"
                          className="event-qty-btn"
                          onClick={() => decrement(ticket.id)}
                          disabled={qty === 0}
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon />
                        </button>
                        <span className="event-qty-value">{qty}</span>
                        <button
                          type="button"
                          className="event-qty-btn event-qty-btn-plus"
                          onClick={() => increment(ticket.id)}
                          aria-label="Increase quantity"
                        >
                          <PlusIcon />
                        </button>
                      </div>

                      {qty > 0 && (
                        <div className="event-ticket-subtotal">
                          €{(subtotal / 100).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ---- Past event CTA (opens modal) ---- */}
      {isPast && hasStoryContent && (
        <section className="event-past-cta">
          <div className="event-past-cta-inner">
            <div className="event-past-cta-icon">
              <StarIcon />
            </div>
            <div className="event-past-cta-text">
              <h3 className="event-past-cta-title">
                Relive the moment
              </h3>
              <p className="event-past-cta-desc">
                Read the story, watch the aftermovie, and browse photos from
                the night.
              </p>
            </div>
            <button
              className="event-past-cta-btn"
              onClick={() => setShowStory(true)}
            >
              View the story
              <ArrowRightIcon />
            </button>
          </div>
        </section>
      )}

      {/* ---- Sticky bottom bar (only for sellable events) ---- */}
      {!isPast && tickets.length > 0 && (
        <div
          className={`event-sticky-bar ${
            totalQuantity > 0 ? "visible" : ""
          }`}
        >
          <div className="event-sticky-bar-inner">
            <div className="event-sticky-summary">
              <span className="event-sticky-label">
                {totalQuantity === 0
                  ? "Select tickets"
                  : `${totalQuantity} ${
                      totalQuantity === 1 ? "ticket" : "tickets"
                    }`}
              </span>
              <span className="event-sticky-total">
                €{(totalPrice / 100).toFixed(2)}
              </span>
            </div>
            <button
              className="event-sticky-btn"
              onClick={addToCart}
              disabled={totalQuantity === 0}
            >
              Add to Cart
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      )}

      {/* ---- Story modal (shared component) ---- */}
      {showStory && hasStoryContent && (
        <StoryModal
          coverImage={event.coverImage}
          eventTitle={event.title}
          eventLocation={event.location}
          eventTime={event.eventTime}
          pastTitle={pastTitle}
          pastStory={pastStory}
          externalLinks={externalLinks}
          onClose={() => setShowStory(false)}
        />
      )}
    </div>
  );
}

// ======================================================
// Icons
// ======================================================

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PinIcon() {
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}