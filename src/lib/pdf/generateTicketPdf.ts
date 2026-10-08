import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  PDFImage,
  LineCapStyle,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PdfTicket = {
  ticketNumber: string;
  qrDataUrl: string;
  categoryName?: string;
  typeName?: string;
  seatLabel?: string;
  unitPrice?: number; // cents
};

export type PdfOrder = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventTime: string;
  eventLocation: string;
  brandName: string;
  ticketImageUrl?: string;
  ticketImageTextColor?: "light" | "dark";
  eventDate?: string;
  eventStartTime?: string;
};

// ======================================================
// A5 portrait
// ======================================================
const PAGE_WIDTH = 420;
const PAGE_HEIGHT = 595;

// ======================================================
// Brand palette — matches globals.css
// ======================================================
const C = {
  primary: rgb(0.165, 0.545, 0.769),    // #2a8bc4
  secondary: rgb(0.878, 0.478, 0.337),  // #e07a56
  accent: rgb(0.831, 0.686, 0.216),     // #d4af37
  surface: rgb(1, 1, 1),
  surfaceAlt: rgb(0.953, 0.965, 0.980),
  textMain: rgb(0.133, 0.133, 0.133),
  textMuted: rgb(0.333, 0.333, 0.333),
  textLight: rgb(1, 1, 1),
  border: rgb(0.878, 0.878, 0.878),
  seatBg: rgb(0.988, 0.929, 0.796),
};

// ======================================================
// Layout constants
// ======================================================
const CARD_X = 16;
const CARD_W = PAGE_WIDTH - CARD_X * 2;   // 388
const CARD_H = 180;
const CARD_Y = 230;
const CARD_TOP = CARD_Y + CARD_H;          // 410
const CARD_PAD = 20;
const CONTENT_LEFT = CARD_X + CARD_PAD;    // 36
const CONTENT_RIGHT = CARD_X + CARD_W - CARD_PAD; // 384

// Row baselines inside the card
const ROW1_Y = CARD_TOP - 42;   // 368 — Location / Category / Type
const ROW2_Y = ROW1_Y - 42;     // 326 — Date & Time / Price
const ROW3_Y = ROW2_Y - 42;     // 284 — Seat (optional)

// QR code
const QR_SIZE = 100; //qr code size 110*110
const QR_X = PAGE_WIDTH - QR_SIZE - 40;  // right alogned with 30pt margin
const QR_Y = 70; //vertical position from the bottom of the page

// Footer
const FOOTER_Y = 22;

// ======================================================
// Entry point
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

  const wantPhoto = !!(order.ticketImageUrl && order.ticketImageTextColor);
  let ticketImage: PDFImage | null = null;
  if (wantPhoto) {
    ticketImage = await loadTicketBackground(pdfDoc, order.ticketImageUrl!);
  }

  if (ticketImage) {
    await drawPhotoMode(pdfDoc, page, order, ticket, bold, regular, ticketImage);
  } else {
    await drawClassicMode(pdfDoc, page, order, ticket, bold, regular);
  }

  return await pdfDoc.save();
}

// ======================================================
// Image loaders
// ======================================================

const bgCache = new Map<string, Uint8Array>();
const BG_CACHE_MAX = 20;

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  const hit = bgCache.get(url);
  if (hit) return hit;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `generateTicketPdf: ticket image HTTP ${res.status} for ${url}`
      );
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());

    if (bgCache.size >= BG_CACHE_MAX) {
      const firstKey = bgCache.keys().next().value;
      if (firstKey) bgCache.delete(firstKey);
    }
    bgCache.set(url, buf);
    return buf;
  } catch (err) {
    console.warn("generateTicketPdf: ticket image fetch failed:", err);
    return null;
  }
}

async function loadTicketBackground(
  pdfDoc: PDFDocument,
  url: string
): Promise<PDFImage | null> {
  const bytes = await fetchImageBytes(url);
  if (!bytes) return null;
  try {
    return await pdfDoc.embedJpg(bytes);
  } catch {
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      console.warn("generateTicketPdf: could not embed ticket image");
      return null;
    }
  }
}

