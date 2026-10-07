"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./delete.css";

export default function DeleteEventPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const eventId = params.id;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

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
      setLoading(false);
    }

    loadEvent();
  }, [eventId, router]);

  async function deleteEvent() {
    setDeleting(true);

    const res = await fetch("/api/super-admin/events/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(eventId) }),
    });

    const data = await res.json();
    setDeleting(false);

    if (data.success) {
      alert("Event deleted successfully!");
      router.push("/super-admin/events");
    } else {
      alert(data.error || "Something went wrong");
    }
  }

  if (loading) {
    return <p className="loading-text">Loading event...</p>;
  }

  return (
    <div className="delete-event-page">
      <h1>Delete Event</h1>

      <div className="event-box">
        <h2>{event.title}</h2>
        <p>{event.description}</p>

        <p className="warning-text">
          Are you sure you want to delete this event?  
          <br />
          This action cannot be undone.
        </p>

        <div className="actions">
          <button
            className="btn-danger"
            onClick={deleteEvent}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Yes, Delete Event"}
          </button>

          <button
            className="btn-secondary"
            onClick={() => router.push("/super-admin/events")}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
