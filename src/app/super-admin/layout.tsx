"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import "./layout.css";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });

    window.dispatchEvent(new Event("session-changed"));

    router.push("/login");
  }

  return (
    <div className="super-admin-layout">
      <aside className="sidebar">
        <h2 className="sidebar-title">Super Admin</h2>

        <nav className="sidebar-nav">
          <Link href="/super-admin/dashboard">Dashboard</Link>
          <Link href="/super-admin/users">Users</Link>
          <Link href="/super-admin/settings">Settings</Link>
        </nav>

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
