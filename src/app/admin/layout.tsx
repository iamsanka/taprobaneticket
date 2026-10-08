"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import "../super-admin/layout.css";

type SectionKey = "orders" | "finance" | "users";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

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

        if (me.role === "ADMIN" || me.role === "SUPER_ADMIN") {
          setAuthorized(true);
          return;
        }

        if (me.role === "AUDIT") router.replace("/audit/dashboard");
        else if (me.role === "STAFF") router.replace("/staff/dashboard");
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

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    orders: true,
    finance: true,
    users: true,
  });

  useEffect(() => {
    if (!pathname) return;
    setOpenSections((prev) => {
      const next = { ...prev };
      if (pathname.startsWith("/admin/orders")) next.orders = true;
      if (pathname.startsWith("/admin/finance")) next.finance = true;
      if (pathname.startsWith("/admin/users")) next.users = true;
      return next;
    });
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("session-changed"));
    router.push("/login");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      try {
        const res = await fetch("/api/super-admin/orders/pending-benefit", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setPendingCount((data.orders ?? []).length);
        }
      } catch {
        // ignore
      }
    }

    loadCount();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const isOrdersActive = pathname?.startsWith("/admin/orders");
  const isFinanceActive = pathname?.startsWith("/admin/finance");
  const isFinanceDashboardActive = pathname === "/admin/finance";
  const isFinanceIncomeActive = pathname?.startsWith("/admin/finance/income");
  const isFinanceExpensesActive = pathname?.startsWith(
    "/admin/finance/expenses"
  );
  const isEmailsActive = pathname?.startsWith("/admin/emails");
  const isDiscountsActive = pathname?.startsWith("/admin/discounts");
  // ⭐ NEW
  const isRafflesActive = pathname?.startsWith("/admin/raffles");
  const isReportsActive =
    pathname === "/admin/reports" ||
    pathname?.startsWith("/admin/reports/");
  const isScannerActive = pathname === "/admin/scanner";

  const isUsersActive = pathname?.startsWith("/admin/users");
  const isCreateUserActive = pathname === "/admin/users/new";
  const isUsersListActive = isUsersActive && !isCreateUserActive;

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
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">
                Taprobane<span className="sidebar-brand-accent">Ticket</span>
              </span>
              <span className="sidebar-brand-role">Admin</span>
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
            href="/admin/dashboard"
            className={`sidebar-link ${
              pathname === "/admin/dashboard" ? "active" : ""
            }`}
            title={collapsed ? "Dashboard" : undefined}
          >
            <SidebarIcon name="dashboard" />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {/* 2. Orders */}
          {collapsed ? (
            <Link
              href="/admin/orders"
              className={`sidebar-link ${isOrdersActive ? "active" : ""}`}
              title="Orders"
            >
              <SidebarIcon name="orders" />
            </Link>
          ) : (
            <div className="sidebar-section">
              <button
                type="button"
                className={`sidebar-section-title sidebar-section-toggle ${
                  isOrdersActive ? "active" : ""
                }`}
                onClick={() => toggleSection("orders")}
                aria-expanded={openSections.orders}
              >
                <SidebarIcon name="orders" />
                <span>Orders</span>
                {pendingCount > 0 && (
                  <span className="sidebar-badge">{pendingCount}</span>
                )}
                <span
                  className={`sidebar-chevron ${
                    openSections.orders ? "open" : ""
                  }`}
                >
                  <ChevronIcon />
                </span>
              </button>

              {openSections.orders && (
                <div className="sidebar-submenu">
                  <Link
                    href="/admin/orders"
                    className={`sidebar-sublink ${
                      pathname === "/admin/orders" ? "active" : ""
                    }`}
                  >
                    Pending Benefits
                  </Link>
                  <Link
                    href="/admin/orders/all"
                    className={`sidebar-sublink ${
                      pathname === "/admin/orders/all" ? "active" : ""
                    }`}
                  >
                    All Orders
                  </Link>
                  <Link
                    href="/admin/orders/cancelled"
                    className={`sidebar-sublink ${
                      pathname === "/admin/orders/cancelled" ? "active" : ""
                    }`}
                  >
                    Cancelled
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* 3. Finance */}
          {collapsed ? (
            <Link
              href="/admin/finance"
              className={`sidebar-link ${isFinanceActive ? "active" : ""}`}
              title="Finance"
            >
              <SidebarIcon name="finance" />
            </Link>
          ) : (
            <div className="sidebar-section">
              <button
                type="button"
                className={`sidebar-section-title sidebar-section-toggle ${
                  isFinanceActive ? "active" : ""
                }`}
                onClick={() => toggleSection("finance")}
                aria-expanded={openSections.finance}
              >
                <SidebarIcon name="finance" />
                <span>Finance</span>
                <span
                  className={`sidebar-chevron ${
                    openSections.finance ? "open" : ""
                  }`}
                >
                  <ChevronIcon />
                </span>
              </button>

              {openSections.finance && (
                <div className="sidebar-submenu">
                  <Link
                    href="/admin/finance"
                    className={`sidebar-sublink ${
                      isFinanceDashboardActive ? "active" : ""
                    }`}
                  >
                    Overview
                  </Link>
                  <Link
                    href="/admin/finance/income"
                    className={`sidebar-sublink ${
                      isFinanceIncomeActive ? "active" : ""
                    }`}
                  >
                    Income
                  </Link>
                  <Link
                    href="/admin/finance/expenses"
                    className={`sidebar-sublink ${
                      isFinanceExpensesActive ? "active" : ""
                    }`}
                  >
                    Expenses
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* 4. Emails */}
          <Link
            href="/admin/emails"
            className={`sidebar-link ${isEmailsActive ? "active" : ""}`}
            title={collapsed ? "Emails" : undefined}
          >
            <SidebarIcon name="emails" />
            {!collapsed && <span>Emails</span>}
          </Link>

          {/* 5. Discounts */}
          <Link
            href="/admin/discounts"
            className={`sidebar-link ${isDiscountsActive ? "active" : ""}`}
            title={collapsed ? "Discounts" : undefined}
          >
            <SidebarIcon name="discounts" />
            {!collapsed && <span>Discounts</span>}
          </Link>

          {/* ⭐ 6. Raffles — NEW */}
          <Link
            href="/admin/raffles"
            className={`sidebar-link ${isRafflesActive ? "active" : ""}`}
            title={collapsed ? "Raffles" : undefined}
          >
            <SidebarIcon name="raffles" />
            {!collapsed && <span>Raffles</span>}
          </Link>

          {/* 7. Reports */}
          <Link
            href="/admin/reports"
            className={`sidebar-link ${isReportsActive ? "active" : ""}`}
            title={collapsed ? "Reports" : undefined}
          >
            <SidebarIcon name="reports" />
            {!collapsed && <span>Reports</span>}
          </Link>

          {/* 8. Scanner */}
          <Link
            href="/admin/scanner"
            className={`sidebar-link ${isScannerActive ? "active" : ""}`}
            title={collapsed ? "Scanner" : undefined}
          >
            <SidebarIcon name="scanner" />
            {!collapsed && <span>Scanner</span>}
          </Link>

          {/* 9. Users */}
          {collapsed ? (
            <Link
              href="/admin/users"
              className={`sidebar-link ${isUsersActive ? "active" : ""}`}
              title="Users"
            >
              <SidebarIcon name="users" />
            </Link>
          ) : (
            <div className="sidebar-section">
              <button
                type="button"
                className={`sidebar-section-title sidebar-section-toggle ${
                  isUsersActive ? "active" : ""
                }`}
                onClick={() => toggleSection("users")}
                aria-expanded={openSections.users}
              >
                <SidebarIcon name="users" />
                <span>Users</span>
                <span
                  className={`sidebar-chevron ${
                    openSections.users ? "open" : ""
                  }`}
                >
                  <ChevronIcon />
                </span>
              </button>

              {openSections.users && (
                <div className="sidebar-submenu">
                  <Link
                    href="/admin/users"
                    className={`sidebar-sublink ${
                      isUsersListActive ? "active" : ""
                    }`}
                  >
                    All Users
                  </Link>
                  <Link
                    href="/admin/users/new"
                    className={`sidebar-sublink ${
                      isCreateUserActive ? "active" : ""
                    }`}
                  >
                    Create User
                  </Link>
                </div>
              )}
            </div>
          )}
        </nav>

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

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SidebarIcon({
  name,
}: {
  name:
    | "dashboard"
    | "orders"
    | "scanner"
    | "reports"
    | "finance"
    | "emails"
    | "discounts"
    | "raffles"
    | "users"
    | "logout";
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
    case "orders":
      return (
        <svg {...common}>
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
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
    case "reports":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 15l4-4 3 3 5-6" />
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
    case "emails":
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case "discounts":
      return (
        <svg {...common}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case "raffles":
      // ⭐ Trophy icon
      return (
        <svg {...common}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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