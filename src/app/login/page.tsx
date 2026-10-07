"use client";

import { useState } from "react";
import "./Login.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Invalid credentials");
        setLoading(false);
        return;
      }

      // Ask the server who we are so we can redirect by role
      const meRes = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!meRes.ok) {
        // Fallback if /me is unavailable for some reason
        window.location.href = "/super-admin/dashboard";
        return;
      }

      const me = await meRes.json();

      switch (me.role) {
        case "SUPER_ADMIN":
          window.location.href = "/super-admin/dashboard";
          break;
        case "ADMIN":
          window.location.href = "/admin/dashboard";
          break;
        case "AUDIT":
          window.location.href = "/audit/dashboard";
          break;
        case "STAFF":
          window.location.href = "/staff/dashboard";
          break;
        default:
          window.location.href = "/";
          break;
      }
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="container" style={{ paddingTop: "120px" }}>
      <div className="login-wrapper">
        <h1>Admin Login</h1>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="off">
          <label>
            Email
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}