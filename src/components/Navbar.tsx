"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import "./Navbar.css";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      const data = await res.json();

      if (data.loggedIn) {
        setRole(data.role);
      } else {
        setRole(null);
      }
    } catch {
      setRole(null);
    }
  }

  // ⭐ ALWAYS run on mount
  useEffect(() => {
    checkSession();
  }, []);

  // ⭐ Run on route change
  useEffect(() => {
    checkSession();
  }, [pathname]);

  // ⭐ Run when logout triggers event
  useEffect(() => {
    window.addEventListener("session-changed", checkSession);
    return () => window.removeEventListener("session-changed", checkSession);
  }, []);

  function getDashboardPath() {
    if (role === "SUPER_ADMIN") return "/super-admin/dashboard";
    if (role === "ADMIN") return "/admin/dashboard";
    if (role === "AUDIT") return "/audit/dashboard";
    if (role === "STAFF") return "/staff/dashboard";
    return "/login";
  }

  return (
    <header className={`navbar ${scrolled ? "navbarSolid" : "navbarTransparent"}`}>
      <div className="navContent">
        <div className="left">
          <Link href="/" className="brand">Taprobane Ticket</Link>
        </div>

        <nav className="centerLinks">
          <Link href="/">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/about">About Us</Link>
          <Link href="/contact">Contact Us</Link>
        </nav>

        <div className="right">
          {role ? (
            <Link href={getDashboardPath()} className="loginButton">Dashboard</Link>
          ) : (
            <Link href="/login" className="loginButton">Login</Link>
          )}

          <button
            className={`hamburger ${menuOpen ? "hamburgerOpen" : ""}`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <div className={`mobileMenu ${menuOpen ? "mobileMenuOpen" : ""}`}>
        <Link href="/" onClick={() => setMenuOpen(false)}>Home</Link>
        <Link href="/events" onClick={() => setMenuOpen(false)}>Events</Link>
        <Link href="/about" onClick={() => setMenuOpen(false)}>About Us</Link>
        <Link href="/contact" onClick={() => setMenuOpen(false)}>Contact Us</Link>

        {role ? (
          <Link href={getDashboardPath()} onClick={() => setMenuOpen(false)}>Dashboard</Link>
        ) : (
          <Link href="/login" onClick={() => setMenuOpen(false)}>Login</Link>
        )}
      </div>
    </header>
  );
}
