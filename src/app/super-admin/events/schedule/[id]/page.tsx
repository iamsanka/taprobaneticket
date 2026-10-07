"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./schedule.css";

export default function EventSchedulePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const eventId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState<any>(null);

  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    async function loadEvent() {
      const res = await fetch(`/api/super-admin/events/get?id=${eventId}`);
      const data = await res.json();

      if (!data.event) {
        alert("Event not found");
        router.push("/super-admin/events");
        return;
      }

      setEvent(data.event);

      setForm({
        startDate: data.event.startDate ? data.event.startDate.slice(0, 16) : "",
        endDate: data.event.endDate ? data.event.endDate.slice(0, 16) : "",
      });

      setLoading(false);
    }

    loadEvent();
  }, [eventId, router]);

  async function saveSchedule() {
    setSaving(true);

    const res = await fetch("/api/super-admin/events/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Number(eventId),
        startDate: form.startDate,
        endDate: form.endDate,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (data.success) {
      alert("Schedule updated successfully!");
      router.push("/super-admin/events");
    } else {
      alert(data.error || "Something went wrong");
    }
  }

  if (loading) {
    return <p className="loading-text">Loading schedule...</p>;
  }

  return (
    <div className="schedule-page">
      <h1>Edit Event Schedule</h1>

      <div className="event-info-box">
        <h2>{event.title}</h2>
        <p>{event.description}</p>
      </div>

      <div className="form-group">
        <label>Start Date & Time</label>
        <input
          type="datetime-local"
          className="input"
          value={form.startDate}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label>End Date & Time</label>
        <input
          type="datetime-local"
          className="input"
          value={form.endDate}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
        />
      </div>

      <button className="btn-primary" onClick={saveSchedule} disabled={saving}>
        {saving ? "Saving..." : "Save Schedule"}
      </button>

      <button
        className="btn-secondary"
        onClick={() => router.push("/super-admin/events")}
      >
        Back to Events
      </button>
    </div>
  );
}
