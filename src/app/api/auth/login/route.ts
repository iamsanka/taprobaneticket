import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/schema/index";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ⭐ Same IP normalization as middleware
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  return xff.split(",")[0].trim();
}

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
  return entry.count > 10;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") || "unknown";

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

  // ⭐ Reject deactivated accounts
  if (!user.isActive) {
    return NextResponse.json(
      { error: "Account is deactivated" },
      { status: 403 }
    );
  }

  if (!["SUPER_ADMIN", "ADMIN", "AUDIT", "STAFF"].includes(user.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

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

  res.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",       // ⭐ matches middleware
    path: "/",
    maxAge: 60 * 60 * 6,
  });

  return res;
}