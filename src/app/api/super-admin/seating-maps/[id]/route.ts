import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { seatingMaps } from "@/db/schema/seatingMaps";
import { seatingSections } from "@/db/schema/seatingSections";
import { seats } from "@/db/schema/seats";
import { events } from "@/db/schema/events";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const MAX_SECTIONS_PER_MAP = 30;
const MAX_ROWS_PER_SECTION = 200;
const MAX_COLS_PER_SECTION = 200;
const MAX_SEATS_PER_MAP = 50_000;
const MAX_NAME_LEN = 128;
const MAX_LABEL_LEN = 64;

const STAGE_VALUES = ["top", "bottom", "none"] as const;
type StageValue = (typeof STAGE_VALUES)[number];

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

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ======================================================
   GET /api/super-admin/seating-maps/[id]
   ====================================================== */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const mapId = parseId(id);
    if (mapId === null) {
      return NextResponse.json({ error: "Invalid map id" }, { status: 400 });
    }

    const [map] = await db
      .select()
      .from(seatingMaps)
      .where(eq(seatingMaps.id, mapId));
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    const [ev] = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(eq(events.id, map.eventId));

    const [cat] = await db
      .select({ id: ticketCategories.id, name: ticketCategories.name })
      .from(ticketCategories)
      .where(eq(ticketCategories.id, map.categoryId));

    const sectionRows = await db
      .select()
      .from(seatingSections)
      .where(eq(seatingSections.mapId, mapId))
      .orderBy(asc(seatingSections.displayOrder), asc(seatingSections.id));

    const seatRows = await db
      .select()
      .from(seats)
      .where(eq(seats.mapId, mapId))
      .orderBy(asc(seats.sectionId), asc(seats.rowOrder), asc(seats.numberLabel));

    const now = new Date();

    const seatsBySection = new Map<number, typeof seatRows>();
    for (const s of seatRows) {
      const arr = seatsBySection.get(s.sectionId) ?? [];
      arr.push(s);
      seatsBySection.set(s.sectionId, arr);
    }

    return NextResponse.json({
      map: {
        id: map.id,
        eventId: map.eventId,
        categoryId: map.categoryId,
        name: map.name,
        stagePosition: map.stagePosition, // ⭐
        createdAt: map.createdAt,
        updatedAt: map.updatedAt,
      },
      event: ev ?? null,
      category: cat ?? null,
      sections: sectionRows.map((sec) => ({
        id: sec.id,
        label: sec.label,
        rows: sec.rows,
        colsPerRow: sec.colsPerRow,
        displayOrder: sec.displayOrder,
        colorHex: sec.colorHex,
        seats: (seatsBySection.get(sec.id) ?? []).map((s) => {
          const isBooked = s.bookedOrderId !== null;
          const isHeld =
            !isBooked &&
            s.holdExpiresAt !== null &&
            s.holdExpiresAt > now;
          return {
            id: s.id,
            rowLabel: s.rowLabel,
            rowOrder: s.rowOrder,
            numberLabel: s.numberLabel,
            isBlocked: s.isBlocked,
            isBooked,
            isHeld,
          };
        }),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get seating map error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ======================================================
   PATCH /api/super-admin/seating-maps/[id]
   ====================================================== */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const mapId = parseId(id);
    if (mapId === null) {
      return NextResponse.json({ error: "Invalid map id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const action = (body as { action?: unknown }).action;

    const [map] = await db
      .select()
      .from(seatingMaps)
      .where(eq(seatingMaps.id, mapId));
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    // ---------- rename ----------
    if (action === "rename") {
      const name = String((body as any).name ?? "").trim();
      if (!name || name.length > MAX_NAME_LEN) {
        return NextResponse.json(
          {
            error: `Map name must be 1–${MAX_NAME_LEN} characters`,
            code: "INVALID_NAME",
          },
          { status: 400 }
        );
      }
      await db
        .update(seatingMaps)
        .set({ name, updatedAt: new Date() })
        .where(eq(seatingMaps.id, mapId));

      return NextResponse.json({ ok: true });
    }

    // ⭐ ---------- setStage ----------
    if (action === "setStage") {
      const raw = (body as any).stagePosition;
      if (
        typeof raw !== "string" ||
        !(STAGE_VALUES as readonly string[]).includes(raw)
      ) {
        return NextResponse.json(
          {
            error: `stagePosition must be one of: ${STAGE_VALUES.join(", ")}`,
            code: "INVALID_STAGE",
          },
          { status: 400 }
        );
      }

      await db
        .update(seatingMaps)
        .set({ stagePosition: raw as StageValue, updatedAt: new Date() })
        .where(eq(seatingMaps.id, mapId));

      return NextResponse.json({ ok: true, stagePosition: raw });
    }

    // ---------- addSection ----------
    if (action === "addSection") {
      const label = String((body as any).label ?? "").trim();
      const rows = Number((body as any).rows);
      const colsPerRow = Number((body as any).colsPerRow);
      const colorHexRaw = (body as any).colorHex;
      const colorHex =
        typeof colorHexRaw === "string" && /^#[0-9a-fA-F]{6}$/.test(colorHexRaw)
          ? colorHexRaw
          : null;

      if (!label || label.length > MAX_LABEL_LEN) {
        return NextResponse.json(
          {
            error: `Section label must be 1–${MAX_LABEL_LEN} characters`,
            code: "INVALID_SECTION_LABEL",
          },
          { status: 400 }
        );
      }
      if (
        !Number.isInteger(rows) ||
        rows < 1 ||
        rows > MAX_ROWS_PER_SECTION
      ) {
        return NextResponse.json(
          {
            error: `rows must be 1–${MAX_ROWS_PER_SECTION}`,
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
            error: `colsPerRow must be 1–${MAX_COLS_PER_SECTION}`,
            code: "INVALID_COLS",
          },
          { status: 400 }
        );
      }

      const existingSections = await db
        .select({ id: seatingSections.id })
        .from(seatingSections)
        .where(eq(seatingSections.mapId, mapId));

      if (existingSections.length >= MAX_SECTIONS_PER_MAP) {
        return NextResponse.json(
          {
            error: `No more than ${MAX_SECTIONS_PER_MAP} sections per map`,
            code: "TOO_MANY_SECTIONS",
          },
          { status: 400 }
        );
      }

      const newSeats = rows * colsPerRow;
      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(seats)
        .where(eq(seats.mapId, mapId));
      if ((total ?? 0) + newSeats > MAX_SEATS_PER_MAP) {
        return NextResponse.json(
          {
            error: `Adding this section would exceed the ${MAX_SEATS_PER_MAP}-seat limit`,
            code: "TOO_MANY_SEATS",
          },
          { status: 400 }
        );
      }

      const maxOrder = await db
        .select({
          max: sql<number | null>`MAX(${seatingSections.displayOrder})`,
        })
        .from(seatingSections)
        .where(eq(seatingSections.mapId, mapId));
      const nextOrder = (maxOrder[0]?.max ?? -1) + 1;

      const created = await db.transaction(async (tx) => {
        const [sec] = await tx
          .insert(seatingSections)
          .values({
            mapId,
            label,
            rows,
            colsPerRow,
            displayOrder: nextOrder,
            colorHex,
          })
          .returning();

        const seatRows: Array<{
          sectionId: number;
          mapId: number;
          rowLabel: string;
          rowOrder: number;
          numberLabel: number;
          isBlocked: boolean;
        }> = [];
        for (let r = 1; r <= rows; r++) {
          const rowLetter = rowLetterFromOrder(r);
          for (let n = 1; n <= colsPerRow; n++) {
            seatRows.push({
              sectionId: sec.id,
              mapId,
              rowLabel: rowLetter,
              rowOrder: r,
              numberLabel: n,
              isBlocked: false,
            });
          }
        }

        const BATCH = 5_000;
        for (let i = 0; i < seatRows.length; i += BATCH) {
          await tx.insert(seats).values(seatRows.slice(i, i + BATCH));
        }

        await tx
          .update(seatingMaps)
          .set({ updatedAt: new Date() })
          .where(eq(seatingMaps.id, mapId));

        return { section: sec, seatCount: seatRows.length };
      });

      return NextResponse.json(
        {
          ok: true,
          section: {
            id: created.section.id,
            label: created.section.label,
            rows: created.section.rows,
            colsPerRow: created.section.colsPerRow,
            displayOrder: created.section.displayOrder,
            colorHex: created.section.colorHex,
          },
          seatCount: created.seatCount,
        },
        { status: 201 }
      );
    }

    // ---------- removeSection ----------
    if (action === "removeSection") {
      const sectionId = Number((body as any).sectionId);
      if (!Number.isInteger(sectionId) || sectionId <= 0) {
        return NextResponse.json(
          { error: "sectionId is required", code: "MISSING_SECTION" },
          { status: 400 }
        );
      }

      const [sec] = await db
        .select()
        .from(seatingSections)
        .where(
          and(
            eq(seatingSections.id, sectionId),
            eq(seatingSections.mapId, mapId)
          )
        );
      if (!sec) {
        return NextResponse.json(
          { error: "Section not found", code: "SECTION_NOT_FOUND" },
          { status: 404 }
        );
      }

      const [{ booked }] = await db
        .select({ booked: sql<number>`COUNT(*)::int` })
        .from(seats)
        .where(
          and(
            eq(seats.sectionId, sectionId),
            isNotNull(seats.bookedOrderId)
          )
        );
      if ((booked ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot remove a section that has booked seats. Cancel or refund those orders first.",
            code: "SECTION_HAS_BOOKINGS",
          },
          { status: 409 }
        );
      }

      const now = new Date();
      const [{ held }] = await db
        .select({ held: sql<number>`COUNT(*)::int` })
        .from(seats)
        .where(
          and(
            eq(seats.sectionId, sectionId),
            sql`${seats.holdExpiresAt} > ${now}`
          )
        );
      if ((held ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot remove a section with active seat holds. Try again in a few minutes.",
            code: "SECTION_HAS_HOLDS",
          },
          { status: 409 }
        );
      }

      await db.transaction(async (tx) => {
        await tx.delete(seats).where(eq(seats.sectionId, sectionId));
        await tx
          .delete(seatingSections)
          .where(eq(seatingSections.id, sectionId));
        await tx
          .update(seatingMaps)
          .set({ updatedAt: new Date() })
          .where(eq(seatingMaps.id, mapId));
      });

      return NextResponse.json({ ok: true });
    }

    // ---------- renameSection ----------
    if (action === "renameSection") {
      const sectionId = Number((body as any).sectionId);
      const label = String((body as any).label ?? "").trim();

      if (!Number.isInteger(sectionId) || sectionId <= 0) {
        return NextResponse.json(
          { error: "sectionId is required", code: "MISSING_SECTION" },
          { status: 400 }
        );
      }
      if (!label || label.length > MAX_LABEL_LEN) {
        return NextResponse.json(
          {
            error: `Section label must be 1–${MAX_LABEL_LEN} characters`,
            code: "INVALID_SECTION_LABEL",
          },
          { status: 400 }
        );
      }

      const [sec] = await db
        .select()
        .from(seatingSections)
        .where(
          and(
            eq(seatingSections.id, sectionId),
            eq(seatingSections.mapId, mapId)
          )
        );
      if (!sec) {
        return NextResponse.json(
          { error: "Section not found", code: "SECTION_NOT_FOUND" },
          { status: 404 }
        );
      }

      const [{ booked }] = await db
        .select({ booked: sql<number>`COUNT(*)::int` })
        .from(seats)
        .where(
          and(
            eq(seats.sectionId, sectionId),
            isNotNull(seats.bookedOrderId)
          )
        );
      if ((booked ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot rename a section that has booked seats — the label is already printed on tickets.",
            code: "SECTION_HAS_BOOKINGS",
          },
          { status: 409 }
        );
      }

      try {
        await db
          .update(seatingSections)
          .set({ label, updatedAt: new Date() })
          .where(eq(seatingSections.id, sectionId));
        await db
          .update(seatingMaps)
          .set({ updatedAt: new Date() })
          .where(eq(seatingMaps.id, mapId));
      } catch (err: any) {
        if (err?.code === "23505") {
          return NextResponse.json(
            {
              error: `Another section is already named "${label}"`,
              code: "DUPLICATE_SECTION_LABEL",
            },
            { status: 409 }
          );
        }
        throw err;
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Unknown action", code: "UNKNOWN_ACTION" },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Patch seating map error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ======================================================
   DELETE /api/super-admin/seating-maps/[id]?confirm=delete
   ====================================================== */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const confirm = req.nextUrl.searchParams.get("confirm");
    if (confirm !== "delete") {
      return NextResponse.json(
        {
          error:
            "Add ?confirm=delete to confirm deletion of this seating map.",
          code: "CONFIRM_REQUIRED",
        },
        { status: 400 }
      );
    }

    const { id } = await params;
    const mapId = parseId(id);
    if (mapId === null) {
      return NextResponse.json({ error: "Invalid map id" }, { status: 400 });
    }

    const [map] = await db
      .select()
      .from(seatingMaps)
      .where(eq(seatingMaps.id, mapId));
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    const [{ booked }] = await db
      .select({ booked: sql<number>`COUNT(*)::int` })
      .from(seats)
      .where(
        and(eq(seats.mapId, mapId), isNotNull(seats.bookedOrderId))
      );
    if ((booked ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `This map has ${booked} booked ${
            booked === 1 ? "seat" : "seats"
          }. Refund or cancel those orders before deleting it.`,
          code: "MAP_HAS_BOOKINGS",
        },
        { status: 409 }
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(seats).where(eq(seats.mapId, mapId));
      await tx
        .delete(seatingSections)
        .where(eq(seatingSections.mapId, mapId));
      await tx.delete(seatingMaps).where(eq(seatingMaps.id, mapId));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete seating map error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}