"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import "../Users.css";

type User = {
  id: number;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "AUDIT" | "STAFF" | "CUSTOMER";
  isActive: boolean;
  createdAt: string;
};

type EditableRole = "ADMIN" | "STAFF" | "AUDIT";

const ROLE_OPTIONS: {
  value: EditableRole;
  title: string;
  description: string;
}[] = [
  {
    value: "ADMIN",
    title: "Admin",
    description:
      "Can manage orders, confirm benefit payments, and scan tickets. Cannot create events or users.",
  },
  {
    value: "STAFF",
    title: "Staff",
    description:
      "Door staff. Can only use the scanner to validate tickets at the entrance.",
  },
  {
    value: "AUDIT",
    title: "Audit",
    description:
      "Read-only access to orders, users, and reports. Cannot modify anything.",
  },
];

const MIN_PASSWORD_LENGTH = 8;

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const userId = params?.id as string;

  // Detect which tree we're rendered under
  const basePath = pathname?.startsWith("/admin")
    ? "/admin/users"
    : "/super-admin/users";

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [role, setRole] = useState<EditableRole>("STAFF");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Password reset state
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      try {
        const res = await fetch(`/api/super-admin/users/${userId}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error || `Failed to load user (${res.status})`);
          return;
        }
        const data = await res.json();
        const u: User = data.user;

        if (u.role === "SUPER_ADMIN") {
          setError("SUPER_ADMIN accounts cannot be edited here.");
          setUser(u);
          return;
        }

        setUser(u);
        setRole(u.role as EditableRole);
        setIsActive(u.isActive);
      } catch (err) {
        console.error(err);
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [userId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const nothingChanged = role === user.role && isActive === user.isActive;
    if (nothingChanged) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role, isActive }),
      });
      const body = await res.json();

      if (!res.ok) {
        alert(body.error || "Failed to save changes");
        return;
      }

      setUser({ ...user, role, isActive });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      alert(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    const ok = window.confirm(
      `Set a new password for ${user.email}?\n\nThe old password will stop working immediately.`
    );
    if (!ok) return;

    setResetting(true);
    try {
      const res = await fetch(
        `/api/super-admin/users/${user.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newPassword }),
        }
      );
      const body = await res.json();

      if (!res.ok) {
        alert(body.error || "Failed to reset password");
        return;
      }

      alert("Password updated. Share the new password with the user.");
      setNewPassword("");
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setResetting(false);
    }
  }

  async function handleDelete() {
    if (!user) return;

    const ok = window.confirm(
      `Permanently delete ${user.email}?\n\n` +
        `This action cannot be undone. The account will be removed from the system.\n\n` +
        `Their historical actions (orders, scans) will remain but reference a deleted account.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/super-admin/users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await res.json();

      if (!res.ok) {
        alert(body.error || "Failed to delete user");
        return;
      }

      router.push(basePath);
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setDeleting(false);
    }
  }

  // ---- Loading / error states ----
  if (loading) {
    return (
      <div className="sa-users">
        <div className="sa-users-empty">Loading user…</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="sa-users">
        <Link href={basePath} className="sa-back-link">
          ← Back to Users
        </Link>
        <div className="sa-users-error">{error}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="sa-users">
        <Link href={basePath} className="sa-back-link">
          ← Back to Users
        </Link>
        <div className="sa-users-empty">User not found.</div>
      </div>
    );
  }

  // ---- SUPER_ADMIN guard ----
  if (user.role === "SUPER_ADMIN") {
    return (
      <div className="sa-users">
        <Link href={basePath} className="sa-back-link">
          ← Back to Users
        </Link>
        <div className="sa-user-form-header">
          <h1 className="sa-users-title">Protected Account</h1>
        </div>
        <div className="sa-user-warning">
          SUPER_ADMIN accounts cannot be modified through this page. Contact
          your database administrator if you need to change a super admin's
          credentials.
        </div>
      </div>
    );
  }

  return (
    <div className="sa-users">
      <div className="sa-user-form-header">
        <Link href={basePath} className="sa-back-link">
          ← Back to Users
        </Link>
        <h1 className="sa-users-title">Edit User</h1>
        <p className="sa-users-subtitle">{user.email}</p>
      </div>

      {/* ============ Account info ============ */}
      <form onSubmit={handleSave} className="sa-user-form">
        <section className="sa-user-form-card">
          <h2 className="sa-user-form-card-title">Account</h2>

          <label className="sa-form-field">
            <span className="sa-form-label">Email address</span>
            <input
              type="email"
              className="sa-form-input"
              value={user.email}
              disabled
              readOnly
            />
            <span className="sa-form-hint">
              Email cannot be changed. Create a new user if the email needs to
              be different.
            </span>
          </label>

          <label className="sa-form-field">
            <span className="sa-form-label">Created</span>
            <input
              type="text"
              className="sa-form-input"
              value={formatDate(user.createdAt)}
              disabled
              readOnly
            />
          </label>
        </section>

        {/* ============ Role ============ */}
        <section className="sa-user-form-card">
          <h2 className="sa-user-form-card-title">Role</h2>
          <div className="sa-role-options">
            {ROLE_OPTIONS.map((option) => {
              const selected = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`sa-role-option ${selected ? "selected" : ""}`}
                  onClick={() => setRole(option.value)}
                >
                  <div className="sa-role-radio">
                    {selected && <span className="sa-role-radio-dot" />}
                  </div>
                  <div className="sa-role-option-text">
                    <div className="sa-role-option-title">{option.title}</div>
                    <div className="sa-role-option-desc">
                      {option.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ============ Status ============ */}
        <section className="sa-user-form-card">
          <h2 className="sa-user-form-card-title">Status</h2>

          {!isActive && (
            <div className="sa-user-warning">
              <strong>This account is deactivated.</strong> The user cannot log
              in. You can reactivate them at any time.
            </div>
          )}

          <div className="sa-role-options">
            <button
              type="button"
              className={`sa-role-option ${isActive ? "selected" : ""}`}
              onClick={() => setIsActive(true)}
            >
              <div className="sa-role-radio">
                {isActive && <span className="sa-role-radio-dot" />}
              </div>
              <div className="sa-role-option-text">
                <div className="sa-role-option-title">Active</div>
                <div className="sa-role-option-desc">
                  Can log in and use the admin panel according to their role.
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`sa-role-option ${!isActive ? "selected" : ""}`}
              onClick={() => setIsActive(false)}
            >
              <div className="sa-role-radio">
                {!isActive && <span className="sa-role-radio-dot" />}
              </div>
              <div className="sa-role-option-text">
                <div className="sa-role-option-title">Deactivated</div>
                <div className="sa-role-option-desc">
                  Cannot log in. History preserved. Recommended before
                  deleting.
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* ============ Save row ============ */}
        <div className="sa-user-form-actions">
          {savedSuccess && <span className="sa-save-toast">✓ Saved</span>}
          <Link
            href={basePath}
            className="sa-user-form-btn sa-user-form-btn-cancel"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="sa-user-form-btn sa-user-form-btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>

      {/* ============ Password reset ============ */}
      <form
        onSubmit={handleResetPassword}
        className="sa-user-form"
        style={{ marginTop: 16 }}
      >
        <section className="sa-user-form-card">
          <h2 className="sa-user-form-card-title">Reset Password</h2>
          <div className="sa-user-info">
            The current password will stop working immediately. Share the new
            password with the user out-of-band.
          </div>

          <label className="sa-form-field">
            <span className="sa-form-label">New password</span>
            <input
              type="text"
              className="sa-form-input sa-form-input-mono"
              placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
            />
          </label>

          <div className="sa-user-form-actions">
            <button
              type="submit"
              className="sa-user-form-btn sa-user-form-btn-primary"
              disabled={
                resetting || newPassword.length < MIN_PASSWORD_LENGTH
              }
            >
              {resetting ? "Updating…" : "Reset Password"}
            </button>
          </div>
        </section>
      </form>

      {/* ============ Danger zone ============ */}
      <section
        className="sa-user-form-card"
        style={{ marginTop: 16, borderColor: "#fecaca" }}
      >
        <h2 className="sa-user-form-card-title" style={{ color: "#991b1b" }}>
          Danger Zone
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            margin: "0 0 16px 0",
            lineHeight: 1.6,
          }}
        >
          Permanently delete this user. Only possible after deactivating them
          (see Status above). Historical records will reference a deleted
          account.
        </p>
        <button
          type="button"
          className="sa-user-form-btn sa-user-form-btn-danger"
          disabled={isActive || deleting}
          onClick={handleDelete}
          title={
            isActive
              ? "Deactivate this user first to enable deletion"
              : "Delete user permanently"
          }
        >
          {deleting ? "Deleting…" : "Delete User"}
        </button>
        {isActive && (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              marginTop: 10,
            }}
          >
            Deactivate this user first to enable deletion.
          </p>
        )}
      </section>
    </div>
  );
}

// ======================================================
// Helpers
// ======================================================

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}