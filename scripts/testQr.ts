import { generateQrCode } from "../src/lib/qr/generateQrCode";

async function main() {
  const result = await generateQrCode(
    JSON.stringify({
      orderId: 999,
      ticketTypeId: 7,
      ticketNumber: "taprosa20260010001",
    })
  );

  console.log("payload:", result.payload);
  console.log("dataUrl starts with:", result.dataUrl.slice(0, 30));
  console.log("dataUrl length:", result.dataUrl.length);

    // Negative test — should throw
  try {
    await generateQrCode("");
    console.log("❌ empty payload did NOT throw");
  } catch (e) {
    console.log("✅ empty payload threw:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});