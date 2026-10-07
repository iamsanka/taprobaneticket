"use client";

import { useEffect } from "react";
import "./StoryModal.css";

export type ExternalLinkType =
  | "youtube"
  | "facebook"
  | "instagram"
  | "photo_album"
  | "website"
  | "other";

export type ExternalLink = {
  id: number;
  type: ExternalLinkType;
  label: string;
  url: string;
};

const LINK_TYPE_LABELS: Record<ExternalLinkType, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  photo_album: "Photo album",
  website: "Website",
  other: "Link",
};

export type StoryModalProps = {
  coverImage?: string | null;
  eventTitle: string;
  eventLocation: string;
  eventTime: string;
  pastTitle: string;
  pastStory: string;
  externalLinks: ExternalLink[];
  onClose: () => void;
};

export function StoryModal({
  coverImage,
  eventTitle,
  eventLocation,
  eventTime,
  pastTitle,
  pastStory,
  externalLinks,
  onClose,
}: StoryModalProps) {
  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Escape closes modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const headline = (pastTitle || "").trim() || eventTitle;
  const hero = coverImage || "";

  const paragraphs = (pastStory || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="story-overlay" onClick={onClose}>
      <div className="story-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="story-close"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        {hero && (
          <div className="story-hero">
            <img src={hero} alt={headline} />
            <div className="story-hero-overlay" />
            <div className="story-hero-content">
              <span className="story-hero-eyebrow">Past Event</span>
              <h2 className="story-hero-title">{headline}</h2>
              <div className="story-hero-meta">
                <span className="story-hero-meta-item">
                  <LocationIcon />
                  {eventLocation}
                </span>
                <span className="story-hero-meta-divider" />
                <span className="story-hero-meta-item">
                  <ClockIcon />
                  {eventTime}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="story-body">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <p key={i} className="story-paragraph">
                {para}
              </p>
            ))
          ) : (
            <p className="story-paragraph story-paragraph-muted">
              No story recorded for this event.
            </p>
          )}

          {externalLinks.length > 0 && (
            <>
              <h3 className="story-links-title">Watch &amp; explore</h3>
              <div className="story-links">
                {externalLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`story-link story-link-${link.type}`}
                  >
                    <span className="story-link-icon">
                      <LinkTypeIcon type={link.type} />
                    </span>
                    <span className="story-link-text">
                      <span className="story-link-label">{link.label}</span>
                      <span className="story-link-type">
                        {LINK_TYPE_LABELS[link.type]}
                      </span>
                    </span>
                    <span className="story-link-arrow">
                      <ArrowUpRightIcon />
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

function LinkTypeIcon({ type }: { type: ExternalLinkType }) {
  switch (type) {
    case "youtube":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case "facebook":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case "instagram":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      );
    case "photo_album":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "website":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "other":
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}