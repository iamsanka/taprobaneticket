import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "ID is required" },
        { status: 400 }
      );
    }

    // Fetch category
    const category = await db
      .select()
      .from(ticketCategories)
      .where(eq(ticketCategories.id, id));

    if (category.length === 0) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // Fetch ticket types
    const types = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.categoryId, id));

    return NextResponse.json(
      {
        category: {
          ...category[0],
          ticketTypes: types,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Get category error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