// ======================================================
// Photo mode
// ======================================================

async function drawPhotoMode(
  pdfDoc: PDFDocument,
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  bold: PDFFont,
  regular: PDFFont,
  bg: PDFImage
): Promise<void> {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;

  const scale = Math.max(W / bg.width, H / bg.height);
  const drawW = bg.width * scale;
  const drawH = bg.height * scale;
  const x = (W - drawW) / 2;
  const y = (H - drawH) / 2;

  page.drawImage(bg, { x, y, width: drawW, height: drawH });

  // ---- Card shadow (soft, adds depth) ----
  page.drawRectangle({
    x: CARD_X + 2,
    y: CARD_Y - 4,
    width: CARD_W,
    height: CARD_H,
    color: rgb(0, 0, 0),
    opacity: 0.22,
  });

  // ⭐ Semi-transparent frosted card (was opaque white)
  page.drawRectangle({
    x: CARD_X,
    y: CARD_Y,
    width: CARD_W,
    height: CARD_H,
    color: C.surface,
    opacity: 0.85,
  });

  // Thin brand stripe on the left edge of the card
  page.drawRectangle({
    x: CARD_X,
    y: CARD_Y,
    width: 4,
    height: CARD_H,
    color: C.primary,
  });

  await drawDetails(pdfDoc, page, order, ticket, bold, regular);
  await drawQrAndFooter(pdfDoc, page, order, ticket, bold, regular);
}

// ======================================================
// Classic mode
// ======================================================

async function drawClassicMode(
  pdfDoc: PDFDocument,
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  bold: PDFFont,
  regular: PDFFont
): Promise<void> {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;

  page.drawRectangle({
    x: 0, y: 0, width: W, height: H,
    color: C.surfaceAlt,
  });

  const B = 6;
  page.drawRectangle({ x: 0, y: 0, width: B, height: H, color: C.primary });
  page.drawRectangle({ x: W - B, y: 0, width: B, height: H, color: C.accent });
  page.drawRectangle({
    x: B, y: H - B, width: (W - B * 2) / 2, height: B, color: C.primary,
  });
  page.drawRectangle({
    x: B + (W - B * 2) / 2, y: H - B, width: (W - B * 2) / 2, height: B,
    color: C.accent,
  });
  page.drawRectangle({
    x: B, y: 0, width: (W - B * 2) / 2, height: B, color: C.accent,
  });
  page.drawRectangle({
    x: B + (W - B * 2) / 2, y: 0, width: (W - B * 2) / 2, height: B,
    color: C.primary,
  });

  await drawClassicHeader(page, order, ticket, bold);

  // Card (opaque in classic mode)
  page.drawRectangle({
    x: CARD_X + 2,
    y: CARD_Y - 4,
    width: CARD_W,
    height: CARD_H,
    color: rgb(0, 0, 0),
    opacity: 0.06,
  });
  page.drawRectangle({
    x: CARD_X, y: CARD_Y, width: CARD_W, height: CARD_H,
    color: C.surface,
  });
  page.drawRectangle({
    x: CARD_X, y: CARD_Y, width: 4, height: CARD_H,
    color: C.primary,
  });

  await drawDetails(pdfDoc, page, order, ticket, bold, regular);
  await drawQrAndFooter(pdfDoc, page, order, ticket, bold, regular);
}

