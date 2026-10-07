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

export type InvoiceLineItem = {
  description: string;   // e.g. "Lounge — Adult"
  quantity: number;
  unitPrice: number;     // in cents, VAT-inclusive
};

export type InvoiceData = {
  invoiceNumber: string;   // we'll use orderNumber
  invoiceDate: Date;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  eventTitle: string;
  eventTime: string;
  eventLocation: string;
  lineItems: InvoiceLineItem[];
  total: number;           // in cents, VAT-inclusive

  // ⭐ Settings-driven values (from app_settings)
  vatRatePercent: number;  // e.g. 13.5
  brandName: string;       // e.g. "Taprobane Entertainment"
};

// Page: A4 portrait
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const M = 50;
const CONTENT_W = PAGE_WIDTH - M * 2;

// Brand colors — mirrors src/app/styles/globals.css
const C = {
  primary: rgb(0.102, 0.451, 0.910),    // #1a73e8
  secondary: rgb(0.094, 0.353, 0.737),  // #185abc
  accent: rgb(0.831, 0.686, 0.216),     // #d4af37
  surface: rgb(1, 1, 1),
  surfaceAlt: rgb(0.953, 0.965, 0.980), // #f3f6fa
  textMain: rgb(0.133, 0.133, 0.133),   // #222222
  textMuted: rgb(0.333, 0.333, 0.333),  // #555555
  textLight: rgb(1, 1, 1),
  border: rgb(0.878, 0.878, 0.878),     // #e0e0e0
};

// ======================================================
// Public API
// ======================================================

export async function generateInvoicePdf(
  data: InvoiceData
): Promise<Uint8Array> {
  if (!data.lineItems.length) {
    throw new Error("generateInvoicePdf: at least one line item is required");
  }
  if (
    typeof data.vatRatePercent !== "number" ||
    !Number.isFinite(data.vatRatePercent) ||
    data.vatRatePercent < 0 ||
    data.vatRatePercent > 100
  ) {
    throw new Error(
      `generateInvoicePdf: vatRatePercent must be between 0 and 100, got ${data.vatRatePercent}`
    );
  }
  if (!data.brandName || typeof data.brandName !== "string") {
    throw new Error("generateInvoicePdf: brandName is required");
  }

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const logo = await loadLogo(pdfDoc);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawInvoice(page, data, bold, regular, logo);

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
        return null;
      }
    }
  } catch {
    return null;
  }
}

// ======================================================
// Layout
// ======================================================

