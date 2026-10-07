import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/schema/index";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Simple brute-force protection (per IP)
const attempts = new Map<string, { count: number; last: number }>();

function rateLimit(ip: string) {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, last: now };

  if (now - entry.last < 60_000) {
    entry.count++;
  } else {
    entry.count = 1;
    entry.last = now;
  }

  attempts.set(ip, entry);

  return entry.count > 10; // max 10 attempts per minute
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  // Rate limit
  if (rateLimit(ip)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const { email, password } = await req.json();

  // Constant-time email existence protection
  const fakeHash = "$2b$10$1234567890123456789012abcdefghijklmnopqrstuv";

  const [user] = await db.select().from(users).where(eq(users.email, email));

  const hashToCompare = user?.passwordHash || fakeHash;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!valid || !user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Role check
  if (!["SUPER_ADMIN", "ADMIN", "AUDIT", "STAFF"].includes(user.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // ⭐ 6-hour session
  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
      ua,
      ip,
    },
    process.env.SESSION_SECRET!,
    {
      expiresIn: "6h",
      issuer: "taprobaneticket.com",
      audience: "taprobaneticket-admin",
    }
  );

  const res = NextResponse.json({ success: true });

  // Secure cookie
  res.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 6, // 6 hours
  });

  return res;
}
