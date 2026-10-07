"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./images.css";

export default function EventImagesPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const eventId = params.id;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

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

  async function uploadImage(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append("eventId", eventId);
    formData.append("file", file);

    const res = await fetch("/api/super-admin/events/images", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setUploading(false);

    if (data.success) {
      alert("Image uploaded!");
      setEvent(data.event);
    } else {
      alert(data.error || "Upload failed");
    }
  }

  if (loading) {
    return <p className="loading-text">Loading event...</p>;
  }

  return (
    <div className="event-images-page">
      <h1>Event Images</h1>

      <div className="section">
        <h2>Cover Image</h2>

        {event.coverImage ? (
          <img src={event.coverImage} alt="cover" className="cover-preview" />
        ) : (
          <p className="empty-text">No cover image uploaded.</p>
        )}

        <label className="upload-btn">
          Upload New Cover Image
          <input type="file" onChange={uploadImage} hidden />
        </label>
      </div>

      <div className="section">
        <h2>Gallery Images</h2>

        <div className="gallery-grid">
          {Array.isArray(event.galleryImages) &&
            event.galleryImages.map((img: string, i: number) => (
              <img key={i} src={img} alt="gallery" className="gallery-img" />
            ))}
        </div>

        <label className="upload-btn">
          Upload Gallery Image
          <input type="file" onChange={uploadImage} hidden />
        </label>
      </div>

      <button
        className="btn-secondary"
        onClick={() => router.push("/super-admin/events")}
      >
        Back to Events
      </button>
    </div>
  );
}
