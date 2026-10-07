import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  PDFImage,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PdfTicket = {
  ticketNumber: string;
  qrDataUrl: string;
  categoryName?: string;
  typeName?: string;
};

export type PdfOrder = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventTime: string;
  eventLocation: string;
  // ⭐ Settings-driven brand name shown in the ticket header
  brandName: string;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 420;
const M = 40;      // content margin
const BORDER = 6;  // colored border thickness

// ======================================================
// Brand colors — mirrors src/app/styles/globals.css
// ======================================================
const C = {
  primary: rgb(0.102, 0.451, 0.910),    // #1a73e8
  secondary: rgb(0.094, 0.353, 0.737),  // #185abc
  accent: rgb(0.831, 0.686, 0.216),     // #d4af37
  surface: rgb(1, 1, 1),                // #ffffff
  surfaceAlt: rgb(0.953, 0.965, 0.980), // #f3f6fa
  textMain: rgb(0.133, 0.133, 0.133),   // #222222
  textMuted: rgb(0.333, 0.333, 0.333),  // #555555
  textLight: rgb(1, 1, 1),
  border: rgb(0.878, 0.878, 0.878),     // #e0e0e0
};

// ======================================================
// Public API
// ======================================================

export async function generateTicketPdf(
  order: PdfOrder,
  ticket: PdfTicket
): Promise<Uint8Array> {
  if (!ticket) throw new Error("generateTicketPdf: ticket is required");
  if (!ticket.qrDataUrl) {
    throw new Error("generateTicketPdf: ticket.qrDataUrl is required");
  }
  if (!order.brandName || typeof order.brandName !== "string") {
    throw new Error("generateTicketPdf: order.brandName is required");
  }

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const logo = await loadLogo(pdfDoc);

  await drawTicketPage(pdfDoc, page, order, ticket, bold, regular, logo);

  return await pdfDoc.save();
}

// ======================================================
// Logo loader
// ======================================================

async function loadLogo(pdfDoc: PDFDocument): Promise<PDFImage | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.jpg");
    const bytes = await readFile(logoPath);

    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      try {
        return await pdfDoc.embedPng(bytes);
      } catch {
        console.warn("generateTicketPdf: logo could not be embedded");
        return null;
      }
    }
  } catch {
    console.warn("generateTicketPdf: logo not found at public/logo.jpg");
    return null;
  }
}

// ======================================================
// Page renderer
// ======================================================