async function drawClassicHeader(
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  bold: PDFFont
): Promise<void> {
  const cLeft = 30;
  const cRight = PAGE_WIDTH - 30;

  page.drawText(safeText(order.brandName), {
    x: cLeft, y: PAGE_HEIGHT - 60,
    size: 11, font: bold, color: C.primary,
  });

  const titleLines = wrapToMaxLines(
    safeText(order.eventTitle),
    bold,
    22,
    cRight - cLeft,
    2
  );

  const titleStartY = PAGE_HEIGHT - 100;
  titleLines.forEach((line, i) => {
    page.drawText(line, {
      x: cLeft, y: titleStartY - i * 26,
      size: 22, font: bold, color: C.textMain,
    });
  });

  if (ticket.categoryName) {
    const badgeText = ticket.categoryName.toUpperCase();
    const badgeSize = 9;
    const padX = 10;
    const padY = 4;
    const textW = bold.widthOfTextAtSize(badgeText, badgeSize);
    const badgeW = textW + padX * 2;
    const badgeH = badgeSize + padY * 2;
    const badgeX = cLeft;
    const badgeY = titleStartY - (titleLines.length - 1) * 26 - 34;

    page.drawRectangle({
      x: badgeX, y: badgeY,
      width: badgeW, height: badgeH,
      color: C.primary,
    });
    page.drawText(badgeText, {
      x: badgeX + padX, y: badgeY + padY + 1,
      size: badgeSize, font: bold, color: C.textLight,
    });
  }
}

// ======================================================
// Details — rows inside the card
// ======================================================

async function drawDetails(
  pdfDoc: PDFDocument,
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  bold: PDFFont,
  regular: PDFFont
): Promise<void> {
  const categoryLabel = ticket.categoryName ?? "";
  const typeLabel = ticket.typeName ?? "";

  // ---------- ROW 1: Location | Category badge | Type ----------
  // Pin icon
  drawPinIcon(page, CONTENT_LEFT + 6, ROW1_Y + 2, 11, C.primary);

  const locationText = truncateToWidth(
    safeText(order.eventLocation || "—"),
    bold,
    12,
    150
  );
  page.drawText(locationText, {
    x: CONTENT_LEFT + 18, y: ROW1_Y - 2,
    size: 12, font: bold, color: C.textMain,
  });

  // Right side: [CATEGORY] [TYPE]
  if (typeLabel) {
    const typeText = truncateToWidth(safeText(typeLabel), bold, 12, 100);
    const typeW = bold.widthOfTextAtSize(typeText, 12);
    page.drawText(typeText, {
      x: CONTENT_RIGHT - typeW,
      y: ROW1_Y - 2,
      size: 12, font: bold, color: C.textMain,
    });

    if (categoryLabel) {
      const badgeText = categoryLabel.toUpperCase();
      const badgeSize = 9;
      const padX = 8;
      const padY = 3;
      const textW = bold.widthOfTextAtSize(badgeText, badgeSize);
      const badgeW = textW + padX * 2;
      const badgeH = badgeSize + padY * 2;
      const badgeX = CONTENT_RIGHT - typeW - 10 - badgeW;
      const badgeY = ROW1_Y - 5;

      const isLounge = /lounge/i.test(categoryLabel);
      const badgeColor = isLounge ? C.accent : C.primary;
      const badgeTextColor = isLounge ? C.textMain : C.textLight;

      page.drawRectangle({
        x: badgeX, y: badgeY,
        width: badgeW, height: badgeH,
        color: badgeColor,
      });
      page.drawText(badgeText, {
        x: badgeX + padX, y: badgeY + padY + 1,
        size: badgeSize, font: bold, color: badgeTextColor,
      });
    }
  }

  // ---------- ROW 2: Date & Time | Price ----------
  drawCalendarIcon(page, CONTENT_LEFT + 6, ROW2_Y + 2, 11, C.primary);

  const dateText = truncateToWidth(
    safeText(order.eventTime || "—"),
    bold,
    12,
    170
  );
  page.drawText(dateText, {
    x: CONTENT_LEFT + 18, y: ROW2_Y - 2,
    size: 12, font: bold, color: C.textMain,
  });

  if (ticket.unitPrice !== undefined && ticket.unitPrice > 0) {
    const priceText = `€${(ticket.unitPrice / 100).toFixed(2)}`;
    const priceSize = 16;
    const priceW = bold.widthOfTextAtSize(priceText, priceSize);
    page.drawText(priceText, {
      x: CONTENT_RIGHT - priceW,
      y: ROW2_Y - 4,
      size: priceSize, font: bold, color: C.secondary,
    });
  }

  // ---------- ROW 3: Seat (only if seated) ----------
  if (ticket.seatLabel) {
    // Chair icon
    drawSeatIcon(page, CONTENT_LEFT + 6, ROW3_Y + 2, 11, C.accent);

    // "SEAT" label
    page.drawText("SEAT", {
      x: CONTENT_LEFT + 18, y: ROW3_Y + 2,
      size: 9, font: bold, color: C.textMuted,
    });

    // Seat value — big and prominent
    const seatText = safeText(ticket.seatLabel);
    page.drawText(seatText, {
      x: CONTENT_LEFT + 18, y: ROW3_Y - 14,
      size: 18, font: bold, color: C.primary,
    });

    // Gold accent pill behind the seat value
    const seatW = bold.widthOfTextAtSize(seatText, 18);
    page.drawRectangle({
      x: CONTENT_LEFT + 12, y: ROW3_Y - 20,
      width: seatW + 12, height: 26,
      color: C.seatBg,
      opacity: 0.65,
    });
    // Redraw the text on top of the pill
    page.drawText(seatText, {
      x: CONTENT_LEFT + 18, y: ROW3_Y - 14,
      size: 18, font: bold, color: C.primary,
    });
  }

  void pdfDoc;
  void regular;
}

