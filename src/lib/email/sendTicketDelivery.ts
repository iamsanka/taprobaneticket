import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL!;

export type TicketAttachment = {
  filename: string;
  content: Uint8Array;
};

export type SendTicketDeliveryProps = {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  eventTitle: string;
  eventTime: string;
  eventLocation: string;
  ticketCount: number;
  /** One ticket PDF per ticket */
  attachments: TicketAttachment[];
  /** Single invoice PDF for the whole order */
  invoicePdf: Uint8Array;
  /** Invoice number — used for the filename */
  invoiceNumber: string;
};

export async function sendTicketDelivery({
  customerName,
  customerEmail,
  orderNumber,
  eventTitle,
  eventTime,
  eventLocation,
  ticketCount,
  attachments,
  invoicePdf,
  invoiceNumber,
}: SendTicketDeliveryProps): Promise<void> {
  if (!attachments || attachments.length === 0) {
    throw new Error("sendTicketDelivery: at least one attachment is required");
  }

  if (attachments.length !== ticketCount) {
    throw new Error(
      `sendTicketDelivery: expected ${ticketCount} attachments, got ${attachments.length}`
    );
  }

  if (!invoicePdf || invoicePdf.length === 0) {
    throw new Error("sendTicketDelivery: invoicePdf is empty");
  }

  const ticketWord = ticketCount === 1 ? "ticket" : "tickets";
  const isAre = ticketCount === 1 ? "is" : "are";
  const year = new Date().getFullYear();

  const resendAttachments = [
    ...attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString("base64"),
    })),
    {
      filename: `invoice-${invoiceNumber}.pdf`,
      content: Buffer.from(invoicePdf).toString("base64"),
    },
  ];

  const html = buildEmailHtml({
    customerName,
    orderNumber,
    eventTitle,
    eventTime,
    eventLocation,
    ticketCount,
    ticketWord,
    isAre,
    year,
  });

  const { error } = await resend.emails.send({
    from: FROM,
    to: customerEmail,
    subject: `Your tickets for ${eventTitle} - Order ${orderNumber}`,
    html,
    attachments: resendAttachments,
  });

  if (error) {
    throw new Error(
      `sendTicketDelivery: Resend failed for order ${orderNumber}: ${error.message}`
    );
  }
}

const BRAND = {
  primary: "#1a73e8",
  secondary: "#185abc",
  accent: "#d4af37",
  surface: "#ffffff",
  surfaceAlt: "#f3f6fa",
  textMain: "#222222",
  textMuted: "#555555",
  textLight: "#ffffff",
  border: "#e0e0e0",
};

type BuildEmailHtmlProps = {
  customerName: string;
  orderNumber: string;
  eventTitle: string;
  eventTime: string;
  eventLocation: string;
  ticketCount: number;
  ticketWord: string;
  isAre: string;
  year: number;
};

