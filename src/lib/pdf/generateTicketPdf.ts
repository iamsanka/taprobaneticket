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
  seatLabel?: string;
  unitPrice?: number;
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
// Card layout — 2 rows, wide + short (matches mockup)
// ======================================================
const CARD_X = 14;
const CARD_W = PAGE_WIDTH - CARD_X * 2;   // 392
const CARD_H = 96;
const CARD_Y = 238;                        // bottom of the card
const CARD_TOP = CARD_Y + CARD_H;          // 334

// Row centers
const ROW1_Y = CARD_TOP - 30;  // 304 — Location | Type
const ROW2_Y = CARD_Y + 26;    // 264 — Date | Time | Price

// Column boundaries (x-anchor points inside the card)
const COL_ICON_X = CARD_X + 18;      // icon center of first column
const COL_TEXT_X = CARD_X + 34;      // first-column text start
const COL_DIV_1 = CARD_X + 210;      // vertical divider after location/date

// Row 1 (Location | Type)
const ROW1_TYPE_RIGHT = CARD_X + CARD_W - 16;

// Row 2 (Date | Time | Price)
const ROW2_DIV_1 = CARD_X + 130;
const ROW2_ICON2_X = CARD_X + 152;
const ROW2_TEXT2_X = CARD_X + 168;
const ROW2_DIV_2 = CARD_X + 250;
const ROW2_ICON3_X = CARD_X + 272;
const ROW2_TEXT3_X = CARD_X + 288;
const ROW2_PRICE_RIGHT = CARD_X + CARD_W - 16;

// QR code
const QR_SIZE = 110;
const QR_X = (PAGE_WIDTH - QR_SIZE) / 2;
const QR_Y = 62;

// Footer
const FOOTER_Y = 22;

// ======================================================
// Brand palette
// ======================================================
const C = {
  primary: rgb(0.165, 0.545, 0.769),    // #2a8bc4
  secondary: rgb(0.878, 0.478, 0.337),  // #e07a56 (coral)
  accent: rgb(0.831, 0.686, 0.216),     // #d4af37
  surface: rgb(1, 1, 1),
  surfaceAlt: rgb(0.953, 0.965, 0.980),
  cardBg: rgb(0.972, 0.957, 0.902),     // warm cream #f8f4e6
  textMain: rgb(0.063, 0.078, 0.094),   // #101418
  textMuted: rgb(0.42, 0.42, 0.42),
  textLight: rgb(1, 1, 1),
  divider: rgb(0.72, 0.7, 0.66),
  border: rgb(0.878, 0.878, 0.878),
};

// ======================================================
// Font sizes (pt)
// ======================================================
const FS_ROW_TEXT = 11;
const FS_PRICE = 18;
const FS_FOOTER_LABEL = 8;
const FS_FOOTER_VALUE = 11;

// ======================================================
// Fonts
// ======================================================

type FontSet = { regular: PDFFont; bold: PDFFont };

async function loadCustomFont(
  pdfDoc: PDFDocument,
  filename: string,
  fallback: StandardFonts
): Promise<PDFFont> {
  try {
    const fontPath = path.join(process.cwd(), "public", "fonts", filename);
    const bytes = await readFile(fontPath);
    return await pdfDoc.embedFont(bytes, { subset: true });
  } catch {
    console.warn(
      `generateTicketPdf: "${filename}" not found — using ${fallback}`
    );
    return await pdfDoc.embedFont(fallback);
  }
}

