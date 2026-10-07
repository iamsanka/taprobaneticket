import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { users } from "@/db/schema/users";
import { eq, and, sql, ne } from "drizzle-orm";

export type ResolvedRecipient = {
  email: string;
  name: string | null;
};

export type ResolveInput =
  | { source: "customers"; eventId: number | null }
  | { source: "staff" };

/**
 * Resolves the full recipient list for "send to all matching" mode.
 *
 * This is called server-side during the actual send, so we don't need
 * the client to hold every email address in memory. It can return many
 * thousands of rows — callers should apply their own caps.
 */
export async function resolveRecipients(
  input: ResolveInput
): Promise<ResolvedRecipient[]> {
  // ==================================================
  // CUSTOMERS
  // ==================================================
  if (input.source === "customers") {
    const conditions = [
      eq(orders.status, "paid"),
      sql`${orders.customerEmail} IS NOT NULL`,
      sql`${orders.customerEmail} <> ''`,
    ];

    if (input.eventId !== null && Number.isInteger(input.eventId)) {
      conditions.push(eq(orders.eventId, input.eventId));
    }

    const rows = await db
      .select({
        email: orders.customerEmail,
        name: sql<string>`MAX(${orders.customerName})`,
      })
      .from(orders)
      .where(and(...conditions))
      .groupBy(orders.customerEmail)
      .orderBy(orders.customerEmail);

    return rows.map((r) => ({
      email: r.email,
      name: r.name ?? null,
    }));
  }

  // ==================================================
  // STAFF
  // ==================================================
  if (input.source === "staff") {
    const rows = await db
      .select({
        email: users.email,
      })
      .from(users)
      .where(
        and(
          ne(users.role, "CUSTOMER"),
          eq(users.isActive, true),
          sql`${users.email} IS NOT NULL`
        )
      )
      .orderBy(users.email);

    return rows.map((r) => ({
      email: r.email,
      name: null,
    }));
  }

  return [];
}