import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import {
  emailCampaigns,
  emailCampaignRecipients,
} from "@/db/schema/emailCampaigns";
import { sendBulkEmail } from "@/lib/email/sendBulkEmail";
import { resolveRecipients } from "@/lib/email/resolveRecipients";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

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

const MAX_RECIPIENTS = 1000;

type IncomingRecipient = {
  email: string;
  name?: string | null;
};

type RecipientType = "customers" | "staff" | "manual";
type RecipientMode = "all-matching" | "specific";

export async function POST(req: NextRequest) {
  let campaignId: number | null = null;

  try {
    const user = getAdminOrSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const messageBody = String(body.body ?? "").trim();
    const recipientType = String(body.recipientType ?? "").trim() as RecipientType;
    const recipientMode = String(
      body.recipientMode ?? "specific"
    ).trim() as RecipientMode;

    const eventIdRaw = body.eventId;
    const eventId =
      eventIdRaw === null ||
      eventIdRaw === undefined ||
      eventIdRaw === "" ||
      eventIdRaw === "all"
        ? null
        : Number(eventIdRaw);

    const explicitRecipients: IncomingRecipient[] = Array.isArray(
      body.recipients
    )
      ? body.recipients
      : [];

    if (!name) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }

    if (!messageBody) {
      return NextResponse.json(
        { error: "Message body is required" },
        { status: 400 }
      );
    }

    if (!["customers", "staff", "manual"].includes(recipientType)) {
      return NextResponse.json(
        { error: "Invalid recipient type" },
        { status: 400 }
      );
    }

    if (!["all-matching", "specific"].includes(recipientMode)) {
      return NextResponse.json(
        { error: "Invalid recipient mode" },
        { status: 400 }
      );
    }

    if (recipientType === "manual" && recipientMode === "all-matching") {
      return NextResponse.json(
        { error: "Manual recipients require an explicit list" },
        { status: 400 }
      );
    }

    if (eventId !== null && (!Number.isInteger(eventId) || eventId <= 0)) {
      return NextResponse.json(
        { error: "eventId must be a valid number or empty" },
        { status: 400 }
      );
    }

    let rawList: { email: string; name: string | null }[];

    if (recipientMode === "all-matching") {
      if (recipientType === "customers") {
        rawList = await resolveRecipients({
          source: "customers",
          eventId,
        });
      } else if (recipientType === "staff") {
        rawList = await resolveRecipients({ source: "staff" });
      } else {
        return NextResponse.json(
          { error: "Manual recipients require an explicit list" },
          { status: 400 }
        );
      }

      if (rawList.length === 0) {
        return NextResponse.json(
          { error: "No recipients match this filter" },
          { status: 400 }
        );
      }
    } else {
      if (explicitRecipients.length === 0) {
        return NextResponse.json(
          { error: "At least one recipient is required" },
          { status: 400 }
        );
      }

      rawList = explicitRecipients.map((r) => ({
        email: String(r.email ?? "").trim(),
        name: r.name ? String(r.name).trim() || null : null,
      }));
    }

    const seen = new Set<string>();
    const cleanRecipients: { email: string; name: string | null }[] = [];

    for (const r of rawList) {
      const email = String(r.email ?? "").trim().toLowerCase();
      if (!email) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      cleanRecipients.push({
        email,
        name: r.name ?? null,
      });
    }

    if (cleanRecipients.length === 0) {
      return NextResponse.json(
        { error: "No valid recipients after deduplication" },
        { status: 400 }
      );
    }

    if (cleanRecipients.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        {
          error: `Cannot send to more than ${MAX_RECIPIENTS} recipients at once. This send would reach ${cleanRecipients.length}. Narrow the filter or split into batches.`,
        },
        { status: 400 }
      );
    }

    const [campaign] = await db
      .insert(emailCampaigns)
      .values({
        name,
        subject,
        body: messageBody,
        recipientType,
        status: "sending",
        totalRecipients: cleanRecipients.length,
        sentCount: 0,
        failedCount: 0,
        createdBy: user.userId,
      })
      .returning();

    campaignId = campaign.id;

    let sendResult;
    try {
      sendResult = await sendBulkEmail(
        cleanRecipients,
        subject,
        messageBody
      );
    } catch (sendErr) {
      await db
        .update(emailCampaigns)
        .set({
          status: "failed",
          completedAt: new Date(),
        })
        .where(eq(emailCampaigns.id, campaignId));

      console.error("Bulk send failed:", sendErr);
      return NextResponse.json(
        {
          error:
            sendErr instanceof Error
              ? sendErr.message
              : "Bulk send failed",
        },
        { status: 500 }
      );
    }

    const RECIPIENT_INSERT_CHUNK = 100;
    const now = new Date();

    for (
      let i = 0;
      i < sendResult.results.length;
      i += RECIPIENT_INSERT_CHUNK
    ) {
      const chunk = sendResult.results.slice(
        i,
        i + RECIPIENT_INSERT_CHUNK
      );
      await db.insert(emailCampaignRecipients).values(
        chunk.map((r) => ({
          campaignId: campaign.id,
          email: r.email,
          name: r.name,
          status: r.status,
          errorMessage: r.errorMessage ?? null,
          sentAt: now,
        }))
      );
    }

    let finalStatus: "sent" | "partial" | "failed";
    if (sendResult.failed === 0) {
      finalStatus = "sent";
    } else if (sendResult.sent === 0) {
      finalStatus = "failed";
    } else {
      finalStatus = "partial";
    }

    await db
      .update(emailCampaigns)
      .set({
        status: finalStatus,
        sentCount: sendResult.sent,
        failedCount: sendResult.failed,
        completedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, campaign.id));

    return NextResponse.json(
      {
        success: true,
        campaignId: campaign.id,
        status: finalStatus,
        total: sendResult.total,
        sent: sendResult.sent,
        failed: sendResult.failed,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Send email campaign error:", err);

    if (campaignId !== null) {
      try {
        await db
          .update(emailCampaigns)
          .set({
            status: "failed",
            completedAt: new Date(),
          })
          .where(eq(emailCampaigns.id, campaignId));
      } catch {
        // ignore
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}