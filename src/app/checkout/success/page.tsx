"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./success.css";

type Order = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalPrice: number;
};

export default function CheckoutSuccessPage() {
  const [order, setOrder] = useState<Order | null>(null);
  const [ticketCount, setTicketCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const intent = localStorage.getItem("lastPaymentIntent");
    if (!intent) {
      setLoading(false);
      return;
    }

    async function loadOrder() {
      const res = await fetch(`/api/orders/by-intent?id=${intent}`);
      const data = await res.json();

      if (res.ok) {
        setOrder(data.order);
        setTicketCount(data.tickets?.length ?? 0);
      }

      setLoading(false);
    }

    loadOrder();
  }, []);

  if (loading) {
    return (
      <div className="success-page">
        <div className="success-card">
          <div className="success-spinner" />
          <p className="success-loading-text">Loading your order…</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="success-page">
        <div className="success-card">
          <div className="success-icon success-icon-error">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h1 className="success-title">Order not found</h1>
          <p className="success-message">
            We couldn't find this order. If you've already paid, please check your
            email for the confirmation. Otherwise, try making the purchase again.
          </p>
          <Link href="/" className="success-btn success-btn-primary">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="success-page">
      <div className="success-card">
        {/* Success icon */}
        <div className="success-icon success-icon-success">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="success-title">Payment Successful</h1>
        <p className="success-subtitle">
          Thank you for your purchase, {order.customerName.split(" ")[0]}!
        </p>

        {/* Email notice */}
        <div className="success-notice">
          <div className="success-notice-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <p className="success-notice-title">Tickets sent to your email</p>
            <p className="success-notice-text">
              We've emailed {ticketCount} {ticketCount === 1 ? "ticket" : "tickets"} to{" "}
              <strong>{order.customerEmail}</strong>. Each ticket is a separate PDF
              with its own QR code.
            </p>
          </div>
        </div>

        {/* Order summary */}
        <div className="success-summary">
          <div className="success-summary-row">
            <span className="success-summary-label">Order number</span>
            <span className="success-summary-value">{order.orderNumber}</span>
          </div>
          <div className="success-summary-row">
            <span className="success-summary-label">Tickets</span>
            <span className="success-summary-value">{ticketCount}</span>
          </div>
          <div className="success-summary-row success-summary-row-total">
            <span className="success-summary-label">Total paid</span>
            <span className="success-summary-value">
              €{(order.totalPrice / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* What's next */}
        <div className="success-steps">
          <p className="success-steps-title">What's next?</p>
          <ol className="success-steps-list">
            <li>Check your inbox for the ticket email (also check spam).</li>
            <li>Download the PDF tickets - one per attendee.</li>
            <li>Present each QR code at the entrance to be scanned.</li>
          </ol>
        </div>

        {/* Actions */}
        <div className="success-actions">
          <Link href="/" className="success-btn success-btn-primary">
            Back to Home
          </Link>
        </div>

        {/* Footer */}
        <p className="success-footer">
          Need help? Contact us at{" "}
          <a href="mailto:orders@restaurantapp.eu.org">
            orders@restaurantapp.eu.org
          </a>
        </p>
      </div>
    </div>
  );
}