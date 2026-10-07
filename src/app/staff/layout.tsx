"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import "../super-admin/layout.css";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // ---- Role guard ----
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkRole() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const me = await res.json();
        if (cancelled) return;

        if (
          me.role === "STAFF" ||
          me.role === "ADMIN" ||
          me.role === "SUPER_ADMIN"
        ) {
          setAuthorized(true);
          return;
        }

        if (me.role === "AUDIT") router.replace("/audit/dashboard");
        else router.replace("/login");
      } catch {
        if (!cancelled) router.replace("/login");
      }
    }

    checkRole();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("session-changed"));
    router.push("/login");
  }

  const isDashboardActive = pathname === "/staff/dashboard";
  const isFinanceActive = pathname?.startsWith("/staff/finance");
  const isReportsActive =
    pathname === "/staff/reports" ||
    pathname?.startsWith("/staff/reports/");
  const isScannerActive = pathname === "/staff/scanner";

  if (authorized !== true) {
    return (
      <div className="super-admin-layout">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            width: "100%",
            color: "var(--color-text-muted)",
            fontSize: 14,
          }}
        >
          Checking access…
        </div>
      </div>
    );
  }

  return (
    <div className={`super-admin-layout ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        {/* ---- Brand row ---- */}
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">
                Taprobane<span className="sidebar-brand-accent">Ticket</span>
              </span>
              <span className="sidebar-brand-role">Staff</span>
            </div>
          )}
          <button
            className="collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="sidebar-nav">
          {/* 1. Dashboard */}
          <Link
            href="/staff/dashboard"
            className={`sidebar-link ${
              isDashboardActive ? "active" : ""
            }`}
            title={collapsed ? "Dashboard" : undefined}
          >
            <SidebarIcon name="dashboard" />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {/* 2. Finance */}
          <Link
            href="/staff/finance"
            className={`sidebar-link ${isFinanceActive ? "active" : ""}`}
            title={collapsed ? "Finance" : undefined}
          >
            <SidebarIcon name="finance" />
            {!collapsed && <span>Finance</span>}
          </Link>


          {/* 3. Scanner */}
          <Link
            href="/staff/scanner"
            className={`sidebar-link ${isScannerActive ? "active" : ""}`}
            title={collapsed ? "Scanner" : undefined}
          >
            <SidebarIcon name="scanner" />
            {!collapsed && <span>Scanner</span>}
          </Link>
        </nav>

        {/* ---- Footer: logout ---- */}
        <div className="sidebar-footer">
          <button
            className="logout-btn"
            onClick={logout}
            title={collapsed ? "Logout" : undefined}
          >
            <SidebarIcon name="logout" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

// ======================================================
// Icons
// ======================================================

function SidebarIcon({
  name,
}: {
  name: "dashboard" | "finance" | "reports" | "scanner" | "logout";
}) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "sidebar-icon",
  };

  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 15l4-4 3 3 5-6" />
        </svg>
      );
    case "scanner":
      return (
        <svg {...common}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
  }
}