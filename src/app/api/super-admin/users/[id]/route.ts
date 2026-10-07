import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const EDITABLE_ROLES = ["ADMIN", "STAFF", "AUDIT"] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

// ======================================================
// GET /api/super-admin/users/[id]
// SUPER_ADMIN and ADMIN can read any non-super-admin user.
// SUPER_ADMIN can also read other super admins.
// ======================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const userId = Number(id);

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ---- ADMIN cannot see SUPER_ADMIN users at all ----
    if (session.role === "ADMIN" && user.role === "SUPER_ADMIN") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get user error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// PATCH /api/super-admin/users/[id]
// Update role and/or isActive.
// - SUPER_ADMIN can edit any non-super-admin user.
// - ADMIN can edit any non-super-admin user.
// - Neither can edit a SUPER_ADMIN through this endpoint.
// - Neither can change their own role or deactivate themselves.
// ======================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const userId = Number(id);

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Partial<{ role: EditableRole; isActive: boolean }> = {};

    // ---- Role update ----
    if (body.role !== undefined) {
      const role = String(body.role) as EditableRole;
      if (!EDITABLE_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role must be one of: ${EDITABLE_ROLES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.role = role;
    }

    // ---- isActive update ----
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { error: "isActive must be a boolean" },
          { status: 400 }
        );
      }
      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // ---- Fetch the target user for safety checks ----
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ---- Safety: don't let a user demote or disable themselves ----
    if (target.id === session.userId) {
      if (updates.role !== undefined) {
        return NextResponse.json(
          { error: "You cannot change your own role" },
          { status: 400 }
        );
      }
      if (updates.isActive === false) {
        return NextResponse.json(
          { error: "You cannot deactivate your own account" },
          { status: 400 }
        );
      }
    }

    // ---- Safety: SUPER_ADMIN targets are protected from both roles ----
    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json(
        {
          error:
            "SUPER_ADMIN accounts cannot be modified through this endpoint",
        },
        { status: 403 }
      );
    }

    // ---- Apply ----
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });

    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Update user error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// DELETE /api/super-admin/users/[id]
// SUPER_ADMIN only. Two-step: must be deactivated first.
// ======================================================
export async function DELETE(
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

    if (userId === session.userId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "SUPER_ADMIN accounts cannot be deleted via this endpoint" },
        { status: 403 }
      );
    }

    if (target.isActive) {
      return NextResponse.json(
        {
          error:
            "Deactivate this user first, then delete. This two-step flow prevents accidental deletions.",
        },
        { status: 400 }
      );
    }

    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete user error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}