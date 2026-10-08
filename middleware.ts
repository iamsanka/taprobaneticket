import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

// ⭐ jose needs the secret as Uint8Array, not a string
function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(s);
}

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
    // ⭐ jose's jwtVerify is async (Web Crypto is async)
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: "taprobaneticket.com",
      audience: "taprobaneticket-admin",
    });

    const decoded = {
      userId: payload.userId as number,
      role: payload.role as string,
      ip: payload.ip as string | undefined,
      ua: payload.ua as string | undefined,
    };

    // IP + User-Agent binding
    const reqIp = getClientIp(req);
    const reqUa = req.headers.get("user-agent") || "unknown";

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

    // ⭐ Session rotation — sign with jose
    const newToken = await new SignJWT({
      userId: decoded.userId,
      role: decoded.role,
      ua: decoded.ua,
      ip: decoded.ip,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("taprobaneticket.com")
      .setAudience("taprobaneticket-admin")
      .setExpirationTime("6h")
      .sign(getSecret());

    const res = NextResponse.next();
    res.cookies.set("session", newToken, {
      httpOnly: true,
      secure: true,
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