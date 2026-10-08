import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { seatingMaps } from "@/db/schema/seatingMaps";
import { seatingSections } from "@/db/schema/seatingSections";
import { seats } from "@/db/schema/seats";
import { events } from "@/db/schema/events";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

// ---- Caps ----
const MAX_SECTIONS_PER_MAP = 30;
const MAX_ROWS_PER_SECTION = 200;
const MAX_COLS_PER_SECTION = 200;
const MAX_SEATS_PER_MAP = 50_000;
const MAX_NAME_LEN = 128;
const MAX_LABEL_LEN = 64;

// ⭐ Stage position values
const STAGE_VALUES = ["top", "bottom", "none"] as const;
type StageValue = (typeof STAGE_VALUES)[number];

// 1 -> A, 26 -> Z, 27 -> AA ...
function rowLetterFromOrder(n: number): string {
  let result = "";
  let x = n;
  while (x > 0) {
    x -= 1;
    result = String.fromCharCode(65 + (x % 26)) + result;
    x = Math.floor(x / 26);
  }
  return result;
}

/* ======================================================
   GET /api/super-admin/seating-maps
   ====================================================== */
export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const eventIdRaw = req.nextUrl.searchParams.get("eventId");
    const categoryIdRaw = req.nextUrl.searchParams.get("categoryId");

    const eventIdFilter =
      eventIdRaw && eventIdRaw !== "all" ? Number(eventIdRaw) : null;
    const categoryIdFilter =
      categoryIdRaw && categoryIdRaw !== "all" ? Number(categoryIdRaw) : null;

    const conditions = [];
    if (eventIdFilter !== null && Number.isInteger(eventIdFilter)) {
      conditions.push(eq(seatingMaps.eventId, eventIdFilter));
    }
    if (categoryIdFilter !== null && Number.isInteger(categoryIdFilter)) {
      conditions.push(eq(seatingMaps.categoryId, categoryIdFilter));
    }

    const rows = await db
      .select({
        id: seatingMaps.id,
        eventId: seatingMaps.eventId,
        categoryId: seatingMaps.categoryId,
        name: seatingMaps.name,
        stagePosition: seatingMaps.stagePosition, // ⭐
        createdAt: seatingMaps.createdAt,
        updatedAt: seatingMaps.updatedAt,
        eventTitle: events.title,
        categoryName: ticketCategories.name,
        createdByEmail: users.email,
        sectionCount: sql<number>`COUNT(DISTINCT ${seatingSections.id})::int`,
        seatCount: sql<number>`COUNT(DISTINCT ${seats.id})::int`,
        blockedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${seats.isBlocked} THEN ${seats.id} END)::int`,
        bookedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${seats.bookedOrderId} IS NOT NULL THEN ${seats.id} END)::int`,
      })
      .from(seatingMaps)
      .leftJoin(events, eq(events.id, seatingMaps.eventId))
      .leftJoin(
        ticketCategories,
        eq(ticketCategories.id, seatingMaps.categoryId)
      )
      .leftJoin(users, eq(users.id, seatingMaps.createdBy))
      .leftJoin(seatingSections, eq(seatingSections.mapId, seatingMaps.id))
      .leftJoin(seats, eq(seats.mapId, seatingMaps.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        seatingMaps.id,
        events.title,
        ticketCategories.name,
        users.email
      )
      .orderBy(desc(seatingMaps.id));

    return NextResponse.json({ maps: rows });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List seating maps error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ======================================================
   POST /api/super-admin/seating-maps
   ====================================================== */
export async function POST(req: NextRequest) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const {
      eventId: eventIdRaw,
      categoryId: categoryIdRaw,
      name: nameRaw,
      stagePosition: stagePositionRaw, // ⭐
      sections: sectionsRaw,
    } = body as {
      eventId?: unknown;
      categoryId?: unknown;
      name?: unknown;
      stagePosition?: unknown; // ⭐
      sections?: unknown;
    };

    const eventId = Number(eventIdRaw);
    const categoryId = Number(categoryIdRaw);
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "eventId is required", code: "MISSING_EVENT" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { error: "categoryId is required", code: "MISSING_CATEGORY" },
        { status: 400 }
      );
    }
    if (!name || name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        {
          error: `Map name must be 1–${MAX_NAME_LEN} characters`,
          code: "INVALID_NAME",
        },
        { status: 400 }
      );
    }

    // ⭐ Validate stage position
    const stagePosition: StageValue =
      typeof stagePositionRaw === "string" &&
      (STAGE_VALUES as readonly string[]).includes(stagePositionRaw)
        ? (stagePositionRaw as StageValue)
        : "top";

    if (!Array.isArray(sectionsRaw) || sectionsRaw.length === 0) {
      return NextResponse.json(
        {
          error: "At least one section is required",
          code: "INVALID_SECTIONS",
        },
        { status: 400 }
      );
    }
    if (sectionsRaw.length > MAX_SECTIONS_PER_MAP) {
      return NextResponse.json(
        {
          error: `No more than ${MAX_SECTIONS_PER_MAP} sections per map`,
          code: "TOO_MANY_SECTIONS",
        },
        { status: 400 }
      );
    }

    // ---- Parse + validate each section ----
    type ParsedSection = {
      label: string;
      rows: number;
      colsPerRow: number;
      colorHex: string | null;
    };
    const sections: ParsedSection[] = [];
    const seenLabels = new Set<string>();

    for (let i = 0; i < sectionsRaw.length; i++) {
      const s = sectionsRaw[i] as {
        label?: unknown;
        rows?: unknown;
        colsPerRow?: unknown;
        colorHex?: unknown;
      };

      const label = typeof s.label === "string" ? s.label.trim() : "";
      const rows = Number(s.rows);
      const colsPerRow = Number(s.colsPerRow);
      const colorHex =
        typeof s.colorHex === "string" && /^#[0-9a-fA-F]{6}$/.test(s.colorHex)
          ? s.colorHex
          : null;

      if (!label || label.length > MAX_LABEL_LEN) {
        return NextResponse.json(
          {
            error: `Section ${i + 1}: label must be 1–${MAX_LABEL_LEN} characters`,
            code: "INVALID_SECTION_LABEL",
          },
          { status: 400 }
        );
      }
      if (seenLabels.has(label)) {
        return NextResponse.json(
          {
            error: `Section label "${label}" is used more than once`,
            code: "DUPLICATE_SECTION_LABEL",
          },
          { status: 400 }
        );
      }
      seenLabels.add(label);

      if (
        !Number.isInteger(rows) ||
        rows < 1 ||
        rows > MAX_ROWS_PER_SECTION
      ) {
        return NextResponse.json(
          {
            error: `Section "${label}": rows must be 1–${MAX_ROWS_PER_SECTION}`,
            code: "INVALID_ROWS",
          },
          { status: 400 }
        );
      }
      if (
        !Number.isInteger(colsPerRow) ||
        colsPerRow < 1 ||
        colsPerRow > MAX_COLS_PER_SECTION
      ) {
        return NextResponse.json(
          {
            error: `Section "${label}": colsPerRow must be 1–${MAX_COLS_PER_SECTION}`,
            code: "INVALID_COLS",
          },
          { status: 400 }
        );
      }

      sections.push({ label, rows, colsPerRow, colorHex });
    }

    const totalSeats = sections.reduce(
      (sum, s) => sum + s.rows * s.colsPerRow,
      0
    );
    if (totalSeats > MAX_SEATS_PER_MAP) {
      return NextResponse.json(
        {
          error: `Total seats (${totalSeats}) exceeds the limit of ${MAX_SEATS_PER_MAP}`,
          code: "TOO_MANY_SEATS",
        },
        { status: 400 }
      );
    }

    const [ev] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId));
    if (!ev) {
      return NextResponse.json(
        { error: "Event not found", code: "EVENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const [cat] = await db
      .select({ id: ticketCategories.id })
      .from(ticketCategories)
      .where(eq(ticketCategories.id, categoryId));
    if (!cat) {
      return NextResponse.json(
        { error: "Ticket category not found", code: "CATEGORY_NOT_FOUND" },
        { status: 404 }
      );
    }

    const existing = await db
      .select({ id: seatingMaps.id })
      .from(seatingMaps)
      .where(
        and(
          eq(seatingMaps.eventId, eventId),
          eq(seatingMaps.categoryId, categoryId)
        )
      );
    if (existing.length > 0) {
      return NextResponse.json(
        {
          error:
            "A seating map already exists for this event and category. Delete it first to replace it.",
          code: "MAP_EXISTS",
        },
        { status: 409 }
      );
    }

    const created = await db.transaction(async (tx) => {
      const [mapRow] = await tx
        .insert(seatingMaps)
        .values({
          eventId,
          categoryId,
          name,
          stagePosition, // ⭐
          createdBy: session.userId,
        })
        .returning();

      const insertedSections = await tx
        .insert(seatingSections)
        .values(
          sections.map((s, i) => ({
            mapId: mapRow.id,
            label: s.label,
            rows: s.rows,
            colsPerRow: s.colsPerRow,
            displayOrder: i,
            colorHex: s.colorHex,
          }))
        )
        .returning();

      const seatRows: Array<{
        sectionId: number;
        mapId: number;
        rowLabel: string;
        rowOrder: number;
        numberLabel: number;
        isBlocked: boolean;
      }> = [];

      for (const sec of insertedSections) {
        for (let r = 1; r <= sec.rows; r++) {
          const rowLetter = rowLetterFromOrder(r);
          for (let n = 1; n <= sec.colsPerRow; n++) {
            seatRows.push({
              sectionId: sec.id,
              mapId: mapRow.id,
              rowLabel: rowLetter,
              rowOrder: r,
              numberLabel: n,
              isBlocked: false,
            });
          }
        }
      }

      const BATCH_SIZE = 5_000;
      for (let i = 0; i < seatRows.length; i += BATCH_SIZE) {
        await tx.insert(seats).values(seatRows.slice(i, i + BATCH_SIZE));
      }

      return {
        map: mapRow,
        sections: insertedSections,
        seatCount: seatRows.length,
      };
    });

    return NextResponse.json(
      {
        map: {
          id: created.map.id,
          eventId: created.map.eventId,
          categoryId: created.map.categoryId,
          name: created.map.name,
          stagePosition: created.map.stagePosition, // ⭐
          createdAt: created.map.createdAt,
        },
        sections: created.sections.map((s) => ({
          id: s.id,
          label: s.label,
          rows: s.rows,
          colsPerRow: s.colsPerRow,
          displayOrder: s.displayOrder,
          colorHex: s.colorHex,
        })),
        seatCount: created.seatCount,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err?.code === "23505") {
      return NextResponse.json(
        {
          error:
            "A seating map already exists for this event and category.",
          code: "MAP_EXISTS",
        },
        { status: 409 }
      );
    }
    console.error("Create seating map error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}