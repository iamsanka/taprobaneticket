"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./delete.css";

export default function DeleteCategoryPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const categoryId = params.id;

  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadCategory() {
      const res = await fetch(`/api/super-admin/ticket-categories/get?id=${categoryId}`);
      const data = await res.json();

      if (!data.category) {
        alert("Category not found");
        router.push("/super-admin/ticket-categories");
        return;
      }

      setCategory(data.category);
      setLoading(false);
    }

    loadCategory();
  }, [categoryId, router]);

  async function deleteCategory() {
    setDeleting(true);

    const res = await fetch("/api/super-admin/ticket-categories/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(categoryId) }),
    });

    const data = await res.json();
    setDeleting(false);

    if (data.success) {
      alert("Category deleted successfully!");
      router.push("/super-admin/ticket-categories");
    } else {
      alert(data.error || "Something went wrong");
    }
  }

  if (loading) {
    return <p className="loading-text">Loading category...</p>;
  }

  return (
    <div className="delete-category-page">
      <h1>Delete Ticket Category</h1>

      <div className="category-box">
        <h2>{category.name}</h2>

        <p className="category-meta">
          <strong>Event:</strong> {category.eventTitle || "Unknown Event"}
        </p>

        <p className="category-meta">
          <strong>Price:</strong> €{(category.price / 100).toFixed(2)}
        </p>

        <p className="category-meta">
          <strong>Limit:</strong> {category.limit}
        </p>

        <p className="warning-text">
          Are you sure you want to delete this ticket category?
          <br />
          This action cannot be undone.
        </p>

        <div className="actions">
          <button
            className="btn-danger"
            onClick={deleteCategory}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Yes, Delete Category"}
          </button>

          <button
            className="btn-secondary"
            onClick={() => router.push("/super-admin/ticket-categories")}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
