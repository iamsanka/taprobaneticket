import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  const pathname = req.nextUrl.pathname;

  // Allow public routes
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!, {
      issuer: "taprobaneticket.com",
      audience: "taprobaneticket-admin",
    });

    // IP + User-Agent binding
    const reqIp = req.headers.get("x-forwarded-for") || "unknown";
    const reqUa = req.headers.get("user-agent") || "unknown";

    if (decoded.ip !== reqIp || decoded.ua !== reqUa) {
      console.log("SESSION BINDING FAILED");
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Role-based protection
    if (pathname.startsWith("/super-admin") && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (pathname.startsWith("/admin") && decoded.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (pathname.startsWith("/audit") && decoded.role !== "AUDIT") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (pathname.startsWith("/staff") && decoded.role !== "STAFF") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // ⭐ Session rotation (refresh token every request)
    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        role: decoded.role,
        ua: decoded.ua,
        ip: decoded.ip,
      },
      process.env.SESSION_SECRET!,
      {
        expiresIn: "6h",
        issuer: "taprobaneticket.com",
        audience: "taprobaneticket-admin",
      }
    );

    const res = NextResponse.next();

    res.cookies.set("session", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 6, // 6 hours
    });

    return res;
  } catch (err) {
    console.log("JWT VERIFY FAILED:", err);
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: [
    "/super-admin/:path*",
    "/admin/:path*",
    "/audit/:path*",
    "/staff/:path*",
  ],
};
