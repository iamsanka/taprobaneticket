import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("session");

  if (!cookie) {
    return NextResponse.json({ loggedIn: false });
  }

  try {
    const decoded: any = jwt.verify(cookie.value, process.env.SESSION_SECRET!);

    return NextResponse.json({
      loggedIn: true,
      role: decoded.role,
      name: decoded.name || "My Profile",
    });
  } catch {
    return NextResponse.json({ loggedIn: false });
  }
}
