"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./categories.css";

type TicketType = {
  id: number;
  name: string;
};

type Category = {
  id: number;
  name: string;
  ticketTypes: TicketType[];
};

export default function TicketCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadCategories() {
    setError(null);
    try {
      const res = await fetch("/api/super-admin/ticket-categories/list", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/super-admin/ticket-categories/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: deleteTarget.id }),
      });

      const data = await res.json();

      if (data.success) {
        setCategories((prev) =>
          prev.filter((c) => c.id !== deleteTarget.id)
        );
        setDeleteTarget(null);
      } else {
        setError(data.error || "Failed to delete category");
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error(err);
      setError("Network error");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // ---- Filter by search ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      return c.ticketTypes.some((t) => t.name.toLowerCase().includes(q));
    });
  }, [categories, search]);

  return (
    <div className="tc-page">
      {/* ---- Header ---- */}
      <header className="tc-header">
        <div>
          <h1 className="tc-title">Ticket Categories</h1>
          <p className="tc-subtitle">
            Manage categories and the ticket types inside them
          </p>
        </div>
        <Link
          href="/super-admin/ticket-categories/create"
          className="tc-add-btn"
        >
          <PlusIcon />
          Create Category
        </Link>
      </header>

      {/* ---- Search + count ---- */}
      {!loading && categories.length > 0 && (
        <div className="tc-controls">
          <div className="tc-search-wrap">
            <svg
              className="tc-search-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="tc-search-input"
              placeholder="Search by category or type name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="tc-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <span className="tc-count">
            {filtered.length} of {categories.length}{" "}
            {categories.length === 1 ? "category" : "categories"}
          </span>
        </div>
      )}

      {/* ---- Loading ---- */}
      {loading && (
        <div className="tc-state">
          <div className="tc-state-spinner" />
          <p className="tc-state-text">Loading categories…</p>
        </div>
      )}

      {/* ---- Error ---- */}
      {error && <div className="tc-error">{error}</div>}

      {/* ---- Empty (no categories at all) ---- */}
      {!loading && !error && categories.length === 0 && (
        <div className="tc-state">
          <div className="tc-state-icon">
            <TagIcon />
          </div>
          <p className="tc-state-title">No ticket categories yet</p>
          <p className="tc-state-text">
            Create your first category to start organising ticket types.
          </p>
          <Link
            href="/super-admin/ticket-categories/create"
            className="tc-state-btn"
          >
            <PlusIcon />
            Create Category
          </Link>
        </div>
      )}

      {/* ---- Empty (search returned nothing) ---- */}
      {!loading &&
        !error &&
        categories.length > 0 &&
        filtered.length === 0 && (
          <div className="tc-state">
            <p className="tc-state-title">No matching categories</p>
            <p className="tc-state-text">
              Try a different search term.
            </p>
            <button
              className="tc-state-btn"
              onClick={() => setSearch("")}
            >
              Clear search
            </button>
          </div>
        )}

      {/* ---- Grid ---- */}
      {!loading && !error && filtered.length > 0 && (
        <div className="tc-grid">
          {filtered.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onDelete={() => setDeleteTarget(cat)}
            />
          ))}
        </div>
      )}

      {/* ---- Delete confirmation modal ---- */}
      {deleteTarget && (
        <div
          className="tc-modal-overlay"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="tc-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tc-modal-header">
              <h2 className="tc-modal-title">Delete Category</h2>
              <button
                className="tc-modal-close"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="tc-modal-body">
              <p className="tc-modal-text">
                Permanently delete{" "}
                <strong>{deleteTarget.name}</strong> and its{" "}
                {deleteTarget.ticketTypes.length}{" "}
                {deleteTarget.ticketTypes.length === 1 ? "type" : "types"}?
              </p>
              <div className="tc-modal-warning">
                <strong>Warning:</strong> If any events are already using
                this category, deletion will be rejected. You'll need to
                remove it from those events first.
              </div>
            </div>

            <div className="tc-modal-actions">
              <button
                className="tc-btn tc-btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="tc-btn tc-btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete Category"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================
// Category card
// ======================================================

function CategoryCard({
  category,
  onDelete,
}: {
  category: Category;
  onDelete: () => void;
}) {
  const typeCount = category.ticketTypes.length;

  return (
    <div className="tc-card">
      {/* ---- Header row ---- */}
      <div className="tc-card-header">
        <div className="tc-card-title-row">
          <span className="tc-card-icon">
            <TagIcon />
          </span>
          <h2 className="tc-card-name">{category.name}</h2>
        </div>
        <span className="tc-card-count">
          {typeCount} {typeCount === 1 ? "type" : "types"}
        </span>
      </div>

      {/* ---- Types list ---- */}
      <div className="tc-card-body">
        {typeCount === 0 ? (
          <p className="tc-card-empty">No ticket types added yet.</p>
        ) : (
          <div className="tc-chips">
            {category.ticketTypes.map((t) => (
              <span key={t.id} className="tc-chip">
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ---- Actions ---- */}
      <div className="tc-card-actions">
        <Link
          href={`/super-admin/ticket-categories/edit/${category.id}`}
          className="tc-btn tc-btn-ghost tc-btn-sm"
        >
          <EditIcon />
          Edit
        </Link>
        <button
          className="tc-btn tc-btn-danger-outline tc-btn-sm"
          onClick={onDelete}
        >
          <TrashIcon />
          Delete
        </button>
      </div>
    </div>
  );
}

// ======================================================
// Icons
// ======================================================

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}