function buildEmailHtml({
  customerName,
  orderNumber,
  eventTitle,
  eventTime,
  eventLocation,
  ticketCount,
  ticketWord,
  isAre,
  year,
}: BuildEmailHtmlProps): string {
  const e = escapeHtml;
  const B = BRAND;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <title>Your tickets for ${e(eventTitle)}</title>
</head>
<body style="margin:0; padding:0; background-color:${B.surfaceAlt}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${B.surfaceAlt};">
    Your ${ticketCount} ${e(ticketWord)} for ${e(eventTitle)} ${isAre} attached. Order ${e(orderNumber)}.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.surfaceAlt};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background:${B.surface}; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <tr>
            <td style="background-color:${B.secondary}; padding:22px 32px;">
              <span style="font-size:16px; font-weight:700; color:${B.textLight}; letter-spacing:0.3px;">
                Taprobane<span style="color:${B.accent};">Ticket</span>
              </span>
            </td>
          </tr>

          <tr>
            <td style="height:4px; background:linear-gradient(90deg, ${B.primary} 0%, ${B.accent} 100%); line-height:4px; font-size:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:40px 32px 8px 32px;">
              <h1 style="margin:0 0 12px 0; font-size:24px; font-weight:700; color:${B.textMain}; line-height:1.3;">
                Your tickets are ready 🎟️
              </h1>
              <p style="margin:0; font-size:15px; color:${B.textMuted}; line-height:1.6;">
                Hi ${e(customerName)}, thanks for your purchase. Your ${ticketCount} ${e(ticketWord)} ${isAre} attached to this email as separate PDF files.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.surfaceAlt}; border:1px solid ${B.border}; border-left:3px solid ${B.primary}; border-radius:10px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <p style="margin:0 0 6px 0; font-size:11px; font-weight:700; color:${B.primary}; letter-spacing:0.8px; text-transform:uppercase;">Event</p>
                    <p style="margin:0 0 18px 0; font-size:19px; font-weight:700; color:${B.textMain}; line-height:1.3;">${e(eventTitle)}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-size:13px; color:${B.textMuted}; padding:4px 0; vertical-align:top;">When</td>
                        <td style="font-size:13px; color:${B.textMain}; padding:4px 0; text-align:right; font-weight:500;">${e(eventTime)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px; color:${B.textMuted}; padding:4px 0; vertical-align:top;">Where</td>
                        <td style="font-size:13px; color:${B.textMain}; padding:4px 0; text-align:right; font-weight:500;">${e(eventLocation)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 8px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:13px; color:${B.textMuted}; padding:6px 0;">Order number</td>
                  <td style="font-size:13px; color:${B.textMain}; padding:6px 0; text-align:right; font-weight:600;">${e(orderNumber)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px; color:${B.textMuted}; padding:6px 0;">Tickets</td>
                  <td style="font-size:13px; color:${B.textMain}; padding:6px 0; text-align:right; font-weight:600;">${ticketCount}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0 32px;">
              <div style="height:1px; background-color:${B.border}; line-height:1px; font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0 32px;">
              <p style="margin:0 0 8px 0; font-size:15px; font-weight:700; color:${B.textMain};">Attached files</p>
              <p style="margin:0; font-size:14px; color:${B.textMuted}; line-height:1.6;">
                Each ticket is a separate PDF with its own unique QR code - perfect for forwarding to friends or family attending separately. Your invoice is also attached for your records.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.surfaceAlt}; border-left:3px solid ${B.accent}; border-radius:6px;">
                <tr>
                  <td style="padding:14px 18px; font-size:13px; color:${B.textMain}; line-height:1.6;">
                    <strong style="color:${B.secondary};">Tip:</strong> Some email clients (like Gmail) only show the first few attachments by default. Look for the <em>"N more"</em> link to see all ${ticketCount} ticket PDFs.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 8px 32px;">
              <p style="margin:0; font-size:14px; color:${B.textMuted}; line-height:1.6;">
                Please bring your ticket PDF(s) to the entrance. Each QR code is unique and will only be scanned once.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:${B.primary}; border-radius:8px;">
                    <a href="mailto:orders@restaurantapp.eu.org" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:600; color:${B.textLight}; text-decoration:none; border-radius:8px;">
                      Contact Support
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:${B.surfaceAlt}; padding:24px 32px; border-top:1px solid ${B.border};">
              <p style="margin:0 0 8px 0; font-size:13px; color:${B.textMuted}; line-height:1.6;">
                Questions? Reply to this email or contact us at
                <a href="mailto:orders@restaurantapp.eu.org" style="color:${B.primary}; text-decoration:none; font-weight:500;">orders@restaurantapp.eu.org</a>.
              </p>
              <p style="margin:0 0 16px 0; font-size:12px; color:${B.textMuted}; line-height:1.6;">
                If you did not make this purchase, please contact us immediately.
              </p>
              <p style="margin:0; font-size:12px; color:${B.textMuted};">
                © ${year} TaprobaneTicket. All rights reserved.
              </p>
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