// ======================================================
// QR code + footer
// ======================================================

async function drawQrAndFooter(
  pdfDoc: PDFDocument,
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  bold: PDFFont,
  regular: PDFFont
): Promise<void> {
  // "SCAN AT ENTRANCE" label
  const scanText = "SCAN AT ENTRANCE";
  const scanSize = 8;
  const scanW = bold.widthOfTextAtSize(scanText, scanSize);
  page.drawText(scanText, {
    x: QR_X + (QR_SIZE - scanW) / 2,
    y: QR_Y + QR_SIZE + 12,
    size: scanSize, font: bold, color: C.textMuted,
  });

  // QR frame
  const framePad = 8;
  page.drawRectangle({
    x: QR_X - framePad,
    y: QR_Y - framePad,
    width: QR_SIZE + framePad * 2,
    height: QR_SIZE + framePad * 2,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.5,
  });

  // Brand accent bar on top of QR frame
  page.drawRectangle({
    x: QR_X - framePad,
    y: QR_Y + QR_SIZE + framePad - 3,
    width: QR_SIZE + framePad * 2,
    height: 3,
    color: C.primary,
  });

  // QR image
  const qrImage = await pdfDoc.embedPng(dataUrlToBytes(ticket.qrDataUrl));
  page.drawImage(qrImage, {
    x: QR_X, y: QR_Y,
    width: QR_SIZE, height: QR_SIZE,
  });

  // ---- Footer ----
  // Divider line above footer
  page.drawLine({
    start: { x: CONTENT_LEFT, y: FOOTER_Y + 34 },
    end: { x: CONTENT_RIGHT, y: FOOTER_Y + 34 },
    thickness: 0.5,
    color: C.textMuted,
    opacity: 0.5,
  });

  // Left: Ticket No
  page.drawText("Ticket No:", {
    x: CONTENT_LEFT, y: FOOTER_Y + 20,
    size: 9, font: bold, color: C.textMuted,
  });
  page.drawText(safeText(ticket.ticketNumber), {
    x: CONTENT_LEFT, y: FOOTER_Y + 4,
    size: 12, font: bold, color: C.textMain,
  });

  // Right: Name
  const nameLabel = "Name:";
  const nameLabelW = bold.widthOfTextAtSize(nameLabel, 9);
  const nameText = truncateToWidth(
    safeText(order.customerName),
    bold,
    12,
    160
  );
  const nameTextW = bold.widthOfTextAtSize(nameText, 12);
  const nameLeftEdge =
    CONTENT_RIGHT - Math.max(nameLabelW, nameTextW);

  page.drawText(nameLabel, {
    x: nameLeftEdge, y: FOOTER_Y + 20,
    size: 9, font: bold, color: C.textMuted,
  });
  page.drawText(nameText, {
    x: nameLeftEdge, y: FOOTER_Y + 4,
    size: 12, font: bold, color: C.textMain,
  });

  void regular;
}

