import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/schema/index";
import { emailCampaigns } from "@/db/schema/emailCampaigns";
import { users } from "@/db/schema/users";
import { desc, eq } from "drizzle-orm";
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

export async function GET(req: NextRequest) {
  try {
    const user = getAdminOrSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const rows = await db
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        recipientType: emailCampaigns.recipientType,
        status: emailCampaigns.status,
        totalRecipients: emailCampaigns.totalRecipients,
        sentCount: emailCampaigns.sentCount,
        failedCount: emailCampaigns.failedCount,
        createdAt: emailCampaigns.createdAt,
        completedAt: emailCampaigns.completedAt,
        createdByEmail: users.email,
      })
      .from(emailCampaigns)
      .leftJoin(users, eq(emailCampaigns.createdBy, users.id))
      .orderBy(desc(emailCampaigns.id));

    return NextResponse.json({ campaigns: rows });
  } catch (err) {
    console.error("List campaigns error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}