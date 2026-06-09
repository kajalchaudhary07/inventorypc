import type { AppSettings, SalesOrder } from "@/types";

const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// IMPORTANT: these drafts are customer-facing. They must contain ONLY information
// the customer is entitled to see — order number, their own items, amounts, dates.
// They must NEVER include internal data (cost, profit, margin, vendor, stock).

function itemLines(order: SalesOrder): string {
  return order.lines.map((l) => `• ${l.name} ×${l.qty} — ${money(l.price * l.qty - l.discount)}`).join("\n");
}

// ---- #4 Payment reminder -------------------------------------------------
// `due` is the outstanding amount to collect (full total if unpaid, or a
// partial balance the admin can pass in).
export function paymentReminderDraft(order: SalesOrder, s: AppSettings, due?: number): string {
  const amountDue = due ?? (order.paymentStatus === "Paid" ? 0 : order.total);
  return [
    `Hello ${order.salonName},`,
    "",
    `This is a gentle reminder from ${s.companyName} regarding your order *${order.orderNo}* dated ${fmtDay(order.createdAt)}.`,
    "",
    `Order summary:`,
    itemLines(order),
    "",
    `Invoice total: ${money(order.total)}`,
    `Payment status: ${order.paymentStatus}`,
    `*Amount due: ${money(amountDue)}*`,
    "",
    `Kindly arrange the payment at your earliest convenience. If you've already paid, please ignore this message.`,
    "",
    `Thank you,`,
    `${s.companyName}`,
    `${s.companyPhone}`,
  ].join("\n");
}

// ---- #5 Order / delivery update -----------------------------------------
export function orderUpdateDraft(order: SalesOrder, s: AppSettings): string {
  const statusLine: Record<string, string> = {
    Pending: "has been received and is being prepared",
    Packed: "has been packed and is ready for dispatch",
    Delivered: "has been delivered",
    Cancelled: "has been cancelled",
    Returned: "has been marked as returned",
  };
  const eta = order.expectedDelivery
    ? `\nExpected delivery: *${fmtDay(order.expectedDelivery)}*`
    : "";
  return [
    `Hello ${order.salonName},`,
    "",
    `Update on your order *${order.orderNo}* from ${s.companyName}:`,
    `Your order ${statusLine[order.status] ?? "has been updated"}.${eta}`,
    "",
    `Order summary:`,
    itemLines(order),
    "",
    `Order total: ${money(order.total)}`,
    "",
    `Thank you for ordering with us!`,
    `${s.companyName} · ${s.companyPhone}`,
  ].join("\n");
}

// Open WhatsApp with a prefilled draft to the salon's number (text only — the
// same constraint as invoice sharing).
export function shareTextWhatsapp(text: string, phone?: string) {
  let num = (phone || "").replace(/\D/g, "");
  if (num && num.length === 10) num = "91" + num;
  const base = num ? `https://wa.me/${num}` : `https://wa.me/`;
  window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank");
}
