import QRCode from "qrcode";

export type GeneratedQrCode = {
  /** The raw string encoded into the QR (what the scanner reads back) */
  payload: string;
  /** PNG as a data URL: "data:image/png;base64,..." — safe for PDFs and <img src> */
  dataUrl: string;
};

/**
 * Generates a QR code from a string payload.
 *
 * Uses error correction level "Q" (~25% damage tolerance) — enough for
 * tickets (folded, photographed, displayed on screens) while keeping the
 * QR matrix small enough for fast scanning.
 */
export async function generateQrCode(
  payload: string
): Promise<GeneratedQrCode> {
  if (!payload || typeof payload !== "string") {
    throw new Error("generateQrCode: payload must be a non-empty string");
  }

  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "Q",
      margin: 5,
      width: 500,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    return { payload, dataUrl };
  } catch (err) {
    throw new Error(
      `generateQrCode: failed to generate QR for payload "${payload}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}