// ======================================================
// Icons — drawn with primitives (no external assets)
// ======================================================

/**
 * Map pin icon — a filled circle with a small vertical line tail.
 * Center is at (cx, cy). Height is about `size`.
 */
function drawPinIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const r = size * 0.42;

  // Head circle
  page.drawCircle({
    x: cx,
    y: cy + size * 0.2,
    size: r,
    color,
  });

  // Inner hole (white)
  page.drawCircle({
    x: cx,
    y: cy + size * 0.2,
    size: r * 0.4,
    color: rgb(1, 1, 1),
  });

  // Tail — short thick line pointing down
  page.drawLine({
    start: { x: cx, y: cy + size * 0.2 - r },
    end: { x: cx, y: cy - size * 0.35 },
    thickness: size * 0.18,
    color,
    lineCap: LineCapStyle.Round,
  });
}

/**
 * Calendar icon — outlined rectangle with two hangers on top
 * and a horizontal divider line.
 */
function drawCalendarIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const w = size * 0.9;
  const h = size * 0.8;
  const x = cx - w / 2;
  const y = cy - h / 2 + size * 0.1;

  // Outline rectangle
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: color,
    borderWidth: 1.2,
  });

  // Two vertical hangers on top
  page.drawLine({
    start: { x: cx - w * 0.25, y: y + h },
    end: { x: cx - w * 0.25, y: y + h + size * 0.22 },
    thickness: 1.5,
    color,
  });
  page.drawLine({
    start: { x: cx + w * 0.25, y: y + h },
    end: { x: cx + w * 0.25, y: y + h + size * 0.22 },
    thickness: 1.5,
    color,
  });

  // Horizontal divider near the top
  page.drawLine({
    start: { x, y: y + h * 0.6 },
    end: { x: x + w, y: y + h * 0.6 },
    thickness: 1,
    color,
  });
}

/**
 * Chair icon — a rectangle with a small "backrest" bar on top.
 */
function drawSeatIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const w = size * 0.75;
  const h = size * 0.55;
  const x = cx - w / 2;
  const y = cy - h / 2;

  // Seat
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: color,
    borderWidth: 1.2,
  });

  // Backrest line above the seat
  page.drawLine({
    start: { x: cx - w * 0.35, y: y + h + size * 0.1 },
    end: { x: cx + w * 0.35, y: y + h + size * 0.1 },
    thickness: 2,
    color,
  });

  // Two vertical supports
  page.drawLine({
    start: { x: cx - w * 0.35, y: y + h + size * 0.1 },
    end: { x: cx - w * 0.35, y: y + h },
    thickness: 1.2,
    color,
  });
  page.drawLine({
    start: { x: cx + w * 0.35, y: y + h + size * 0.1 },
    end: { x: cx + w * 0.35, y: y + h },
    thickness: 1.2,
    color,
  });
}

// ======================================================
// Helpers
// ======================================================

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

function wrapToMaxLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number
): string[] {
  if (!text) return [""];
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        const rest = [word, ...words.slice(i + 1)].join(" ");
        lines[maxLines - 1] = truncateToWidth(rest, font, size, maxWidth);
        return lines;
      }
    } else {
      lines.push(truncateToWidth(word, font, size, maxWidth));
      current = "";
      if (lines.length >= maxLines) return lines;
    }
  }

  if (current) {
    if (lines.length >= maxLines) {
      lines[maxLines - 1] = truncateToWidth(
        `${lines[maxLines - 1]} ${current}`,
        font,
        size,
        maxWidth
      );
    } else {
      lines.push(current);
    }
  }

  return lines.slice(0, maxLines);
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