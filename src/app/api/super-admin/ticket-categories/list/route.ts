import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// ⭐ Super Admin Auth
function getSuperAdmin(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as {
      userId: number;
      role: string;
    };

    if (decoded.role !== "SUPER_ADMIN") return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = getSuperAdmin(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin only" },
        { status: 403 }
      );
    }

    // ⭐ Fetch all categories
    const categories = await db.select().from(ticketCategories);

    // ⭐ Fetch all ticket types
    const types = await db.select().from(ticketTypes);

    // ⭐ Attach ticket types to each category
    const categoriesWithTypes = categories.map((cat) => ({
      ...cat,
      ticketTypes: types.filter((t) => t.categoryId === cat.id),
    }));

    return NextResponse.json(
      { categories: categoriesWithTypes },
      { status: 200 }
    );
  } catch (err) {
    console.error("Ticket categories list error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