async function loadFonts(pdfDoc: PDFDocument): Promise<FontSet> {
  const [regular, bold] = await Promise.all([
    loadCustomFont(pdfDoc, "RobotoCondensed-Regular.ttf", StandardFonts.Helvetica),
    loadCustomFont(pdfDoc, "RobotoCondensed-Bold.ttf", StandardFonts.HelveticaBold),
  ]);
  return { regular, bold };
}

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
  const fonts = await loadFonts(pdfDoc);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const wantPhoto = !!(order.ticketImageUrl && order.ticketImageTextColor);
  let ticketImage: PDFImage | null = null;
  if (wantPhoto) {
    ticketImage = await loadTicketBackground(pdfDoc, order.ticketImageUrl!);
  }

  if (ticketImage) {
    await drawPhotoMode(pdfDoc, page, order, ticket, fonts, ticketImage);
  } else {
    await drawClassicMode(pdfDoc, page, order, ticket, fonts);
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
      console.warn(`generateTicketPdf: image HTTP ${res.status} for ${url}`);
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
    console.warn("generateTicketPdf: image fetch failed:", err);
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
  fonts: FontSet,
  bg: PDFImage
): Promise<void> {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;

  // Cover-fit the background image
  const scale = Math.max(W / bg.width, H / bg.height);
  const drawW = bg.width * scale;
  const drawH = bg.height * scale;
  const x = (W - drawW) / 2;
  const y = (H - drawH) / 2;
  page.drawImage(bg, { x, y, width: drawW, height: drawH });

  drawInfoCard(page, order, ticket, fonts);
  await drawQr(pdfDoc, page, ticket);
  drawFooter(page, order, ticket, fonts);
}

// ======================================================
// Classic mode
// ======================================================

async function drawClassicMode(
  pdfDoc: PDFDocument,
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  fonts: FontSet
): Promise<void> {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.surfaceAlt });

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

  drawClassicHeader(page, order, ticket, fonts);
  drawInfoCard(page, order, ticket, fonts);
  await drawQr(pdfDoc, page, ticket);
  drawFooter(page, order, ticket, fonts);
}

async function drawClassicHeader(
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  fonts: FontSet
): Promise<void> {
  const cLeft = 26;
  const cRight = PAGE_WIDTH - 26;

  page.drawText(safeText(order.brandName), {
    x: cLeft, y: PAGE_HEIGHT - 40,
    size: 11, font: fonts.bold, color: C.primary,
  });

  const titleLines = wrapToMaxLines(
    safeText(order.eventTitle),
    fonts.bold,
    20,
    cRight - cLeft,
    2
  );

  const titleStartY = PAGE_HEIGHT - 78;
  titleLines.forEach((line, i) => {
    page.drawText(line, {
      x: cLeft, y: titleStartY - i * 24,
      size: 20, font: fonts.bold, color: C.textMain,
    });
  });
}

// ======================================================
// Info card — 2 rows with icons + dividers
// ======================================================

function drawInfoCard(
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  fonts: FontSet
): void {
  // ---- Card background (soft shadow + cream fill) ----
  page.drawRectangle({
    x: CARD_X + 1,
    y: CARD_Y - 3,
    width: CARD_W,
    height: CARD_H,
    color: rgb(0, 0, 0),
    opacity: 0.15,
  });
  page.drawRectangle({
    x: CARD_X,
    y: CARD_Y,
    width: CARD_W,
    height: CARD_H,
    color: C.cardBg,
    opacity: 0.97,
  });

  const { date, time } = splitEventDateTime(order);
  const venue = safeText(order.eventLocation || "—");
  const typeText = safeText(ticket.typeName || "—");

  // ==================================================
  // ROW 1: 📍 Location | Type
  // ==================================================
  drawPinIcon(page, COL_ICON_X, ROW1_Y, 9, C.textMain);

  // Location
  const locationMaxW = ROW1_TYPE_RIGHT - COL_TEXT_X - 60;
  const locationText = truncateToWidth(
    venue,
    fonts.regular,
    FS_ROW_TEXT,
    locationMaxW
  );
  page.drawText(locationText, {
    x: COL_TEXT_X,
    y: ROW1_Y - FS_ROW_TEXT * 0.35,
    size: FS_ROW_TEXT,
    font: fonts.regular,
    color: C.textMain,
  });

  // Vertical divider before Type
  drawVDivider(page, ROW1_TYPE_RIGHT - 55, ROW1_Y, 16);

  // Type (right-aligned)
  const typeW = fonts.bold.widthOfTextAtSize(typeText, FS_ROW_TEXT);
  page.drawText(typeText, {
    x: ROW1_TYPE_RIGHT - typeW,
    y: ROW1_Y - FS_ROW_TEXT * 0.35,
    size: FS_ROW_TEXT,
    font: fonts.bold,
    color: C.textMain,
  });

  // ==================================================
  // ROW 2: 📅 Date | 🕐 Time | 🎫 Price
  // ==================================================
  drawCalendarIcon(page, COL_ICON_X, ROW2_Y, 9, C.textMain);

  // Date
  const dateMaxW = ROW2_DIV_1 - COL_TEXT_X - 10;
  const dateText = truncateToWidth(
    date || "—",
    fonts.regular,
    FS_ROW_TEXT,
    dateMaxW
  );
  page.drawText(dateText, {
    x: COL_TEXT_X,
    y: ROW2_Y - FS_ROW_TEXT * 0.35,
    size: FS_ROW_TEXT,
    font: fonts.regular,
    color: C.textMain,
  });

  // Divider before Time
  drawVDivider(page, ROW2_DIV_1, ROW2_Y, 16);

  // Clock icon
  drawClockIcon(page, ROW2_ICON2_X, ROW2_Y, 9, C.textMain);

  // Time
  const timeMaxW = ROW2_DIV_2 - ROW2_TEXT2_X - 10;
  const timeText = truncateToWidth(
    time || "—",
    fonts.regular,
    FS_ROW_TEXT,
    timeMaxW
  );
  page.drawText(timeText, {
    x: ROW2_TEXT2_X,
    y: ROW2_Y - FS_ROW_TEXT * 0.35,
    size: FS_ROW_TEXT,
    font: fonts.regular,
    color: C.textMain,
  });

  // Divider before Price
  drawVDivider(page, ROW2_DIV_2, ROW2_Y, 16);

  // Ticket icon
  drawTicketIcon(page, ROW2_ICON3_X, ROW2_Y, 9, C.textMain);

  // Price (right-aligned, coral, bigger)
  if (ticket.unitPrice !== undefined && ticket.unitPrice > 0) {
    const priceText = `€${(ticket.unitPrice / 100).toFixed(2)}`;
    const priceW = fonts.bold.widthOfTextAtSize(priceText, FS_PRICE);
    page.drawText(priceText, {
      x: ROW2_PRICE_RIGHT - priceW,
      y: ROW2_Y - FS_PRICE * 0.35,
      size: FS_PRICE,
      font: fonts.bold,
      color: C.secondary,
    });
  }
}

