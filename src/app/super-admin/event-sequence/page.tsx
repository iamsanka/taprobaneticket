"use client";

import { useState } from "react";
import "./event-sequence.css";

export default function AdminEventSequencePage() {
  const [eventId, setEventId] = useState("");
  const [sequenceCode, setSequenceCode] = useState("");
  const [message, setMessage] = useState("");

  async function createSequence() {
    const res = await fetch("/api/event-sequence/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: Number(eventId),
        sequenceCode,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error);
      return;
    }

    setMessage("Sequence created successfully!");
    setEventId("");
    setSequenceCode("");
  }

  return (
    <div className="seq-container">
      <h1 className="seq-title">Create Event Sequence</h1>

      <div className="seq-form">
        <label>Event ID</label>
        <input
          type="number"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          placeholder="Enter event ID"
        />

        <label>Sequence Code</label>
        <input
          type="text"
          value={sequenceCode}
          onChange={(e) => setSequenceCode(e.target.value)}
          placeholder="Example: taprosa2233"
        />

        <button className="seq-btn" onClick={createSequence}>
          Create Sequence
        </button>

        {message && <p className="seq-message">{message}</p>}
      </div>
    </div>
  );
}