async function drawTicketPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  bold: PDFFont,
  regular: PDFFont,
  logo: PDFImage | null
): Promise<void> {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;
  const left = M;
  const right = W - M;
  const contentW = right - left;

  // ==================================================
  // BACKGROUND: tinted base with brand border
  // ==================================================

  page.drawRectangle({
    x: 0, y: 0, width: W, height: H,
    color: C.surfaceAlt,
  });

  page.drawRectangle({
    x: 0, y: 0, width: BORDER, height: H,
    color: C.primary,
  });

  page.drawRectangle({
    x: W - BORDER, y: 0, width: BORDER, height: H,
    color: C.accent,
  });

  page.drawRectangle({
    x: BORDER, y: H - BORDER, width: (W - BORDER * 2) / 2, height: BORDER,
    color: C.primary,
  });
  page.drawRectangle({
    x: BORDER + (W - BORDER * 2) / 2, y: H - BORDER,
    width: (W - BORDER * 2) / 2, height: BORDER,
    color: C.accent,
  });

  page.drawRectangle({
    x: BORDER, y: 0, width: (W - BORDER * 2) / 2, height: BORDER,
    color: C.accent,
  });
  page.drawRectangle({
    x: BORDER + (W - BORDER * 2) / 2, y: 0,
    width: (W - BORDER * 2) / 2, height: BORDER,
    color: C.primary,
  });

  const cardX = BORDER + 14;
  const cardY = BORDER + 14;
  const cardW = W - (BORDER + 14) * 2;
  const cardH = H - (BORDER + 14) * 2;

  page.drawRectangle({
    x: cardX + 2, y: cardY - 2, width: cardW, height: cardH,
    color: rgb(0.86, 0.88, 0.91),
  });

  page.drawRectangle({
    x: cardX, y: cardY, width: cardW, height: cardH,
    color: C.surface,
  });

  // ==================================================
  // CONTENT
  // ==================================================
  const cLeft = cardX + 24;
  const cRight = cardX + cardW - 24;
  const cTop = cardY + cardH;

  // ---- Header: logo + brand name ----
  let brandX = cLeft;
  if (logo) {
    const maxSize = 40;
    const scale = Math.min(maxSize / logo.width, maxSize / logo.height);
    const logoW = logo.width * scale;
    const logoH = logo.height * scale;
    const logoY = cTop - 20 - logoH;
    page.drawImage(logo, { x: cLeft, y: logoY, width: logoW, height: logoH });
    brandX = cLeft + logoW + 12;
  }

  // Brand name is now parameterized (from app_settings)
  const brandText = truncateToWidth(
    safeText(order.brandName),
    bold,
    13,
    cRight - brandX - 20
  );

  page.drawText(brandText, {
    x: brandX,
    y: cTop - 46,
    size: 13,
    font: bold,
    color: C.textMain,
  });

  // ---- Header right: category badge + type name ----
  const categoryLabel = ticket.categoryName ?? "";
  const typeLabel = ticket.typeName ?? "";

  if (categoryLabel) {
    const badgeText = categoryLabel.toUpperCase();
    const badgeSize = 10;
    const padX = 12;
    const padY = 5;
    const textW = bold.widthOfTextAtSize(badgeText, badgeSize);
    const badgeW = textW + padX * 2;
    const badgeH = badgeSize + padY * 2;

    const isLounge = /lounge/i.test(categoryLabel);
    const badgeColor = isLounge ? C.accent : C.primary;
    const badgeTextColor = isLounge ? C.textMain : C.textLight;

    const badgeX = cRight - badgeW;
    const badgeY = cTop - 20 - badgeH;

    page.drawRectangle({
      x: badgeX, y: badgeY, width: badgeW, height: badgeH,
      color: badgeColor,
    });

    page.drawText(badgeText, {
      x: badgeX + padX,
      y: badgeY + padY + 1,
      size: badgeSize,
      font: bold,
      color: badgeTextColor,
    });
  }

  if (typeLabel) {
    const typeW = bold.widthOfTextAtSize(typeLabel, 14);
    page.drawText(typeLabel, {
      x: cRight - typeW,
      y: cTop - 58,
      size: 14,
      font: bold,
      color: C.textMain,
    });
  }

  // ---- Divider ----
  const dividerY = cTop - 78;
  page.drawLine({
    start: { x: cLeft, y: dividerY },
    end: { x: cRight, y: dividerY },
    thickness: 0.7,
    color: C.border,
  });

  // ---- Event title ----
  const titleText = truncateToWidth(
    safeText(order.eventTitle),
    bold,
    20,
    cRight - cLeft - 20
  );

  page.drawRectangle({
    x: cLeft,
    y: dividerY - 32,
    width: 3,
    height: 22,
    color: C.primary,
  });

  page.drawText(titleText, {
    x: cLeft + 12,
    y: dividerY - 30,
    size: 20,
    font: bold,
    color: C.textMain,
  });

  // ---- Details grid ----
  const colLeftX = cLeft;
  const colRightX = cLeft + 200;

  let detailY = dividerY - 86;

  drawLabelValue(page, "WHEN", order.eventTime, colLeftX, detailY, bold, regular);
  drawLabelValue(
    page,
    "VENUE",
    order.eventLocation,
    colRightX,
    detailY,
    bold,
    regular,
    280
  );

  detailY -= 58;
  drawLabelValue(page, "CATEGORY", categoryLabel || "-", colLeftX, detailY, bold, regular);
  drawLabelValue(page, "TYPE", typeLabel || "-", colRightX, detailY, bold, regular);

  detailY -= 58;
  drawLabelValue(
    page,
    "TICKET CODE",
    ticket.ticketNumber,
    colLeftX,
    detailY,
    bold,
    regular,
    340
  );

  // ==================================================
  // QR CODE (bottom-right of card)
  // ==================================================
  const qrSize = 150;
  const qrX = cRight - qrSize;
  const qrY = cardY + 40;

  // QR label above the box
  const qrLabelText = "SCAN AT ENTRANCE";
  const qrLabelW = bold.widthOfTextAtSize(qrLabelText, 8);
  page.drawText(qrLabelText, {
    x: qrX + (qrSize - qrLabelW) / 2,
    y: qrY + qrSize + 24,
    size: 8,
    font: bold,
    color: C.textMuted,
  });

  // Gray halo tile behind the frame — separates the QR from the white card
  page.drawRectangle({
    x: qrX - 14,
    y: qrY - 14,
    width: qrSize + 28,
    height: qrSize + 28,
    color: rgb(0.94, 0.94, 0.94),
  });

  // QR frame — solid black border gives the decoder a strong anchor
  page.drawRectangle({
    x: qrX - 8,
    y: qrY - 8,
    width: qrSize + 16,
    height: qrSize + 16,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
  });

  // Blue accent bar on top of the QR frame
  page.drawRectangle({
    x: qrX - 8,
    y: qrY + qrSize + 4,
    width: qrSize + 16,
    height: 3,
    color: C.primary,
  });

  const qrImage = await pdfDoc.embedPng(dataUrlToBytes(ticket.qrDataUrl));
  page.drawImage(qrImage, {
    x: qrX, y: qrY, width: qrSize, height: qrSize,
  });

  // ---- Footer ----
  page.drawText(safeText(`Order ${order.orderNumber}`), {
    x: cLeft,
    y: cardY + 22,
    size: 9,
    font: regular,
    color: C.textMuted,
  });

  page.drawText(safeText(`Issued to ${order.customerName}`), {
    x: cLeft,
    y: cardY + 10,
    size: 8,
    font: regular,
    color: C.textMuted,
  });
}

// ======================================================
// Helpers
// ======================================================

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  bold: PDFFont,
  regular: PDFFont,
  maxWidth?: number
) {
  page.drawText(label, {
    x, y,
    size: 8,
    font: bold,
    color: C.textMuted,
  });

  const safeValue = safeText(value || "-");
  const finalValue = maxWidth
    ? truncateToWidth(safeValue, bold, 13, maxWidth)
    : safeValue;

  page.drawText(finalValue, {
    x,
    y: y - 18,
    size: 13,
    font: bold,
    color: C.textMain,
  });
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + "...", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    throw new Error("generateTicketPdf: QR data URL is not a PNG data URL");
  }
  return Uint8Array.from(Buffer.from(match[1], "base64"));
}

function safeText(input: string): string {
  return input
    .replace(/[—–]/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}