// ======================================================
// QR code
// ======================================================

async function drawQr(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ticket: PdfTicket
): Promise<void> {
  // "SCAN AT ENTRANCE" label
  const scanText = "SCAN AT ENTRANCE";
  const scanSize = 8;

  // White halo behind everything (helps on busy backgrounds)
  page.drawRectangle({
    x: QR_X - 10,
    y: QR_Y - 10,
    width: QR_SIZE + 20,
    height: QR_SIZE + 20,
    color: rgb(1, 1, 1),
    opacity: 0.92,
  });

  // QR image
  const qrImage = await pdfDoc.embedPng(dataUrlToBytes(ticket.qrDataUrl));
  page.drawImage(qrImage, {
    x: QR_X, y: QR_Y,
    width: QR_SIZE, height: QR_SIZE,
  });

  void scanText;
  void scanSize;
}

// ======================================================
// Footer — Ticket No | Name
// ======================================================

function drawFooter(
  page: PDFPage,
  order: PdfOrder,
  ticket: PdfTicket,
  fonts: FontSet
): void {
  const LEFT_X = CARD_X + 8;
  const RIGHT_X = CARD_X + CARD_W / 2 + 8;

  // Subtle separator line above footer
  page.drawLine({
    start: { x: CARD_X, y: FOOTER_Y + 32 },
    end: { x: CARD_X + CARD_W, y: FOOTER_Y + 32 },
    thickness: 0.4,
    color: C.divider,
    opacity: 0.5,
  });

  // ---- Left: Ticket No ----
  page.drawText("Ticket No:", {
    x: LEFT_X,
    y: FOOTER_Y + 16,
    size: FS_FOOTER_LABEL,
    font: fonts.bold,
    color: C.textMuted,
  });
  page.drawText(safeText(ticket.ticketNumber), {
    x: LEFT_X,
    y: FOOTER_Y,
    size: FS_FOOTER_VALUE,
    font: fonts.bold,
    color: C.textMain,
  });

  // ---- Right: Name ----
  page.drawText("Name:", {
    x: RIGHT_X,
    y: FOOTER_Y + 16,
    size: FS_FOOTER_LABEL,
    font: fonts.bold,
    color: C.textMuted,
  });
  page.drawText(
    truncateToWidth(
      safeText(order.customerName),
      fonts.bold,
      FS_FOOTER_VALUE,
      CARD_W / 2 - 16
    ),
    {
      x: RIGHT_X,
      y: FOOTER_Y,
      size: FS_FOOTER_VALUE,
      font: fonts.bold,
      color: C.textMain,
    }
  );
}

