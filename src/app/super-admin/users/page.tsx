"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import "./Users.css";

type User = {
  id: number;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "AUDIT" | "STAFF" | "CUSTOMER";
  isActive: boolean;
  createdAt: string;
};

type RoleFilter = "all" | User["role"];

export default function SuperAdminUsersPage() {
  const router = useRouter();
  const pathname = usePathname();

  // Detect which prefix we're rendered under so links stay in-tree.
  // /admin/users → basePath "/admin/users"
  // /super-admin/users → basePath "/super-admin/users"
  const basePath = pathname?.startsWith("/admin")
    ? "/admin/users"
    : "/super-admin/users";

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/super-admin/users", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load users (${res.status})`);
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(user: User) {
    const next = !user.isActive;
    const ok = window.confirm(
      next
        ? `Activate ${user.email}?\n\nThey will be able to log in again.`
        : `Deactivate ${user.email}?\n\nThey will no longer be able to log in. Their history is preserved.`
    );
    if (!ok) return;

    setTogglingId(user.id);
    try {
      const res = await fetch(`/api/super-admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: next }),
      });
      const body = await res.json();

      if (!res.ok) {
        alert(body.error || "Failed to update");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: next } : u))
      );
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setTogglingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (q && !u.email.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.id - a.id);
  }, [users, search, roleFilter]);

  const counts = useMemo(() => {
    const map: Record<RoleFilter, number> = {
      all: users.length,
      SUPER_ADMIN: 0,
      ADMIN: 0,
      AUDIT: 0,
      STAFF: 0,
      CUSTOMER: 0,
    };
    for (const u of users) map[u.role] += 1;
    return map;
  }, [users]);

  const FILTERS: { key: RoleFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "SUPER_ADMIN", label: "Super Admins" },
    { key: "ADMIN", label: "Admins" },
    { key: "STAFF", label: "Staff" },
    { key: "AUDIT", label: "Audit" },
  ];

  return (
    <div className="sa-users">
      <header className="sa-users-header">
        <div>
          <h1 className="sa-users-title">Users</h1>
          <p className="sa-users-subtitle">
            Manage admin, staff, and audit accounts
          </p>
        </div>
        <Link href={`${basePath}/new`} className="sa-users-create-btn">
          + Create User
        </Link>
      </header>

      {loading && <div className="sa-users-empty">Loading users…</div>}
      {error && <div className="sa-users-error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="sa-controls">
            <div className="sa-search-wrap">
              <svg
                className="sa-search-icon"
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
                className="sa-search-input"
                placeholder="Search by email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="sa-search-clear"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="sa-filter-tabs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`sa-filter-tab ${
                  roleFilter === f.key ? "active" : ""
                }`}
                onClick={() => setRoleFilter(f.key)}
              >
                {f.label}
                {counts[f.key] > 0 && (
                  <span className="sa-filter-count">{counts[f.key]}</span>
                )}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="sa-users-empty">
              {users.length === 0
                ? "No users yet. Create your first one."
                : "No users match your filters."}
            </div>
          ) : (
            <div className="sa-users-table-wrap">
              <table className="sa-users-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="sa-td-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isSuperAdmin = u.role === "SUPER_ADMIN";
                    return (
                      <tr
                        key={u.id}
                        onClick={() =>
                          !isSuperAdmin
                            ? router.push(`${basePath}/${u.id}`)
                            : undefined
                        }
                        style={{
                          cursor: isSuperAdmin ? "default" : "pointer",
                        }}
                      >
                        <td>
                          <span className="sa-user-email">{u.email}</span>
                        </td>
                        <td>
                          <RolePill role={u.role} />
                        </td>
                        <td>
                          <span
                            className={`sa-status-pill ${
                              u.isActive ? "active" : "inactive"
                            }`}
                          >
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="sa-user-date">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="sa-td-right">
                          {!isSuperAdmin && (
                            <div className="sa-user-actions">
                              <Link
                                href={`${basePath}/${u.id}`}
                                className="sa-user-action-btn"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Edit
                              </Link>
                              <button
                                className={`sa-user-action-btn ${
                                  u.isActive ? "danger" : "success"
                                }`}
                                disabled={togglingId === u.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleActive(u);
                                }}
                              >
                                {togglingId === u.id
                                  ? "…"
                                  : u.isActive
                                  ? "Deactivate"
                                  : "Activate"}
                              </button>
                            </div>
                          )}
                          {isSuperAdmin && (
                            <span className="sa-user-locked">Protected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="sa-results-count">
            Showing {filtered.length} of {users.length} users
          </p>
        </>
      )}
    </div>
  );
}

// ======================================================
// Sub-components
// ======================================================

function RolePill({ role }: { role: User["role"] }) {
  const map: Record<User["role"], string> = {
    SUPER_ADMIN: "sa-role-super",
    ADMIN: "sa-role-admin",
    STAFF: "sa-role-staff",
    AUDIT: "sa-role-audit",
    CUSTOMER: "sa-role-customer",
  };
  const label = role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`sa-role-pill ${map[role]}`}>{label}</span>;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}