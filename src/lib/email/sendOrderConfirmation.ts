import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL!;

type SendOrderConfirmationProps = {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
};

export async function sendOrderConfirmation({
  customerName,
  customerEmail,
  orderNumber,
}: SendOrderConfirmationProps) {
  await resend.emails.send({
    from: FROM,
    to: customerEmail,
    subject: `Order Confirmation - ${orderNumber}`,

    html: `
      <div style="font-family: Arial, sans-serif;">
        <h1>Thank you for your purchase 🎉</h1>

        <p>Hi ${customerName},</p>

        <p>Your order has been successfully placed.</p>

        <p>
          <strong>Order Number:</strong>
          ${orderNumber}
        </p>

        <p>
          We are preparing your tickets.
        </p>

        <p>
          Regards,<br/>
          Taprobane Ticketing
        </p>
      </div>
    `,
  });
}