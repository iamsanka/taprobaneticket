import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL!;

export type BulkRecipient = {
  email: string;
  /** Optional — used for {{name}} personalization */
  name?: string | null;
};

export type BulkRecipientResult = {
  email: string;
  name: string | null;
  status: "sent" | "failed";
  errorMessage?: string;
};

export type BulkSendResult = {
  total: number;
  sent: number;
  failed: number;
  results: BulkRecipientResult[];
};

/**
 * Replaces {{name}} with the recipient's name (or "there" as a fallback).
 * Case-insensitive, so {{Name}}, {{NAME}}, {{ name }} all work.
 */
function personalize(template: string, name: string | null): string {
  const safeName = (name ?? "").trim() || "there";
  return template.replace(/\{\{\s*name\s*\}\}/gi, escapeHtml(safeName));
}

/**
 * Wraps the body in a minimal, professional HTML shell so bare paragraph
 * text still renders correctly in email clients.
 * If the body already looks like full HTML (contains <html or <body),
 * we leave it alone.
 */
function wrapBody(body: string): string {
  const trimmed = body.trim();

  // Already full HTML — leave alone
  if (/<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed)) {
    return body;
  }

  // Otherwise wrap in a branded shell
  const brandColor = "#1a73e8";
  const textMain = "#222222";
  const textMuted = "#555555";
  const surfaceAlt = "#f3f6fa";
  const border = "#e0e0e0";

  // Convert newlines to <br> if the body isn't block-level HTML
  const hasBlockTags = /<(p|div|h[1-6]|ul|ol|br|table)[\s>]/i.test(trimmed);
  const htmlBody = hasBlockTags
    ? trimmed
    : trimmed.replace(/\n/g, "<br />");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:${surfaceAlt}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:${textMain};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${surfaceAlt};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="height:4px; background:${brandColor}; line-height:4px; font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px; font-size:15px; line-height:1.65; color:${textMain};">
              ${htmlBody}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; background:${surfaceAlt}; border-top:1px solid ${border}; font-size:12px; color:${textMuted}; line-height:1.5;">
              This message was sent by TaprobaneTicket.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends the same email to many recipients, one at a time.
 * Processes in chunks with a small delay between each send to
 * stay friendly to Resend's rate limits.
 *
 * Each recipient gets their own personalized copy. Failures are
 * recorded per-recipient — one failure never blocks the rest.
 *
 * @param recipients  List of {email, name?}
 * @param subject     Subject line — also supports {{name}}
 * @param body        HTML body — supports {{name}}
 * @param onProgress  Optional callback fired after each send
 *                    (useful for streaming updates to the UI)
 */
export async function sendBulkEmail(
  recipients: BulkRecipient[],
  subject: string,
  body: string,
  onProgress?: (result: BulkRecipientResult) => void
): Promise<BulkSendResult> {
  if (!recipients || recipients.length === 0) {
    throw new Error("sendBulkEmail: recipients is empty");
  }

  if (!subject || !subject.trim()) {
    throw new Error("sendBulkEmail: subject is required");
  }

  if (!body || !body.trim()) {
    throw new Error("sendBulkEmail: body is required");
  }

  const results: BulkRecipientResult[] = [];

  // Small delay every N sends to smooth out rate-limit pressure.
  const CHUNK_SIZE = 20;
  const DELAY_BETWEEN_CHUNKS_MS = 250;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    // Basic sanity check — skip obvious invalids
    if (!recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) {
      const result: BulkRecipientResult = {
        email: recipient.email || "(empty)",
        name: recipient.name ?? null,
        status: "failed",
        errorMessage: "Invalid email address",
      };
      results.push(result);
      onProgress?.(result);
      continue;
    }

    const personalizedSubject = personalize(subject, recipient.name ?? null);
    const personalizedBody = wrapBody(personalize(body, recipient.name ?? null));

    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: recipient.email,
        subject: personalizedSubject,
        html: personalizedBody,
      });

      if (error) {
        const result: BulkRecipientResult = {
          email: recipient.email,
          name: recipient.name ?? null,
          status: "failed",
          errorMessage: error.message,
        };
        results.push(result);
        onProgress?.(result);
      } else {
        const result: BulkRecipientResult = {
          email: recipient.email,
          name: recipient.name ?? null,
          status: "sent",
        };
        results.push(result);
        onProgress?.(result);
      }
    } catch (err) {
      const result: BulkRecipientResult = {
        email: recipient.email,
        name: recipient.name ?? null,
        status: "failed",
        errorMessage:
          err instanceof Error ? err.message : "Unknown network error",
      };
      results.push(result);
      onProgress?.(result);
    }

    // Chunk delay
    if ((i + 1) % CHUNK_SIZE === 0 && i + 1 < recipients.length) {
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.length - sent;

  return {
    total: results.length,
    sent,
    failed,
    results,
  };
}