export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import jwt from "jsonwebtoken";

// ⭐ Super Admin Auth (same as events)
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

export async function POST(req: NextRequest) {
  try {
    // ⭐ Auth check
    const user = getSuperAdmin(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin only" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, ticketTypesList } = body;

    // ⭐ Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    // ⭐ Validate ticket types
    if (!Array.isArray(ticketTypesList)) {
      return NextResponse.json(
        { error: "ticketTypesList must be an array" },
        { status: 400 }
      );
    }

    if (ticketTypesList.length === 0) {
      return NextResponse.json(
        { error: "At least one ticket type is required" },
        { status: 400 }
      );
    }

    if (ticketTypesList.length > 5) {
      return NextResponse.json(
        { error: "Maximum 5 ticket types allowed per category" },
        { status: 400 }
      );
    }

    // ⭐ Create GLOBAL category
    const createdCategory = await db
      .insert(ticketCategories)
      .values({
        name,
      })
      .returning();

    const categoryId = createdCategory[0].id;

    // ⭐ Create ticket types linked to this category
    for (const type of ticketTypesList) {
      if (!type.name) {
        return NextResponse.json(
          { error: "Each ticket type must include a name" },
          { status: 400 }
        );
      }

      await db.insert(ticketTypes).values({
        categoryId,
        name: type.name,
      });
    }

    return NextResponse.json(
      {
        success: true,
        category: createdCategory[0],
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Ticket category creation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