function drawInvoice(
  page: PDFPage,
  data: InvoiceData,
  bold: PDFFont,
  regular: PDFFont,
  logo: PDFImage | null
): void {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;
  const left = M;
  const right = W - M;

  // ---- Background ----
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.surface });

  // ---- Top accent bar ----
  page.drawRectangle({
    x: 0, y: H - 6, width: W / 2, height: 6, color: C.primary,
  });
  page.drawRectangle({
    x: W / 2, y: H - 6, width: W / 2, height: 6, color: C.accent,
  });

  // ---- Header: logo + brand (left) ----
  let brandX = left;
  if (logo) {
    const maxSize = 44;
    const scale = Math.min(maxSize / logo.width, maxSize / logo.height);
    const logoW = logo.width * scale;
    const logoH = logo.height * scale;
    const logoY = H - 40 - logoH;
    page.drawImage(logo, { x: left, y: logoY, width: logoW, height: logoH });
    brandX = left + logoW + 12;
  }

  page.drawText(safeText(data.brandName), {
    x: brandX,
    y: H - 62,
    size: 14,
    font: bold,
    color: C.textMain,
  });

  page.drawText("www.taprobane.fi", {
    x: brandX,
    y: H - 78,
    size: 9,
    font: regular,
    color: C.textMuted,
  });

  // ---- Header: INVOICE label (right) ----
  const invoiceLabel = "INVOICE";
  const invoiceLabelW = bold.widthOfTextAtSize(invoiceLabel, 26);
  page.drawText(invoiceLabel, {
    x: right - invoiceLabelW,
    y: H - 66,
    size: 26,
    font: bold,
    color: C.primary,
  });

  page.drawText(
    `#${safeText(data.invoiceNumber)}`,
    {
      x: right - regular.widthOfTextAtSize(`#${data.invoiceNumber}`, 10),
      y: H - 84,
      size: 10,
      font: regular,
      color: C.textMuted,
    }
  );

  // ---- Divider ----
  const dividerY = H - 108;
  page.drawLine({
    start: { x: left, y: dividerY },
    end: { x: right, y: dividerY },
    thickness: 0.7,
    color: C.border,
  });

  // ==================================================
  // Bill To / Invoice details (two columns)
  // ==================================================
  const infoY = dividerY - 26;

  // Left column: BILL TO
  drawSmallLabel(page, "BILL TO", left, infoY, bold);
  page.drawText(safeText(data.customerName), {
    x: left, y: infoY - 18, size: 12, font: bold, color: C.textMain,
  });
  page.drawText(safeText(data.customerEmail), {
    x: left, y: infoY - 34, size: 10, font: regular, color: C.textMuted,
  });
  if (data.customerPhone) {
    page.drawText(safeText(data.customerPhone), {
      x: left, y: infoY - 48, size: 10, font: regular, color: C.textMuted,
    });
  }

  // Right column: invoice meta
  const metaRightX = right;
  drawRightAlignedLabel(page, "INVOICE DATE", metaRightX, infoY, bold, regular);
  drawRightAlignedValue(
    page,
    formatDate(data.invoiceDate),
    metaRightX,
    infoY - 18,
    bold
  );
  drawRightAlignedLabel(page, "ORDER NUMBER", metaRightX, infoY - 44, bold, regular);
  drawRightAlignedValue(
    page,
    safeText(data.orderNumber),
    metaRightX,
    infoY - 62,
    bold
  );

  // ==================================================
  // Event box
  // ==================================================
  const eventBoxY = infoY - 96;
  const eventBoxH = 62;

  page.drawRectangle({
    x: left,
    y: eventBoxY - eventBoxH + 20,
    width: CONTENT_W,
    height: eventBoxH,
    color: C.surfaceAlt,
    borderColor: C.border,
    borderWidth: 0.5,
  });
  // Blue accent bar on the left of the event box
  page.drawRectangle({
    x: left,
    y: eventBoxY - eventBoxH + 20,
    width: 3,
    height: eventBoxH,
    color: C.primary,
  });

  drawSmallLabel(page, "EVENT", left + 16, eventBoxY, bold);
  page.drawText(safeText(data.eventTitle), {
    x: left + 16,
    y: eventBoxY - 18,
    size: 13,
    font: bold,
    color: C.textMain,
  });
  page.drawText(
    safeText(`${data.eventTime}  @  ${data.eventLocation}`),
    {
      x: left + 16,
      y: eventBoxY - 34,
      size: 10,
      font: regular,
      color: C.textMuted,
    }
  );

  // ==================================================
  // Line items table
  // ==================================================
  const tableTop = eventBoxY - eventBoxH - 14;

  // Column positions
  const colDesc = left;
  const colQty = left + 300;
  const colUnit = left + 380;
  const colAmt = right;

  // Header row background
  page.drawRectangle({
    x: left,
    y: tableTop - 20,
    width: CONTENT_W,
    height: 22,
    color: C.secondary,
  });

  page.drawText("DESCRIPTION", {
    x: colDesc + 10, y: tableTop - 14, size: 9, font: bold, color: C.textLight,
  });
  drawRightText(page, "QTY", colQty, tableTop - 14, 9, bold, C.textLight);
  drawRightText(page, "UNIT PRICE", colUnit, tableTop - 14, 9, bold, C.textLight);
  drawRightText(page, "AMOUNT", colAmt - 10, tableTop - 14, 9, bold, C.textLight);

  // Rows
  let rowY = tableTop - 44;
  const rowH = 26;

  for (let i = 0; i < data.lineItems.length; i++) {
    const item = data.lineItems[i];
    const lineTotal = item.unitPrice * item.quantity;

    // Row separator
    if (i > 0) {
      page.drawLine({
        start: { x: left, y: rowY + 10 },
        end: { x: right, y: rowY + 10 },
        thickness: 0.3,
        color: C.border,
      });
    }

    page.drawText(safeText(item.description), {
      x: colDesc + 10, y: rowY, size: 11, font: regular, color: C.textMain,
    });

    drawRightText(page, String(item.quantity), colQty, rowY, 11, regular, C.textMain);
    drawRightText(page, formatEuro(item.unitPrice), colUnit, rowY, 11, regular, C.textMain);
    drawRightText(page, formatEuro(lineTotal), colAmt - 10, rowY, 11, bold, C.textMain);

    rowY -= rowH;
  }

  // Bottom border of table
  page.drawLine({
    start: { x: left, y: rowY + 12 },
    end: { x: right, y: rowY + 12 },
    thickness: 0.7,
    color: C.border,
  });

  // ==================================================
  // Totals (right-aligned block)
  // ==================================================
  const grossTotal = data.total;
  const vatDecimal = data.vatRatePercent / 100;
  const vatAmount = Math.round(grossTotal * vatDecimal);
  const netTotal = grossTotal - vatAmount;

  let totalY = rowY - 12;
  const labelX = right - 200;

  // Subtotal (excl. VAT)
  page.drawText("Subtotal (excl. VAT)", {
    x: labelX, y: totalY, size: 10, font: regular, color: C.textMuted,
  });
  drawRightText(page, formatEuro(netTotal), right, totalY, 10, regular, C.textMain);

  totalY -= 18;

  // VAT line — dynamic percentage, e.g. "VAT (13.5%)" or "VAT (24%)"
  page.drawText(`VAT (${formatVatPercent(data.vatRatePercent)})`, {
    x: labelX, y: totalY, size: 10, font: regular, color: C.textMuted,
  });
  drawRightText(page, formatEuro(vatAmount), right, totalY, 10, regular, C.textMain);

  totalY -= 8;

  // Separator above total
  page.drawLine({
    start: { x: labelX, y: totalY },
    end: { x: right, y: totalY },
    thickness: 0.5,
    color: C.border,
  });

  totalY -= 20;

  // Total (incl. VAT) — highlighted
  page.drawRectangle({
    x: labelX - 10,
    y: totalY - 6,
    width: 210,
    height: 26,
    color: C.surfaceAlt,
  });

  page.drawText("TOTAL (incl. VAT)", {
    x: labelX, y: totalY, size: 11, font: bold, color: C.textMain,
  });
  drawRightText(page, formatEuro(grossTotal), right, totalY, 13, bold, C.secondary);

  // ==================================================
  // Footer
  // ==================================================
  const footerY = M + 40;

  page.drawLine({
    start: { x: left, y: footerY + 30 },
    end: { x: right, y: footerY + 30 },
    thickness: 0.5,
    color: C.border,
  });

  page.drawText("Thank you for your business.", {
    x: left, y: footerY + 12, size: 10, font: bold, color: C.textMain,
  });
  page.drawText(
    "For questions about this invoice, contact orders@restaurantapp.eu.org",
    {
      x: left, y: footerY - 4, size: 9, font: regular, color: C.textMuted,
    }
  );
  page.drawText(
    "This is a computer-generated invoice. No signature required.",
    {
      x: left, y: footerY - 18, size: 8, font: regular, color: C.textMuted,
    }
  );

  // Bottom accent bar (mirrored)
  page.drawRectangle({
    x: 0, y: 0, width: W / 2, height: 4, color: C.accent,
  });
  page.drawRectangle({
    x: W / 2, y: 0, width: W / 2, height: 4, color: C.primary,
  });
}

// ======================================================
// Small helpers
// ======================================================

function drawSmallLabel(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  bold: PDFFont
) {
  page.drawText(text, {
    x, y, size: 8, font: bold, color: C.textMuted,
  });
}

function drawRightAlignedLabel(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  bold: PDFFont,
  _regular: PDFFont
) {
  const w = bold.widthOfTextAtSize(text, 8);
  page.drawText(text, {
    x: rightX - w, y, size: 8, font: bold, color: C.textMuted,
  });
}

function drawRightAlignedValue(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  bold: PDFFont
) {
  const w = bold.widthOfTextAtSize(text, 11);
  page.drawText(text, {
    x: rightX - w, y, size: 11, font: bold, color: C.textMain,
  });
}

function drawRightText(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formats a VAT percentage for display. Drops trailing zeros:
 *   13.50 → "13.5"
 *   24.00 → "24"
 *   8.25  → "8.25"
 */
function formatVatPercent(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  return String(rounded);
}

function safeText(input: string): string {
  return input
    .replace(/[—–]/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}