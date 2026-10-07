import { writeFileSync } from "node:fs";
import { generateQrCode } from "../src/lib/qr/generateQrCode";
import { generateTicketPdf } from "../src/lib/pdf/generateTicketPdf";

async function main() {
  const ticket1 = await generateQrCode(
    JSON.stringify({ orderId: 999, ticketTypeId: 7, ticketNumber: "taprosa20260010001" })
  );
  const ticket2 = await generateQrCode(
    JSON.stringify({ orderId: 999, ticketTypeId: 7, ticketNumber: "taprosa20260010002" })
  );

  const pdfBytes = await generateTicketPdf(
    {
      orderNumber: "taprosa2026001",
      customerName: "Sanka De Silva",
      customerEmail: "iamsankadesilva@gmail.com",
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
      {
        ticketNumber: "taprosa20260010002",
        qrDataUrl: ticket2.dataUrl,
        categoryName: "VIP",
        typeName: "Adult",
      },
    ]
  );

  writeFileSync("test-ticket.pdf", pdfBytes);
  console.log(`✅ Wrote test-ticket.pdf (${pdfBytes.length} bytes)`);

  try {
    await generateTicketPdf(
      {
        orderNumber: "x",
        customerName: "x",
        customerEmail: "x",
        eventTitle: "x",
        eventTime: "x",
        eventLocation: "x",
      },
      []
    );
    console.log("❌ empty tickets did NOT throw");
  } catch (e) {
    console.log("✅ empty tickets threw:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});