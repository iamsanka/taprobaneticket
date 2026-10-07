import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { incomes } from "@/db/schema/incomes";
import { incomeReceipts } from "@/db/schema/incomeReceipts";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VALID_CATEGORIES = [
  "director_share",
  "sponsorship",
  "donation",
  "bank_transfer",
  "other",
] as const;
type IncomeCategory = (typeof VALID_CATEGORIES)[number];

const VALID_STATUSES = [
  "expected",
  "partial",
  "received",
  "cancelled",
] as const;
type IncomeStatus = (typeof VALID_STATUSES)[number];

// ======================================================
// GET /api/super-admin/incomes
// Filters (all optional):
//   eventId    — number or "all" or "none" (company-wide only)
//   category   — income category or "all"
//   status     — income status or "all"
//   dateFrom   — ISO date (created_at >=)
//   dateTo     — ISO date (created_at <=)
// ======================================================
export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    const params = req.nextUrl.searchParams;
    const eventIdRaw = params.get("eventId");
    const categoryRaw = params.get("category");
    const statusRaw = params.get("status");
    const dateFromRaw = params.get("dateFrom");
    const dateToRaw = params.get("dateTo");

    const conditions = [];

    if (eventIdRaw && eventIdRaw !== "all") {
      if (eventIdRaw === "none") {
        conditions.push(sql`${incomes.eventId} IS NULL`);
      } else {
        const id = Number(eventIdRaw);
        if (Number.isInteger(id)) {
          conditions.push(eq(incomes.eventId, id));
        }
      }
    }

    if (categoryRaw && categoryRaw !== "all") {
      conditions.push(eq(incomes.category, categoryRaw as IncomeCategory));
    }

    if (statusRaw && statusRaw !== "all") {
      conditions.push(eq(incomes.status, statusRaw as IncomeStatus));
    }

    if (dateFromRaw) {
      const d = new Date(dateFromRaw);
      if (!isNaN(d.getTime())) conditions.push(gte(incomes.createdAt, d));
    }
    if (dateToRaw) {
      const d = new Date(dateToRaw);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        conditions.push(lte(incomes.createdAt, d));
      }
    }

    const rows = await db
      .select({
        id: incomes.id,
        eventId: incomes.eventId,
        eventTitle: events.title,
        category: incomes.category,
        title: incomes.title,
        description: incomes.description,
        payer: incomes.payer,
        grossAmount: incomes.grossAmount,
        status: incomes.status,
        dueDate: incomes.dueDate,
        notes: incomes.notes,
        createdAt: incomes.createdAt,
        updatedAt: incomes.updatedAt,
      })
      .from(incomes)
      .leftJoin(events, eq(incomes.eventId, events.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(incomes.id));

    // ---- Attach received totals ----
    const incomeIds = rows.map((r) => r.id);
    const receivedMap = new Map<number, number>();

    if (incomeIds.length > 0) {
      const receiptRows = await db
        .select({
          incomeId: incomeReceipts.incomeId,
          amount: incomeReceipts.amount,
        })
        .from(incomeReceipts)
        .where(
          sql`${incomeReceipts.incomeId} IN (${sql.join(
            incomeIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      for (const r of receiptRows) {
        receivedMap.set(
          r.incomeId,
          (receivedMap.get(r.incomeId) ?? 0) + r.amount
        );
      }
    }

    const enriched = rows.map((r) => {
      const received = receivedMap.get(r.id) ?? 0;
      return {
        ...r,
        receivedAmount: received,
        balanceAmount: r.grossAmount - received,
      };
    });

    // ---- Summary from filtered rows (excludes cancelled) ----
    const activeRows = enriched.filter((r) => r.status !== "cancelled");
    const totalGross = activeRows.reduce((s, r) => s + r.grossAmount, 0);
    const totalReceived = activeRows.reduce((s, r) => s + r.receivedAmount, 0);
    const totalOutstanding = totalGross - totalReceived;

    return NextResponse.json({
      incomes: enriched,
      summary: {
        count: enriched.length,
        activeCount: activeRows.length,
        totalGross,
        totalReceived,
        totalOutstanding,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List incomes error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// POST /api/super-admin/incomes
// Create a new income record (no receipts yet — separate endpoint)
// ======================================================
export async function POST(req: NextRequest) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const body = await req.json();

    const category = String(body.category ?? "") as IncomeCategory;
    const title = String(body.title ?? "").trim();
    const description = body.description
      ? String(body.description).trim()
      : null;
    const payer = body.payer ? String(body.payer).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    const eventIdRaw = body.eventId;
    const eventId =
      eventIdRaw === null || eventIdRaw === undefined || eventIdRaw === ""
        ? null
        : Number(eventIdRaw);

    const grossAmount = Number(body.grossAmount);
    const dueDateRaw = body.dueDate;

    // ---- Validation ----
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!title || title.length > 255) {
      return NextResponse.json(
        { error: "Title is required (1–255 characters)" },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(grossAmount) ||
      !Number.isInteger(grossAmount) ||
      grossAmount <= 0
    ) {
      return NextResponse.json(
        { error: "grossAmount must be a positive integer (cents)" },
        { status: 400 }
      );
    }

    if (eventId !== null && (!Number.isInteger(eventId) || eventId <= 0)) {
      return NextResponse.json(
        { error: "eventId must be a valid number or null" },
        { status: 400 }
      );
    }

    let dueDate: Date | null = null;
    if (dueDateRaw) {
      const d = new Date(dueDateRaw);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid due date" },
          { status: 400 }
        );
      }
      dueDate = d;
    }

    // ---- Insert ----
    const [created] = await db
      .insert(incomes)
      .values({
        eventId,
        category,
        title,
        description,
        payer,
        grossAmount,
        status: "expected",
        dueDate,
        notes,
        createdBy: session.userId,
      })
      .returning();

    return NextResponse.json(
      {
        income: {
          ...created,
          receivedAmount: 0,
          balanceAmount: created.grossAmount,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create income error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}