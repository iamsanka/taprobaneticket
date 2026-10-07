import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export type SessionUser = {
  userId: number;
  role: "SUPER_ADMIN" | "ADMIN" | "AUDIT" | "STAFF" | "CUSTOMER";
  ip?: string;
  ua?: string;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function getSession(
  req: NextRequest,
  allowedRoles?: SessionUser["role"][]
): SessionUser {
  const token = req.cookies.get("session")?.value;

  console.log("[getSession] ────────────────────────────");
  console.log("[getSession] token present:", !!token);
  console.log("[getSession] token length:", token?.length);
  console.log("[getSession] token prefix:", token?.slice(0, 30));
  console.log(
    "[getSession] SESSION_SECRET present:",
    !!process.env.SESSION_SECRET
  );
  console.log(
    "[getSession] SESSION_SECRET length:",
    process.env.SESSION_SECRET?.length
  );
  console.log(
    "[getSession] allowedRoles:",
    allowedRoles ?? "(none — any role)"
  );

  if (!token) {
    console.log("[getSession] ✗ FAIL: no token");
    throw new AuthError("Not authenticated", 401);
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, process.env.SESSION_SECRET!, {
      issuer: "taprobaneticket.com",
      audience: "taprobaneticket-admin",
    });
    console.log("[getSession] ✓ decoded:", {
      userId: decoded.userId,
      role: decoded.role,
      iss: decoded.iss,
      aud: decoded.aud,
      exp: decoded.exp,
      nowSec: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    console.log(
      "[getSession] ✗ FAIL: JWT verify threw:",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    );
    throw new AuthError("Invalid or expired session", 401);
  }

  const user: SessionUser = {
    userId: decoded.userId,
    role: decoded.role,
    ip: decoded.ip,
    ua: decoded.ua,
  };

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.log(
      `[getSession] ✗ FAIL: role "${user.role}" not in ${JSON.stringify(allowedRoles)}`
    );
    throw new AuthError("Forbidden", 403);
  }

  console.log("[getSession] ✓ PASS");
  return user;
}