import type { AppSettings, SalesOrder } from "@/types";
import { lineGst, lineNet } from "./calc";

// ---- Indian rupee → words (for "Total amount in words") ------------------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? "-" + ONES[n % 10] : ""}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h ? ONES[h] + " Hundred" + (r ? " And " : "") : ""}${r ? twoDigits(r) : ""}`;
}
export function rupeesInWords(amount: number): string {
  const rupees = Math.floor(amount);
  if (rupees === 0) return "Zero Rupees";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  let words = "";
  if (crore) words += threeDigits(crore) + " Crore ";
  if (lakh) words += threeDigits(lakh) + " Lakh ";
  if (thousand) words += threeDigits(thousand) + " Thousand ";
  if (rest) words += threeDigits(rest);
  return words.trim().replace(/\s+/g, " ") + " Rupees";
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) =>
  "₹ " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- Standalone invoice HTML (matches the PureCuts layout) ---------------
export function buildInvoiceHtml(order: SalesOrder, s: AppSettings): string {
  const inv = `${s.invoicePrefix}${order.orderNo}`;
  const date = new Date(order.createdAt).toLocaleDateString("en-GB");
  const hasGst = order.gstTotal > 0;

  const rows = order.lines
    .map(
      (l) => `
      <tr>
        <td class="desc">${esc(l.name)}${l.description ? `<div style="color:#9ca3af;font-size:11px">${esc(l.description)}</div>` : ""}</td>
        <td class="hsn"></td>
        <td class="num">${l.qty.toFixed(2)}</td>
        <td class="num">${l.price.toFixed(2)}</td>
        <td class="num tax">${hasGst ? money(lineGst(l)) : ""}</td>
        <td class="num amt">${money(lineNet(l))}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${esc(inv)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 40px; font-size: 13px; }
  .head { display: flex; justify-content: flex-end; }
  .company { text-align: right; line-height: 1.5; }
  .company .name { font-weight: 700; }
  .title { text-align: right; font-size: 28px; color: #5b4b8a; font-weight: 600; margin: 28px 0 36px;
           border-top: 1px solid #5b4b8a; padding-top: 8px; }
  .billto { line-height: 1.6; margin-bottom: 28px; }
  .meta { display: flex; gap: 64px; margin-bottom: 28px; }
  .meta .lbl { color: #5b6b8a; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; color: #374151; font-weight: 600; border-bottom: 1px solid #d1d5db;
             padding: 8px 6px; font-size: 12px; }
  tbody td { padding: 10px 6px; border-bottom: 1px solid #eef0f3; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .num { text-align: right; }
  .amt { font-weight: 500; }
  th.num { text-align: right; }
  .totals { display: flex; justify-content: space-between; margin-top: 28px; }
  .pc { color: #4b5563; }
  .totbox { width: 320px; }
  .totbox .row { display: flex; justify-content: space-between; padding: 6px 0; }
  .totbox .grand { color: #5b4b8a; font-weight: 600; }
  .words { text-align: right; margin-top: 4px; color: #6b7280; font-size: 12px; }
  .words .cap { color: #374151; }
  .foot { margin-top: 80px; display: flex; justify-content: space-between; color: #6b7280;
          border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 12px; }
  @media print { body { padding: 24px; } button { display: none; } }
</style></head>
<body>
  <div class="head">
    <div class="company">
      <div class="name">${esc(s.companyName)}</div>
      <div>${esc(s.companyAddress)}</div>
      <div>${esc(s.companyCity)}</div>
      <div>${esc(s.companyState)}</div>
      ${s.companyGstin ? `<div>GSTIN: ${esc(s.companyGstin)}</div>` : ""}
    </div>
  </div>

  <div class="title">Customer Invoices ${esc(inv)}</div>

  <div class="billto">
    <div><strong>${esc(order.salonName)}</strong></div>
    <div>Place of supply: ${esc(s.companyState.split(",")[0] || "Maharashtra")}</div>
  </div>

  <div class="meta">
    <div><div class="lbl">Invoice Date</div><div>${esc(date)}</div></div>
    <div><div class="lbl">Due Date</div><div>${esc(date)}</div></div>
    <div><div class="lbl">Source</div><div>${esc(order.orderNo)}</div></div>
    <div><div class="lbl">Payment</div><div>${esc(order.paymentStatus)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>HSN/SAC</th>
        <th class="num">Quantity</th>
        <th class="num">Unit Price</th>
        <th class="num">Taxes</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="pc">Payment Communication: ${esc(inv)}</div>
    <div class="totbox">
      <div class="row"><span>Untaxed Amount</span><span>${money(order.subtotal - order.discountTotal)}</span></div>
      ${order.discountTotal ? `<div class="row"><span>Discount</span><span>- ${money(order.discountTotal)}</span></div>` : ""}
      ${hasGst ? `<div class="row"><span>GST</span><span>${money(order.gstTotal)}</span></div>` : ""}
      ${(order.extraCharges ?? []).map((c) => `<div class="row"><span>${esc(c.label || "Charge")}</span><span>${money(c.amount)}</span></div>`).join("")}
      <div class="row grand"><span>Total</span><span>${money(order.total)}</span></div>
      <div class="words"><span class="cap">Total amount in words:</span><br>${esc(rupeesInWords(order.total))}</div>
    </div>
  </div>

  ${order.invoiceNote ? `<div style="margin-top:28px;color:#4b5563;font-size:12px;border-top:1px solid #e5e7eb;padding-top:10px"><strong>Note:</strong> ${esc(order.invoiceNote)}</div>` : ""}

  <div class="foot">
    <div>${esc(s.companyPhone)} &nbsp; ${esc(s.companyEmail)} &nbsp; ${esc(s.companyWebsite)}</div>
    <div>Page 1 / 1</div>
  </div>
</body></html>`;
}

// ---- Print / save-as-PDF in a clean popup window -------------------------
export function printInvoice(order: SalesOrder, s: AppSettings) {
  const html = buildInvoiceHtml(order, s);
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) {
    // Popup blocked — fall back to a downloadable HTML file.
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Invoice-${s.invoicePrefix}${order.orderNo}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the browser a tick to lay out before invoking print.
  w.onload = () => setTimeout(() => w.print(), 300);
}

// ---- WhatsApp share ------------------------------------------------------
// Builds a plain-text invoice summary and opens WhatsApp with it prefilled.
export function invoiceWhatsappText(order: SalesOrder, s: AppSettings): string {
  const inv = `${s.invoicePrefix}${order.orderNo}`;
  const lines = order.lines
    .map((l) => `• ${l.name} ×${l.qty} — ${money(lineNet(l))}`)
    .join("\n");
  return [
    `*${s.companyName}*`,
    `Invoice ${inv}`,
    `Customer: ${order.salonName}`,
    "",
    lines,
    "",
    `Subtotal: ${money(order.subtotal - order.discountTotal)}`,
    order.gstTotal ? `GST: ${money(order.gstTotal)}` : "",
    `*Total: ${money(order.total)}*`,
    `Payment: ${order.paymentStatus}`,
    "",
    `${s.companyPhone} · ${s.companyWebsite}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function shareInvoiceWhatsapp(order: SalesOrder, s: AppSettings, phone?: string) {
  const text = encodeURIComponent(invoiceWhatsappText(order, s));
  // Normalize an Indian number to wa.me format (digits only, default +91).
  let num = (phone || "").replace(/\D/g, "");
  if (num && num.length === 10) num = "91" + num;
  const base = num ? `https://wa.me/${num}` : `https://wa.me/`;
  window.open(`${base}?text=${text}`, "_blank");
}
