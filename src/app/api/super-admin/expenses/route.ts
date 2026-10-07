import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { expenses } from "@/db/schema/expenses";
import { expensePayments } from "@/db/schema/expensePayments";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VALID_CATEGORIES = [
  "artists_crew",
  "production_equipment",
  "event_venue",
  "marketing",
  "operations",
  "admin",
  "travel",
  "catering",
  "other",
] as const;
type ExpenseCategory = (typeof VALID_CATEGORIES)[number];

const VALID_STATUSES = [
  "quote",
  "booked",
  "partial",
  "paid",
  "cancelled",
] as const;
type ExpenseStatus = (typeof VALID_STATUSES)[number];

// ======================================================
// GET /api/super-admin/expenses
// Filters (all optional):
//   eventId    — number / "all" / "none" (company-wide only)
//   category   — category or "all"
//   status     — status or "all"
//   dateFrom   — ISO date (created_at >=)
//   dateTo     — ISO date (created_at <=)
//   search     — substring match on title / supplier / subCategory
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
    const searchRaw = params.get("search");

    const conditions = [];

    if (eventIdRaw && eventIdRaw !== "all") {
      if (eventIdRaw === "none") {
        conditions.push(sql`${expenses.eventId} IS NULL`);
      } else {
        const id = Number(eventIdRaw);
        if (Number.isInteger(id)) {
          conditions.push(eq(expenses.eventId, id));
        }
      }
    }

    if (categoryRaw && categoryRaw !== "all") {
      conditions.push(eq(expenses.category, categoryRaw as ExpenseCategory));
    }

    if (statusRaw && statusRaw !== "all") {
      conditions.push(eq(expenses.status, statusRaw as ExpenseStatus));
    }

    if (dateFromRaw) {
      const d = new Date(dateFromRaw);
      if (!isNaN(d.getTime())) conditions.push(gte(expenses.createdAt, d));
    }
    if (dateToRaw) {
      const d = new Date(dateToRaw);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        conditions.push(lte(expenses.createdAt, d));
      }
    }

    if (searchRaw && searchRaw.trim()) {
      const q = `%${searchRaw.trim().toLowerCase()}%`;
      conditions.push(
        sql`(
          LOWER(${expenses.title}) LIKE ${q}
          OR LOWER(COALESCE(${expenses.supplier}, '')) LIKE ${q}
          OR LOWER(COALESCE(${expenses.subCategory}, '')) LIKE ${q}
        )`
      );
    }

    const rows = await db
      .select({
        id: expenses.id,
        eventId: expenses.eventId,
        eventTitle: events.title,
        category: expenses.category,
        title: expenses.title,
        description: expenses.description,
        supplier: expenses.supplier,
        subCategory: expenses.subCategory,
        grossAmount: expenses.grossAmount,
        status: expenses.status,
        issueDate: expenses.issueDate,
        dueDate: expenses.dueDate,
        notes: expenses.notes,
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt,
      })
      .from(expenses)
      .leftJoin(events, eq(expenses.eventId, events.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expenses.id));

    // ---- Attach paid totals ----
    const expenseIds = rows.map((r) => r.id);
    const paidMap = new Map<number, number>();

    if (expenseIds.length > 0) {
      const paymentRows = await db
        .select({
          expenseId: expensePayments.expenseId,
          amount: expensePayments.amount,
        })
        .from(expensePayments)
        .where(
          sql`${expensePayments.expenseId} IN (${sql.join(
            expenseIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      for (const p of paymentRows) {
        paidMap.set(p.expenseId, (paidMap.get(p.expenseId) ?? 0) + p.amount);
      }
    }

    const enriched = rows.map((r) => {
      const paid = paidMap.get(r.id) ?? 0;
      return {
        ...r,
        paidAmount: paid,
        balanceAmount: r.grossAmount - paid,
      };
    });

    // ---- Summary (excludes cancelled) ----
    const activeRows = enriched.filter((r) => r.status !== "cancelled");
    const totalGross = activeRows.reduce((s, r) => s + r.grossAmount, 0);
    const totalPaid = activeRows.reduce((s, r) => s + r.paidAmount, 0);
    const totalOutstanding = totalGross - totalPaid;

    // Overdue: has dueDate in the past, still has a balance
    const now = new Date();
    const overdueCount = activeRows.filter(
      (r) =>
        r.dueDate &&
        new Date(r.dueDate) < now &&
        r.balanceAmount > 0
    ).length;

    return NextResponse.json({
      expenses: enriched,
      summary: {
        count: enriched.length,
        activeCount: activeRows.length,
        totalGross,
        totalPaid,
        totalOutstanding,
        overdueCount,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List expenses error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// POST /api/super-admin/expenses
// Create a new expense record.
// ======================================================
export async function POST(req: NextRequest) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const body = await req.json();

    const category = String(body.category ?? "") as ExpenseCategory;
    const title = String(body.title ?? "").trim();
    const description = body.description
      ? String(body.description).trim()
      : null;
    const supplier = body.supplier ? String(body.supplier).trim() : null;
    const subCategory = body.subCategory
      ? String(body.subCategory).trim()
      : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    const eventIdRaw = body.eventId;
    const eventId =
      eventIdRaw === null || eventIdRaw === undefined || eventIdRaw === ""
        ? null
        : Number(eventIdRaw);

    const grossAmount = Number(body.grossAmount);

    // Optional status on create; defaults to "quote"
    const statusRaw = body.status ? String(body.status) : "quote";
    const status = statusRaw as ExpenseStatus;

    const issueDateRaw = body.issueDate;
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

    // On create, only these statuses make sense:
    //   quote, booked, paid, cancelled
    // "partial" is computed from payments, so we shouldn't allow it here.
    if (!["quote", "booked", "paid", "cancelled"].includes(status)) {
      return NextResponse.json(
        {
          error:
            "On create, status must be 'quote', 'booked', 'paid', or 'cancelled'",
        },
        { status: 400 }
      );
    }

    let issueDate: Date | null = null;
    if (issueDateRaw) {
      const d = new Date(issueDateRaw);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid issue date" },
          { status: 400 }
        );
      }
      issueDate = d;
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
      .insert(expenses)
      .values({
        eventId,
        category,
        title,
        description,
        supplier,
        subCategory,
        grossAmount,
        status,
        issueDate,
        dueDate,
        notes,
        createdBy: session.userId,
      })
      .returning();

    return NextResponse.json(
      {
        expense: {
          ...created,
          paidAmount: 0,
          balanceAmount: created.grossAmount,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create expense error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}