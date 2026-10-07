import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/db/schema/index";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as {
      userId: number;
      role: string;
    };

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
