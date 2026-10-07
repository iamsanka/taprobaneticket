"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import "./Navbar.css";

const NAV_ITEMS: { label: string; anchor: string }[] = [
  { label: "Home", anchor: "hero" },
  { label: "Events", anchor: "events" },
  { label: "About Us", anchor: "about" },
  { label: "Contact Us", anchor: "contact" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  // ---- Session check ----
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json();
        if (data.loggedIn) {
          setRole(data.role);
          setName(data.name);
        } else {
          setRole(null);
          setName(null);
        }
      } catch {
        setRole(null);
        setName(null);
      }
    }

    checkSession();

    const onSessionChange = () => checkSession();
    window.addEventListener("session-changed", onSessionChange);
    return () =>
      window.removeEventListener("session-changed", onSessionChange);
  }, []);

  // ---- Scroll listener: solid navbar after 8px ----
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ---- Lock body scroll when drawer is open ----
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // ---- Close drawer on route change ----
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function getDashboardPath() {
    if (role === "SUPER_ADMIN") return "/super-admin/dashboard";
    if (role === "ADMIN") return "/admin/dashboard";
    if (role === "AUDIT") return "/audit/dashboard";
    if (role === "STAFF") return "/staff/dashboard";
    return "/login";
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("session-changed"));
    setMenuOpen(false);
    router.push("/login");
  }

  // Smooth-scroll to a section on the landing page, or navigate home
  function goTo(section: string) {
    setMenuOpen(false);
    if (pathname === "/") {
      const el = document.querySelector(`#${section}`);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push(`/#${section}`);
    }
  }

  return (
    <>
      <header className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}>
        <div className="navbar-inner">
          {/* ---- Logo ---- */}
          <Link href="/" className="navbar-logo">
            <img
              src="/logo.jpg"
              alt="Taprobane"
              className="navbar-logo-img"
            />
            <span className="navbar-logo-text">
              Taprobane<span className="navbar-logo-accent">Entertainment</span>
            </span>
          </Link>

          {/* ---- Desktop nav ---- */}
          <nav className="navbar-links">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.anchor}
                className="navbar-link"
                onClick={() => goTo(item.anchor)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* ---- Right side ---- */}
          <div className="navbar-right">
            {role ? (
              /* Logged-in user button — desktop only.
                 On mobile it lives in the drawer instead. */
              <button
                className="navbar-cta navbar-cta-user navbar-cta-desktop-only"
                onClick={() => router.push(getDashboardPath())}
              >
                <span className="navbar-cta-user-icon">
                  <UserIcon />
                </span>
                {name ?? "My Profile"}
              </button>
            ) : (
              /* Login link — visible on all screen sizes */
              <Link href="/login" className="navbar-cta">
                Login
              </Link>
            )}

            <button
              className={`navbar-hamburger ${menuOpen ? "open" : ""}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      {/* ---- Mobile drawer ---- */}
      <div
        className={`navbar-backdrop ${menuOpen ? "open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <aside className={`navbar-drawer ${menuOpen ? "open" : ""}`}>
        <div className="navbar-drawer-header">
          <span className="navbar-drawer-title">Menu</span>
          <button
            className="navbar-drawer-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="navbar-drawer-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.anchor}
              className="navbar-drawer-link"
              onClick={() => goTo(item.anchor)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="navbar-drawer-footer">
          {role ? (
            <>
              {/* My Profile — shows the user's name, links to their dashboard */}
              <button
                className="navbar-drawer-btn navbar-drawer-btn-profile"
                onClick={() => {
                  setMenuOpen(false);
                  router.push(getDashboardPath());
                }}
              >
                <span className="navbar-drawer-btn-profile-icon">
                  <UserIcon />
                </span>
                <span className="navbar-drawer-btn-profile-text">
                  <span className="navbar-drawer-btn-profile-label">
                    My Profile
                  </span>
                  <span className="navbar-drawer-btn-profile-name">
                    {name ?? "Account"}
                  </span>
                </span>
              </button>

              <button
                className="navbar-drawer-btn navbar-drawer-btn-logout"
                onClick={logout}
              >
                <LogoutIcon />
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="navbar-drawer-btn navbar-drawer-btn-primary"
              onClick={() => setMenuOpen(false)}
            >
              Login
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}

// ======================================================
// Inline SVG icons
// ======================================================

function UserIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}