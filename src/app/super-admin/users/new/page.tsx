"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import "../Users.css";

type CreatableRole = "ADMIN" | "STAFF" | "AUDIT";

const ROLE_OPTIONS: {
  value: CreatableRole;
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

export default function CreateUserPage() {
  const router = useRouter();
  const pathname = usePathname();

  // Detect which tree we're rendered under so links stay in-tree
  const basePath = pathname?.startsWith("/admin")
    ? "/admin/users"
    : "/super-admin/users";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CreatableRole>("STAFF");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/super-admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          role,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to create user");
        return;
      }

      router.push(basePath);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sa-users">
      <div className="sa-user-form-header">
        <Link href={basePath} className="sa-back-link">
          ← Back to Users
        </Link>
        <h1 className="sa-users-title">Create User</h1>
        <p className="sa-users-subtitle">
          Add a new admin, staff, or audit account
        </p>
      </div>

      {error && <div className="sa-users-error">{error}</div>}

      <form onSubmit={handleSubmit} className="sa-user-form">
        <section className="sa-user-form-card">
          <h2 className="sa-user-form-card-title">Account Details</h2>

          <label className="sa-form-field">
            <span className="sa-form-label">Email address</span>
            <input
              type="email"
              className="sa-form-input"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              required
            />
            <span className="sa-form-hint">
              This will be the username. Cannot be changed later.
            </span>
          </label>

          <label className="sa-form-field">
            <span className="sa-form-label">Temporary password</span>
            <input
              type="text"
              className="sa-form-input sa-form-input-mono"
              placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              required
            />
            <span className="sa-form-hint">
              Share this with the user. They can change it later from their
              account.
            </span>
          </label>
        </section>

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

        <div className="sa-user-form-actions">
          <Link
            href={basePath}
            className="sa-user-form-btn sa-user-form-btn-cancel"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="sa-user-form-btn sa-user-form-btn-primary"
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create User"}
          </button>
        </div>
      </form>
    </div>
  );
}