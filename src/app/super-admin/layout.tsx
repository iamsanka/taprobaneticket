"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import "./layout.css";

type SectionKey = "orders" | "finance" | "users";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    orders: true,
    finance: true,
    users: true,
  });

  useEffect(() => {
    if (!pathname) return;
    setOpenSections((prev) => {
      const next = { ...prev };
      if (pathname.startsWith("/super-admin/orders")) next.orders = true;
      if (pathname.startsWith("/super-admin/finance")) next.finance = true;
      if (pathname.startsWith("/super-admin/users")) next.users = true;
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

  const isOrdersActive = pathname?.startsWith("/super-admin/orders");
  const isUsersActive = pathname?.startsWith("/super-admin/users");
  const isCreateUserActive = pathname === "/super-admin/users/new";
  const isUsersListActive = isUsersActive && !isCreateUserActive;
  const isSettingsActive = pathname === "/super-admin/settings";
  const isReportsActive =
    pathname === "/super-admin/reports" ||
    pathname?.startsWith("/super-admin/reports/");
  const isEmailsActive = pathname?.startsWith("/super-admin/emails");
  const isDiscountsActive = pathname?.startsWith("/super-admin/discounts");

  const isFinanceActive = pathname?.startsWith("/super-admin/finance");
  const isFinanceDashboardActive = pathname === "/super-admin/finance";
  const isFinanceIncomeActive = pathname?.startsWith(
    "/super-admin/finance/income"
  );
  const isFinanceExpensesActive = pathname?.startsWith(
    "/super-admin/finance/expenses"
  );

  return (
    <div className={`super-admin-layout ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">
                Taprobane<span className="sidebar-brand-accent">Ticket</span>
              </span>
              <span className="sidebar-brand-role">Super Admin</span>
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
            href="/super-admin/dashboard"
            className={`sidebar-link ${
              pathname === "/super-admin/dashboard" ? "active" : ""
            }`}
            title={collapsed ? "Dashboard" : undefined}
          >
            <SidebarIcon name="dashboard" />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {/* 2. Ticket Categories */}
          <Link
            href="/super-admin/ticket-categories"
            className={`sidebar-link ${
              pathname?.startsWith("/super-admin/ticket-categories")
                ? "active"
                : ""
            }`}
            title={collapsed ? "Ticket Categories" : undefined}
          >
            <SidebarIcon name="categories" />
            {!collapsed && <span>Ticket Categories</span>}
          </Link>

          {/* 3. Events */}
          <Link
            href="/super-admin/events"
            className={`sidebar-link ${
              pathname?.startsWith("/super-admin/events") ? "active" : ""
            }`}
            title={collapsed ? "Events" : undefined}
          >
            <SidebarIcon name="events" />
            {!collapsed && <span>Events</span>}
          </Link>

          {/* 4. Orders */}
          {collapsed ? (
            <Link
              href="/super-admin/orders"
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
                    href="/super-admin/orders"
                    className={`sidebar-sublink ${
                      pathname === "/super-admin/orders" ? "active" : ""
                    }`}
                  >
                    Pending Benefits
                  </Link>
                  <Link
                    href="/super-admin/orders/all"
                    className={`sidebar-sublink ${
                      pathname === "/super-admin/orders/all" ? "active" : ""
                    }`}
                  >
                    All Orders
                  </Link>
                  <Link
                    href="/super-admin/orders/cancelled"
                    className={`sidebar-sublink ${
                      pathname === "/super-admin/orders/cancelled"
                        ? "active"
                        : ""
                    }`}
                  >
                    Cancelled
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* 5. Finance */}
          {collapsed ? (
            <Link
              href="/super-admin/finance"
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
                    href="/super-admin/finance"
                    className={`sidebar-sublink ${
                      isFinanceDashboardActive ? "active" : ""
                    }`}
                  >
                    Overview
                  </Link>
                  <Link
                    href="/super-admin/finance/income"
                    className={`sidebar-sublink ${
                      isFinanceIncomeActive ? "active" : ""
                    }`}
                  >
                    Income
                  </Link>
                  <Link
                    href="/super-admin/finance/expenses"
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

          {/* 6. Emails */}
          <Link
            href="/super-admin/emails"
            className={`sidebar-link ${isEmailsActive ? "active" : ""}`}
            title={collapsed ? "Emails" : undefined}
          >
            <SidebarIcon name="emails" />
            {!collapsed && <span>Emails</span>}
          </Link>

          {/* 7. Discounts ← NEW */}
          <Link
            href="/super-admin/discounts"
            className={`sidebar-link ${isDiscountsActive ? "active" : ""}`}
            title={collapsed ? "Discounts" : undefined}
          >
            <SidebarIcon name="discounts" />
            {!collapsed && <span>Discounts</span>}
          </Link>

          {/* 8. Reports */}
          <Link
            href="/super-admin/reports"
            className={`sidebar-link ${isReportsActive ? "active" : ""}`}
            title={collapsed ? "Reports" : undefined}
          >
            <SidebarIcon name="reports" />
            {!collapsed && <span>Reports</span>}
          </Link>

          {/* 9. Scanner */}
          <Link
            href="/super-admin/scanner"
            className={`sidebar-link ${
              pathname === "/super-admin/scanner" ? "active" : ""
            }`}
            title={collapsed ? "Scanner" : undefined}
          >
            <SidebarIcon name="scanner" />
            {!collapsed && <span>Scanner</span>}
          </Link>

          {/* 10. Users */}
          {collapsed ? (
            <Link
              href="/super-admin/users"
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
                    href="/super-admin/users"
                    className={`sidebar-sublink ${
                      isUsersListActive ? "active" : ""
                    }`}
                  >
                    All Users
                  </Link>
                  <Link
                    href="/super-admin/users/new"
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

          {/* 11. Settings */}
          <Link
            href="/super-admin/settings"
            className={`sidebar-link ${isSettingsActive ? "active" : ""}`}
            title={collapsed ? "Settings" : undefined}
          >
            <SidebarIcon name="settings" />
            {!collapsed && <span>Settings</span>}
          </Link>
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
    | "events"
    | "categories"
    | "users"
    | "settings"
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
      // Ticket-tag icon
      return (
        <svg {...common}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case "events":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "categories":
      return (
        <svg {...common}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
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
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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