import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { users } from "@/db/schema/users";
import { eq, sql, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

function getAdminOrSuperAdmin(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as {
      userId: number;
      role: string;
    };
    return decoded.role === "SUPER_ADMIN" || decoded.role === "ADMIN"
      ? decoded
      : null;
  } catch {
    return null;
  }
}

const DEFAULT_PREVIEW_LIMIT = 50;
const MAX_PREVIEW_LIMIT = 200;

type PreviewRecipient = {
  email: string;
  name: string | null;
  meta: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const user = getAdminOrSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const params = req.nextUrl.searchParams;
    const source = (params.get("source") || "customers").trim().toLowerCase();

    const eventIdRaw = params.get("eventId");
    const eventId =
      eventIdRaw && eventIdRaw !== "all" && eventIdRaw !== ""
        ? Number(eventIdRaw)
        : null;

    const search = (params.get("search") || "").trim().toLowerCase();

    const previewLimitRaw = Number(params.get("previewLimit"));
    const previewLimit = Number.isInteger(previewLimitRaw)
      ? Math.min(Math.max(previewLimitRaw, 1), MAX_PREVIEW_LIMIT)
      : DEFAULT_PREVIEW_LIMIT;

    // ==================================================
    // CUSTOMERS
    // ==================================================
    if (source === "customers") {
      const conditions = [
        eq(orders.status, "paid"),
        sql`${orders.customerEmail} IS NOT NULL`,
        sql`${orders.customerEmail} <> ''`,
      ];

      if (eventId !== null && Number.isInteger(eventId)) {
        conditions.push(eq(orders.eventId, eventId));
      }

      const [{ count: totalCount }] = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${orders.customerEmail})`,
        })
        .from(orders)
        .where(and(...conditions));

      let filteredCount = Number(totalCount);

      if (search) {
        const [{ count: filtered }] = await db
          .select({
            count: sql<number>`COUNT(DISTINCT ${orders.customerEmail})`,
          })
          .from(orders)
          .where(
            and(
              ...conditions,
              sql`LOWER(${orders.customerEmail}) LIKE ${"%" + search + "%"}`
            )
          );
        filteredCount = Number(filtered);
      }

      const previewConditions = [...conditions];
      if (search) {
        previewConditions.push(
          sql`LOWER(${orders.customerEmail}) LIKE ${"%" + search + "%"}`
        );
      }

      const previewRows = await db
        .select({
          email: orders.customerEmail,
          name: sql<string>`MAX(${orders.customerName})`,
          orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(and(...previewConditions))
        .groupBy(orders.customerEmail)
        .orderBy(orders.customerEmail)
        .limit(previewLimit);

      const preview: PreviewRecipient[] = previewRows.map((r) => ({
        email: r.email,
        name: r.name,
        meta: `${r.orderCount} ${
          Number(r.orderCount) === 1 ? "order" : "orders"
        }`,
      }));

      return NextResponse.json({
        source: "customers",
        totalCount: Number(totalCount),
        filteredCount: Number(filteredCount),
        preview,
        previewLimit,
        hasMore: filteredCount > preview.length,
      });
    }

    // ==================================================
    // STAFF
    // ==================================================
    if (source === "staff") {
      const conditions = [
        sql`${users.role} <> 'CUSTOMER'`,
        eq(users.isActive, true),
        sql`${users.email} IS NOT NULL`,
      ];

      const [{ count: totalCount }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(and(...conditions));

      let filteredCount = Number(totalCount);
      if (search) {
        const [{ count: filtered }] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(users)
          .where(
            and(
              ...conditions,
              sql`LOWER(${users.email}) LIKE ${"%" + search + "%"}`
            )
          );
        filteredCount = Number(filtered);
      }

      const previewConditions = [...conditions];
      if (search) {
        previewConditions.push(
          sql`LOWER(${users.email}) LIKE ${"%" + search + "%"}`
        );
      }

      const previewRows = await db
        .select({
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(and(...previewConditions))
        .orderBy(users.email)
        .limit(previewLimit);

      const preview: PreviewRecipient[] = previewRows.map((r) => ({
        email: r.email,
        name: null,
        meta: r.role,
      }));

      return NextResponse.json({
        source: "staff",
        totalCount: Number(totalCount),
        filteredCount: Number(filteredCount),
        preview,
        previewLimit,
        hasMore: filteredCount > preview.length,
      });
    }

    return NextResponse.json(
      { error: "Invalid source. Must be 'customers' or 'staff'." },
      { status: 400 }
    );
  } catch (err) {
    console.error("List email recipients error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}