// ======================================================
// Icons — small, clean, drawn as primitives
// ======================================================

/** Pin icon — filled circle with a small tail. */
function drawPinIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const r = size * 0.42;
  // Head
  page.drawCircle({
    x: cx,
    y: cy + size * 0.15,
    size: r,
    color,
  });
  // Tail
  page.drawLine({
    start: { x: cx, y: cy + size * 0.15 - r + 1 },
    end: { x: cx, y: cy - size * 0.5 },
    thickness: size * 0.28,
    color,
  });
}

/** Calendar icon — outlined rectangle with two top hangers and a header line. */
function drawCalendarIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const w = size * 1.0;
  const h = size * 0.85;
  const x = cx - w / 2;
  const y = cy - h / 2;

  // Outline
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: color,
    borderWidth: 1.2,
  });

  // Header line
  page.drawLine({
    start: { x, y: y + h * 0.62 },
    end: { x: x + w, y: y + h * 0.62 },
    thickness: 1,
    color,
  });

  // Top hangers
  page.drawLine({
    start: { x: cx - w * 0.28, y: y + h },
    end: { x: cx - w * 0.28, y: y + h + size * 0.2 },
    thickness: 1.4,
    color,
  });
  page.drawLine({
    start: { x: cx + w * 0.28, y: y + h },
    end: { x: cx + w * 0.28, y: y + h + size * 0.2 },
    thickness: 1.4,
    color,
  });
}

/** Clock icon — outlined circle with hour + minute hands. */
function drawClockIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const r = size * 0.5;

  page.drawCircle({
    x: cx, y: cy, size: r,
    borderColor: color,
    borderWidth: 1.2,
  });

  // Hour hand (pointing up)
  page.drawLine({
    start: { x: cx, y: cy },
    end: { x: cx, y: cy + r * 0.55 },
    thickness: 1,
    color,
  });

  // Minute hand (pointing right)
  page.drawLine({
    start: { x: cx, y: cy },
    end: { x: cx + r * 0.55, y: cy },
    thickness: 1,
    color,
  });
}

/** Ticket icon — a rounded rectangle with two side notches. */
function drawTicketIcon(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const w = size * 1.15;
  const h = size * 0.72;
  const x = cx - w / 2;
  const y = cy - h / 2;

  page.drawRectangle({
    x, y, width: w, height: h,
    color,
  });

  // Two small cut-outs (notches) on left and right — drawn as page-bg circles
  page.drawCircle({
    x: cx - w / 2,
    y: cy,
    size: h * 0.28,
    color: C.cardBg,
  });
  page.drawCircle({
    x: cx + w / 2,
    y: cy,
    size: h * 0.28,
    color: C.cardBg,
  });
}

/** A thin vertical divider between columns. */
function drawVDivider(
  page: PDFPage,
  x: number,
  cy: number,
  height: number
): void {
  page.drawLine({
    start: { x, y: cy - height / 2 },
    end: { x, y: cy + height / 2 },
    thickness: 0.6,
    color: C.divider,
    opacity: 0.8,
  });
}

// ======================================================
// Date/time splitter
// ======================================================

function splitEventDateTime(order: PdfOrder): { date: string; time: string } {
  if (order.eventDate || order.eventStartTime) {
    return {
      date: order.eventDate ?? "",
      time: order.eventStartTime ?? "",
    };
  }

  const raw = (order.eventTime || "").trim();

  // Try to extract a time at the end:
  // "May 14, 2027 19:30"  → date="May 14, 2027", time="19:30"
  // "15 May 2027, 19:00"  → date="15 May 2027", time="19:00"
  const match = raw.match(
    /^(.*?)[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap]\.?[Mm]\.?)?)\s*$/
  );
  if (match) {
    return {
      date: match[1].trim().replace(/[,\s]+$/, ""),
      time: match[2].trim(),
    };
  }

  return { date: raw, time: "" };
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