import crypto from "node:crypto";

// ======================================================
// QR payload signing (compact format)
// ----------------
// QR encodes:  <ticketNumber>.<signature>
// Example:     taprosa20260010001.gK5vP2xQ8bN4mR7yT1wZ3A
//
// Signature = HMAC-SHA256(ticketNumber, secret) truncated to
// 16 bytes and encoded as base64url (22 chars).
//
// 128 bits of security is more than enough for ticket forgery
// prevention. Combined with the ticket number, the total QR
// payload is only ~41 chars → ~25x25 module QR → fast scan.
// ======================================================

const SIG_BYTES = 16;

function getSecret(): string {
  const s = process.env.QR_SIGNING_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "QR_SIGNING_SECRET is missing or too short. Generate a 64-char hex string and add it to .env"
    );
  }
  return s;
}

/**
 * Computes a compact 22-char signature for a ticket number.
 */
function computeCompactSig(ticketNumber: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(ticketNumber)
    .digest("base64url")
    .slice(0, 22);
}

/**
 * Computes a full 64-char hex signature (legacy format).
 */
function computeLegacyHexSig(ticketNumber: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(ticketNumber)
    .digest("hex");
}

/**
 * Signs a ticket number and returns the compact string for the QR.
 *
 * Format:  <ticketNumber>.<sig>
 * Example: taprosa20260010001.gK5vP2xQ8bN4mR7yT1wZ3A
 */
export function signTicketQr(ticketNumber: string): string {
  if (!ticketNumber || typeof ticketNumber !== "string") {
    throw new Error("signTicketQr: ticketNumber must be a non-empty string");
  }

  const sig = computeCompactSig(ticketNumber);
  return `${ticketNumber}.${sig}`;
}

export type VerifyResult =
  | { ok: true; ticketNumber: string; signed: true }
  | {
      ok: true;
      ticketNumber: string;
      signed: false;
      format: "raw" | "legacy_json";
    }
  | { ok: false; reason: string };

/**
 * Parses + verifies a QR payload. Supports four input formats:
 *
 *   1. Compact signed   "taprosa20260010001.gK5vP2xQ8bN4mR7yT1wZ3A"   → verified
 *   2. Legacy signed    {"ticketNumber":"...","sig":"<64 hex>"}       → verified
 *   3. Legacy JSON      {"orderId":...,"ticketNumber":"..."}          → unsigned
 *   4. Raw string       "taprosa20260010001"                          → unsigned
 *
 * Formats 3 and 4 are accepted for backward compatibility with tickets
 * issued before signing was enabled. The scanner UI should surface a
 * warning for unsigned tickets.
 */
export function verifyTicketQr(qrCodeData: string): VerifyResult {
  if (!qrCodeData || typeof qrCodeData !== "string") {
    return { ok: false, reason: "Empty QR payload" };
  }

  const trimmed = qrCodeData.trim();
  if (!trimmed) {
    return { ok: false, reason: "Empty QR payload" };
  }

  // --------------------------------------------------
  // Non-JSON payloads
  // --------------------------------------------------
  if (!trimmed.startsWith("{")) {
    // ---- Format 1: compact signed "<ticketNumber>.<sig>" ----
    const dotIdx = trimmed.indexOf(".");
    if (dotIdx > 0 && dotIdx < trimmed.length - 1) {
      const ticketNumber = trimmed.slice(0, dotIdx);
      const providedSig = trimmed.slice(dotIdx + 1);

      // Validate ticket number shape before doing crypto work
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(ticketNumber)) {
        return { ok: false, reason: "Malformed signed QR" };
      }

      const expected = computeCompactSig(ticketNumber);

      // Length check first (fast fail on obvious tampering), then
      // constant-time compare to prevent timing attacks.
      if (providedSig.length !== expected.length) {
        return { ok: false, reason: "Signature verification failed" };
      }
      if (
        !crypto.timingSafeEqual(
          Buffer.from(providedSig, "utf8"),
          Buffer.from(expected, "utf8")
        )
      ) {
        return { ok: false, reason: "Signature verification failed" };
      }

      return { ok: true, ticketNumber, signed: true };
    }

    // ---- Format 4: raw ticket number (unsigned) ----
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(trimmed)) {
      return { ok: false, reason: "Unrecognized QR format" };
    }
    return { ok: true, ticketNumber: trimmed, signed: false, format: "raw" };
  }

  // --------------------------------------------------
  // JSON payloads (legacy)
  // --------------------------------------------------
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: "QR is not valid JSON" };
  }

  if (!payload || typeof payload.ticketNumber !== "string") {
    return { ok: false, reason: "Missing ticket number in QR" };
  }

  const ticketNumber = payload.ticketNumber;

  // ---- Format 2: legacy signed JSON (full 64-char hex HMAC) ----
  if (typeof payload.sig === "string" && payload.sig.length > 0) {
    const expected = computeLegacyHexSig(ticketNumber);

    const providedBuf = Buffer.from(payload.sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");

    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return { ok: false, reason: "Signature verification failed" };
    }

    return { ok: true, ticketNumber, signed: true };
  }

  // ---- Format 3: legacy JSON (unsigned) ----
  return {
    ok: true,
    ticketNumber,
    signed: false,
    format: "legacy_json",
  };
}