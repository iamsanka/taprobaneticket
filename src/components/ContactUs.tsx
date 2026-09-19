"use client";

import "./ContactUs.css";

export default function ContactUs() {
  return (
    <section className="contact-section">

      <div className="contact-title">Contact Us</div>

      <div className="contact-subtitle">
        We’re here to help — reach out to us for inquiries, collaborations, or event information.
      </div>

      <div className="contact-container">

        {/* LEFT SIDE — DETAILS */}
        <div className="contact-details">
          <h3>Get in Touch</h3>

          <p><strong>Email:</strong> info@taprobaneticket.com</p>
          <p><strong>Phone:</strong> +358 40 123 4567</p>
          <p><strong>Location:</strong> Espoo, Finland</p>
          <p>
            Whether you're planning an event, looking for collaboration, or need support,
            our team is ready to assist you.
          </p>
        </div>

        {/* RIGHT SIDE — FORM */}
        <div className="contact-form">
          <h3>Send Us a Message</h3>

          <input type="text" placeholder="Your Name" />
          <input type="email" placeholder="Your Email" />
          <textarea placeholder="Your Message"></textarea>

          <button>Send Message</button>
        </div>

      </div>

    </section>
  );
}
