import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

// ⭐ Take the leftmost (client) IP from x-forwarded-for.
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  return xff.split(",")[0].trim();
}

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
    }) as {
      userId: number;
      role: string;
      ip?: string;
      ua?: string;
    };

    // IP + User-Agent binding — both normalized the same way as login
    const reqIp = getClientIp(req);
    const reqUa = req.headers.get("user-agent") || "unknown";

    // ⭐ Log the mismatch so you can see WHY it fails in prod
    if (decoded.ip !== reqIp) {
      console.log(
        `[middleware] IP BINDING FAILED — token: "${decoded.ip}" | request: "${reqIp}"`
      );
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (decoded.ua !== reqUa) {
      console.log(
        `[middleware] UA BINDING FAILED — token: "${decoded.ua?.slice(0, 60)}" | request: "${reqUa.slice(0, 60)}"`
      );
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Role-based protection
    if (pathname.startsWith("/super-admin") && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (
      pathname.startsWith("/admin") &&
      decoded.role !== "ADMIN" &&
      decoded.role !== "SUPER_ADMIN"
    ) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (pathname.startsWith("/audit") && decoded.role !== "AUDIT") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (pathname.startsWith("/staff") && decoded.role !== "STAFF") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Session rotation
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
      maxAge: 60 * 60 * 6,
    });
    return res;
  } catch (err) {
    console.log("[middleware] JWT VERIFY FAILED:", err);
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