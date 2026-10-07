"use client";

import { useState } from "react";
import "./ContactUs.css";

type FormState = {
  name: string;
  email: string;
  message: string;
};

const INITIAL_FORM: FormState = { name: "", email: "", message: "" };

const CONTACT_ITEMS = [
  {
    key: "email",
    label: "Email",
    value: "info@taprobaneticket.com",
    href: "mailto:info@taprobaneticket.com",
    icon: "mail" as const,
  },
  {
    key: "phone",
    label: "Phone",
    value: "+358 40 123 4567",
    href: "tel:+358401234567",
    icon: "phone" as const,
  },
  {
    key: "location",
    label: "Location",
    value: "Espoo, Finland",
    href: null,
    icon: "pin" as const,
  },
];

export default function ContactUs() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = "Please enter your name";
    if (!form.email.trim()) {
      next.email = "Please enter your email";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Please enter a valid email";
    }
    if (!form.message.trim()) next.message = "Please enter a message";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setStatus("sending");

    // No backend wired up yet — simulate a short delay.
    // Replace this with a real fetch("/api/contact", ...) when ready.
    await new Promise((r) => setTimeout(r, 800));

    setStatus("sent");
    setForm(INITIAL_FORM);

    // Return to idle after a few seconds so the form is reusable
    setTimeout(() => setStatus("idle"), 6000);
  }

  return (
    <section id="contact" className="contact-section">
      <div className="contact-shell">
        {/* ---- Header ---- */}
        <header className="contact-header">
          <span className="contact-eyebrow">Contact Us</span>
          <h2 className="contact-heading">
            Let's create something{" "}
            <span className="contact-heading-accent">memorable</span>
          </h2>
          <p className="contact-intro">
            Reach out for inquiries, collaborations, or event information, our
            team is ready to help.
          </p>
        </header>

        <div className="contact-container">
          {/* ---- Left: info card ---- */}
          <aside className="contact-info">
            <h3 className="contact-card-title">Get in Touch</h3>
            <p className="contact-card-text">
              Whether you're planning an event, exploring a collaboration, or
              need support, you'll hear back from a real person, usually within
              one business day.
            </p>

            <ul className="contact-list">
              {CONTACT_ITEMS.map((item) => (
                <li key={item.key} className="contact-list-item">
                  <span className="contact-list-icon">
                    <ContactIcon name={item.icon} />
                  </span>
                  <div className="contact-list-body">
                    <span className="contact-list-label">{item.label}</span>
                    {item.href ? (
                      <a href={item.href} className="contact-list-value">
                        {item.value}
                      </a>
                    ) : (
                      <span className="contact-list-value">{item.value}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          {/* ---- Right: form ---- */}
          <div className="contact-form-wrap">
            <h3 className="contact-card-title">Send Us a Message</h3>

            {status === "sent" ? (
              <div className="contact-success">
                <span className="contact-success-icon">
                  <CheckIcon />
                </span>
                <p className="contact-success-title">Message sent</p>
                <p className="contact-success-text">
                  Thanks for reaching out — we'll be in touch shortly.
                </p>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit} noValidate>
                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-name">
                    Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    className={`contact-input ${errors.name ? "error" : ""}`}
                    placeholder="Your full name"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    autoComplete="name"
                  />
                  {errors.name && (
                    <span className="contact-error">{errors.name}</span>
                  )}
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-email">
                    Email
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    className={`contact-input ${errors.email ? "error" : ""}`}
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    autoComplete="email"
                  />
                  {errors.email && (
                    <span className="contact-error">{errors.email}</span>
                  )}
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-message">
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    className={`contact-input contact-textarea ${
                      errors.message ? "error" : ""
                    }`}
                    placeholder="How can we help?"
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                    rows={5}
                  />
                  {errors.message && (
                    <span className="contact-error">{errors.message}</span>
                  )}
                </div>

                <button
                  type="submit"
                  className="contact-submit"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? "Sending…" : "Send Message"}
                  {status !== "sending" && <ArrowRightIcon />}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ======================================================
// Icons
// ======================================================

function ContactIcon({ name }: { name: "mail" | "phone" | "pin" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "mail":
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
  }
}

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

function CheckIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}