import { NextResponse, NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("session");

  if (cookie?.value) {
    try {
      const decoded: any = jwt.verify(cookie.value, process.env.SESSION_SECRET!, {
        issuer: "taprobaneticket.com",
        audience: "taprobaneticket-admin",
      });

      console.log("LOGOUT:", {
        userId: decoded.userId,
        role: decoded.role,
        timestamp: Date.now(),
      });
    } catch {
      // ignore invalid token
    }
  }

  const res = NextResponse.json({ success: true });

  // ⭐ MUST MATCH LOGIN COOKIE EXACTLY
  res.cookies.set("session", "", {
    httpOnly: true,
    secure: false,     // localhost
    sameSite: "lax",   // MUST match login cookie
    path: "/",
    maxAge: 0,         // expire immediately
  });

  return res;
}
