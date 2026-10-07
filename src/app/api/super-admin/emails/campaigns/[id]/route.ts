import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/schema/index";
import {
  emailCampaigns,
  emailCampaignRecipients,
} from "@/db/schema/emailCampaigns";
import { users } from "@/db/schema/users";
import { eq, asc } from "drizzle-orm";
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAdminOrSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const campaignId = Number(id);

    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return NextResponse.json(
        { error: "Invalid campaign id" },
        { status: 400 }
      );
    }

    const [campaign] = await db
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        body: emailCampaigns.body,
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
      .where(eq(emailCampaigns.id, campaignId));

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const recipients = await db
      .select({
        id: emailCampaignRecipients.id,
        email: emailCampaignRecipients.email,
        name: emailCampaignRecipients.name,
        status: emailCampaignRecipients.status,
        errorMessage: emailCampaignRecipients.errorMessage,
        sentAt: emailCampaignRecipients.sentAt,
      })
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.campaignId, campaignId))
      .orderBy(asc(emailCampaignRecipients.email));

    return NextResponse.json({ campaign, recipients });
  } catch (err) {
    console.error("Get campaign error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}