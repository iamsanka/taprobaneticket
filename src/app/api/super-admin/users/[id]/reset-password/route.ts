import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

// ======================================================
// POST /api/super-admin/users/[id]/reset-password
// Sets a new password for an ADMIN / STAFF / AUDIT account.
//
// Notes:
// - This is an admin-driven reset (no email, no token). The
//   SUPER_ADMIN types the new password and communicates it to
//   the user out-of-band. That's the right flow for a small team.
// - Cannot reset a SUPER_ADMIN's password via this endpoint.
//   Change your own password through a separate self-service flow
//   (to be built later).
// ======================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN"]);

    const { id } = await params;
    const userId = Number(id);

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await req.json();
    const newPassword = String(body?.newPassword ?? "");

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    // ---- Fetch target ----
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ---- Safety: don't allow resetting a SUPER_ADMIN's password here ----
    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json(
        {
          error:
            "SUPER_ADMIN passwords cannot be reset here. Use the self-service change-password flow.",
        },
        { status: 403 }
      );
    }

    // ---- Hash + save ----
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));

    console.log(
      `Password reset: SUPER_ADMIN ${session.userId} reset password for user ${target.email} (id ${target.id})`
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Reset password error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}