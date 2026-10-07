import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { orderTickets } from "@/db/schema/orderTickets";
import { eventTickets } from "@/db/schema/eventTickets";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import jwt from "jsonwebtoken";

function getSuperAdmin(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as {
      userId: number;
      role: string;
    };
    return decoded.role === "SUPER_ADMIN" ? decoded : null;
  } catch {
    return null;
  }
}

type IncomingType = {
  id?: number;
  name: string;
};

export async function PUT(req: NextRequest) {
  try {
    const user = getSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { id, name, ticketTypesList } = body as {
      id: number;
      name: string;
      ticketTypesList: IncomingType[];
    };

    // ---- Validation ----
    if (!id || !Number.isInteger(id)) {
      return NextResponse.json(
        { error: "Invalid category id" },
        { status: 400 }
      );
    }

    const trimmedName = String(name ?? "").trim();
    if (!trimmedName) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(ticketTypesList) || ticketTypesList.length === 0) {
      return NextResponse.json(
        { error: "At least one ticket type is required" },
        { status: 400 }
      );
    }

    // Validate each type
    for (const t of ticketTypesList) {
      const n = String(t?.name ?? "").trim();
      if (!n) {
        return NextResponse.json(
          { error: "Every ticket type needs a name" },
          { status: 400 }
        );
      }
    }

    // Duplicate name check (case-insensitive)
    const seen = new Set<string>();
    for (const t of ticketTypesList) {
      const k = t.name.trim().toLowerCase();
      if (seen.has(k)) {
        return NextResponse.json(
          { error: `Duplicate ticket type: "${t.name.trim()}"` },
          { status: 400 }
        );
      }
      seen.add(k);
    }

    // ---- Confirm the category exists ----
    const [existingCategory] = await db
      .select()
      .from(ticketCategories)
      .where(eq(ticketCategories.id, id));

    if (!existingCategory) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // ---- Load all current types for this category ----
    const currentTypes = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.categoryId, id));

    const currentIds = new Set(currentTypes.map((t) => t.id));

    // Split incoming into updates vs inserts
    const incomingWithId: (IncomingType & { id: number })[] = [];
    const incomingNew: IncomingType[] = [];

    for (const t of ticketTypesList) {
      if (t.id !== undefined && t.id !== null && currentIds.has(t.id)) {
        incomingWithId.push({ id: t.id, name: t.name.trim() });
      } else {
        // Either no id, or the id doesn't belong to this category —
        // treat as a new type
        incomingNew.push({ name: t.name.trim() });
      }
    }

    const incomingIdSet = new Set(incomingWithId.map((t) => t.id));

    // Types that are currently in the DB but NOT in the incoming list —
    // these need to be deleted.
    const toDeleteIds = currentTypes
      .filter((t) => !incomingIdSet.has(t.id))
      .map((t) => t.id);

    // ---- Check: are any of the to-be-deleted types referenced by an order? ----
    if (toDeleteIds.length > 0) {
      const referenced = await db
        .select({ id: orderTickets.ticketTypeId })
        .from(orderTickets)
        .where(inArray(orderTickets.ticketTypeId, toDeleteIds));

      const referencedSet = new Set(referenced.map((r) => r.id));

      // Also check event_tickets — used by an event's pricing config
      const eventRefs = await db
        .select({ id: eventTickets.typeId })
        .from(eventTickets)
        .where(inArray(eventTickets.typeId, toDeleteIds));

      const eventRefSet = new Set(eventRefs.map((r) => r.id));

      const blockedIds = new Set([
        ...referencedSet,
        ...eventRefSet,
      ]);

      if (blockedIds.size > 0) {
        const blockedNames = currentTypes
          .filter((t) => blockedIds.has(t.id))
          .map((t) => t.name);

        return NextResponse.json(
          {
            error: `Cannot remove ${blockedNames
              .map((n) => `"${n}"`)
              .join(", ")} — ${
              blockedNames.length === 1 ? "it is" : "they are"
            } already used by orders or events. Rename instead, or remove those references first.`,
            blockedTypes: blockedNames,
          },
          { status: 409 }
        );
      }
    }

    // ---- Apply everything in a transaction ----
    await db.transaction(async (tx) => {
      // 1. Update category name
      if (trimmedName !== existingCategory.name) {
        await tx
          .update(ticketCategories)
          .set({ name: trimmedName, updatedAt: new Date() })
          .where(eq(ticketCategories.id, id));
      }

      // 2. Update existing types (name only)
      for (const t of incomingWithId) {
        await tx
          .update(ticketTypes)
          .set({ name: t.name, updatedAt: new Date() })
          .where(eq(ticketTypes.id, t.id));
      }

      // 3. Insert new types
      for (const t of incomingNew) {
        await tx.insert(ticketTypes).values({
          categoryId: id,
          name: t.name,
        });
      }

      // 4. Delete types that are no longer in the list
      // (we already verified they have no references)
      if (toDeleteIds.length > 0) {
        await tx
          .delete(ticketTypes)
          .where(
            and(
              eq(ticketTypes.categoryId, id),
              inArray(ticketTypes.id, toDeleteIds)
            )
          );
      }
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Edit category error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}