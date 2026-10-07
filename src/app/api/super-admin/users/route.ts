import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { eq, desc, ne } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const CREATABLE_ROLES = ["ADMIN", "STAFF", "AUDIT"] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

const MIN_PASSWORD_LENGTH = 8;

// ======================================================
// GET /api/super-admin/users
// List users.
// - SUPER_ADMIN sees everyone (including other super admins).
// - ADMIN sees everyone EXCEPT super admins.
// ======================================================
export async function GET(req: NextRequest) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      // Hide SUPER_ADMIN users from ADMIN callers
      .where(session.role === "ADMIN" ? ne(users.role, "SUPER_ADMIN") : undefined)
      .orderBy(desc(users.id));

    return NextResponse.json({ users: rows });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List users error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// POST /api/super-admin/users
// Create a new user (ADMIN / STAFF / AUDIT).
// Both SUPER_ADMIN and ADMIN can create these roles.
// ======================================================
export async function POST(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const role = String(body?.role ?? "") as CreatableRole;

    // ---- Validation ----
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    if (!CREATABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${CREATABLE_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // ---- Duplicate check ----
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    // ---- Hash + insert ----
    const passwordHash = await bcrypt.hash(password, 10);

    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role,
        isActive: true,
      })
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create user error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}