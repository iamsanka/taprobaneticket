import "dotenv/config"; // ← MUST be the very first import — loads .env as a side effect

import { generateQrCode } from "../src/lib/qr/generateQrCode";
import { generateTicketPdf } from "../src/lib/pdf/generateTicketPdf";
import { sendTicketDelivery } from "../src/lib/email/sendTicketDelivery";
import { config } from "dotenv";

config(); // load .env so RESEND_API_KEY and RESEND_FROM_EMAIL are available

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm tsx scripts/testEmailTicket.ts <your-email>");
    process.exit(1);
  }

  const ticket1 = await generateQrCode(
    JSON.stringify({
      orderId: 999,
      ticketTypeId: 7,
      ticketNumber: "taprosa20260010001",
    })
  );

  const pdfBytes = await generateTicketPdf(
    {
      orderNumber: "taprosa2026001",
      customerName: "Test Customer",
      customerEmail: email,
      eventTitle: "Taprobane Live 2026",
      eventTime: "Sat 12 Dec 2026, 7:00 PM",
      eventLocation: "Nelum Pokuna Theatre, Colombo",
    },
    [
      {
        ticketNumber: "taprosa20260010001",
        qrDataUrl: ticket1.dataUrl,
        categoryName: "VIP",
        typeName: "Adult",
      },
    ]
  );

  await sendTicketDelivery({
    customerName: "Test Customer",
    customerEmail: email,
    orderNumber: "taprosa2026001",
    eventTitle: "Taprobane Live 2026",
    eventTime: "Sat 12 Dec 2026, 7:00 PM",
    eventLocation: "Nelum Pokuna Theatre, Colombo",
    ticketCount: 1,
    pdfBytes,
  });

  console.log(`✅ Sent ticket delivery email to ${email}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});