import type { AppSettings, SalesOrder, DetailFieldsConfig } from "@/types";
import { lineGst, lineNet } from "./calc";
import { getOrderPaymentInfo } from "./utils";

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
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) =>
  "₹ " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- Standalone invoice HTML (matches the PureCuts layout) ---------------
export function buildInvoiceHtml(
  order: SalesOrder,
  s: AppSettings,
  detailFields: DetailFieldsConfig = {
    amountPaid: false,
    amountToBePaid: false,
    paymentStatus: false,
    totalGst: false,
    gstColumn: false,
    source: false,
    placeOfSupply: false,
  },
  metadata?: {
    ownerName?: string;
    salonName?: string;
    salonAddress?: string;
    placementDateTime?: string;
  }
): string {
  const inv = `${s.invoicePrefix}${order.orderNo}`;
  const date = new Date(order.createdAt).toLocaleDateString("en-GB");
  const paymentInfo = getOrderPaymentInfo(order);

  const rows = order.lines
    .map(
      (l) => {
        const netAmount = l.price * l.qty - l.discount;
        const gstAmount = (netAmount * l.gstRate) / 100;
        const lineTotal = netAmount + gstAmount;
        return `
        <tr>
          <td class="desc">${esc(l.name)}${l.description ? `<div style="color:#9ca3af;font-size:11px">${esc(l.description)}</div>` : ""}</td>
          <td class="num">${l.qty.toFixed(2)}</td>
          <td class="num">${l.price.toFixed(2)}</td>
          ${detailFields.gstColumn ? `<td class="num">${l.gstRate.toFixed(1)}%</td>` : ""}
          <td class="num amt">${money(lineTotal)}</td>
        </tr>`;
      }
    )
    .join("");

  // Calculate savings: MRP - sellingPrice (l.price) * Quantity
  const totalSavings = order.lines.reduce((sum, l) => {
    const mrp = Number((l as any).mrp ?? l.price);
    const savingsPerUnit = Math.max(0, mrp - l.price);
    return sum + savingsPerUnit * l.qty;
  }, 0);

  const computedSubtotal = order.subtotal !== undefined ? order.subtotal : order.lines.reduce((s: number, l: any) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const chargesRows = (order.extraCharges || [])
    .map(
      (c) => `
      <div class="row">
        <span>${esc(c.label || "Charge")}</span>
        <span>${money(c.amount)}</span>
      </div>`
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${esc(inv)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 40px; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #5b4b8a; padding-bottom: 20px; margin-bottom: 30px; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .invoice-logo { height: 50px; width: auto; object-fit: contain; }
  .company { text-align: left; line-height: 1.4; }
  .company .name { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 4px; }
  .inv-title { text-align: right; }
  .inv-title .lbl { color: #4b5563; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; }
  .inv-title .val { font-size: 28px; color: #5b4b8a; font-weight: bold; }
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
    <div class="brand">
      <img src="/logo.jpg" class="invoice-logo" alt="PureCuts Logo" />
      <div class="company">
        <div class="name">${esc(s.companyName)}</div>
        <div>${esc(s.companyAddress)}</div>
        <div>${esc(s.companyCity)}</div>
        <div>${esc(s.companyState)}</div>
        ${s.companyGstin ? `<div>GSTIN: ${esc(s.companyGstin)}</div>` : ""}
      </div>
    </div>
    <div class="inv-title">
      <div class="lbl">INVOICE NUMBER</div>
      <div class="val">${esc(inv)}</div>
    </div>
  </div>

  <div class="billto">
    <div><strong>Salon Name:</strong> ${esc(metadata?.salonName || order.salonName || "-")}</div>
    <div><strong>Owner Name:</strong> ${esc(metadata?.ownerName || "-")}</div>
    <div><strong>Address:</strong> ${esc(metadata?.salonAddress || "-")}</div>
    ${detailFields.placeOfSupply ? `<div style="margin-top:4px">Place of supply: ${esc(s.companyState.split(",")[0] || "Maharashtra")}</div>` : ""}
  </div>

  <div class="meta">
    <div><div class="lbl">Order Date & Time</div><div>${esc(metadata?.placementDateTime || date)}</div></div>
    ${detailFields.source ? `<div><div class="lbl">Source</div><div>${esc(order.orderNo)}</div></div>` : ""}
    ${detailFields.paymentStatus ? `<div><div class="lbl">Payment Status</div><div>${esc(paymentInfo.statusText)}</div></div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Quantity</th>
        <th class="num">Unit Price (SP)</th>
        ${detailFields.gstColumn ? `<th class="num">GST %</th>` : ""}
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="pc">Payment Communication: ${esc(inv)}</div>
    <div class="totbox">
      <div class="row"><span>Subtotal</span><span>${money(computedSubtotal)}</span></div>
      ${order.discountTotal && order.discountTotal > 0 ? `<div class="row"><span>Discount</span><span>- ${money(order.discountTotal)}</span></div>` : ""}
      ${detailFields.totalGst ? `<div class="row"><span>Total GST</span><span>${money(order.gstTotal)}</span></div>` : ""}
      ${chargesRows}
      <div class="row grand"><span>Total Bill</span><span>${money(order.total)}</span></div>
      ${detailFields.amountPaid ? `<div class="row"><span>Amount Paid</span><span>${money(paymentInfo.amountPaid)}</span></div>` : ""}
      ${detailFields.amountToBePaid ? `<div class="row"><span>Amount To Be Paid</span><span>${money(paymentInfo.balanceAmount)}</span></div>` : ""}
      ${detailFields.paymentStatus ? `<div class="row"><span>Payment Status</span><span><strong>${esc(paymentInfo.statusText)}</strong></span></div>` : ""}
      <div class="words"><span class="cap">Total amount in words:</span><br>${esc(rupeesInWords(order.total))}</div>
    </div>
  </div>

  ${totalSavings > 0 ? `
  <div style="margin-top: 32px; text-align: center; font-size: 18px; font-weight: bold; color: #16a34a; border: 2px dashed #16a34a; padding: 12px; border-radius: 8px; background-color: #f0fdf4;">
    🎉 You saved ${money(totalSavings)} on this order!
  </div>
  ` : ""}

  ${order.invoiceNote ? `<div style="margin-top:28px;color:#4b5563;font-size:12px;border-top:1px solid #e5e7eb;padding-top:10px"><strong>Note:</strong> ${esc(order.invoiceNote)}</div>` : ""}

  <div class="foot">
    <div>${esc(s.companyPhone)} &nbsp; ${esc(s.companyEmail)} &nbsp; ${esc(s.companyWebsite)}</div>
    <div>Page 1 / 1</div>
  </div>
</body></html>`;
}

// ---- Print / save-as-PDF in a clean popup window -------------------------
export function printInvoice(
  order: SalesOrder,
  s: AppSettings,
  detailFields: DetailFieldsConfig = {
    amountPaid: false,
    amountToBePaid: false,
    paymentStatus: false,
    totalGst: false,
    gstColumn: false,
    source: false,
    placeOfSupply: false,
  },
  metadata?: {
    ownerName?: string;
    salonName?: string;
    salonAddress?: string;
    placementDateTime?: string;
  }
) {
  const html = buildInvoiceHtml(order, s, detailFields, metadata);
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
export function invoiceWhatsappText(
  order: SalesOrder,
  s: AppSettings,
  detailFields: DetailFieldsConfig = {
    amountPaid: false,
    amountToBePaid: false,
    paymentStatus: false,
    totalGst: false,
    gstColumn: false,
    source: false,
    placeOfSupply: false,
  },
  metadata?: {
    ownerName?: string;
    salonName?: string;
    salonAddress?: string;
    placementDateTime?: string;
  }
): string {
  const inv = `${s.invoicePrefix}${order.orderNo}`;
  const paymentInfo = getOrderPaymentInfo(order);
  const lines = order.lines
    .map((l) => `• ${l.name} ×${l.qty} — ${money(lineNet(l) + (detailFields.gstColumn ? lineGst(l) : 0))}`)
    .join("\n");

  const resolvedSalonName = metadata?.salonName || order.salonName || "-";
  const resolvedOwnerName = metadata?.ownerName || "-";
  const resolvedAddress = metadata?.salonAddress || "-";
  const resolvedDateTime = metadata?.placementDateTime || new Date(order.createdAt).toLocaleDateString("en-GB");

  const computedSubtotal = order.subtotal !== undefined ? order.subtotal : order.lines.reduce((s: number, l: any) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const chargesList = (order.extraCharges || [])
    .map((c) => `• ${c.label || "Charge"}: ${money(c.amount)}`)
    .join("\n");

  return [
    `*${s.companyName}*`,
    `Invoice ${inv}`,
    `Customer (Salon): ${resolvedSalonName}`,
    `Owner: ${resolvedOwnerName}`,
    `Address: ${resolvedAddress}`,
    `Order Placed: ${resolvedDateTime}`,
    detailFields.placeOfSupply ? `Place of supply: ${s.companyState.split(",")[0] || "Maharashtra"}` : "",
    "",
    lines,
    "",
    `Subtotal: ${money(computedSubtotal)}`,
    order.discountTotal && order.discountTotal > 0 ? `Discount: - ${money(order.discountTotal)}` : "",
    detailFields.totalGst ? `GST Total: ${money(order.gstTotal)}` : "",
    chargesList,
    `*Total Bill: ${money(order.total)}*`,
    detailFields.amountPaid ? `Amount Paid: ${money(paymentInfo.amountPaid)}` : "",
    detailFields.amountToBePaid ? `Amount To Be Paid: ${money(paymentInfo.balanceAmount)}` : "",
    detailFields.paymentStatus ? `*Payment Status: ${paymentInfo.statusText}*` : "",
    "",
    `${s.companyPhone} · ${s.companyWebsite}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function shareInvoiceWhatsapp(
  order: SalesOrder,
  s: AppSettings,
  phone?: string,
  detailFields: DetailFieldsConfig = {
    amountPaid: false,
    amountToBePaid: false,
    paymentStatus: false,
    totalGst: false,
    gstColumn: false,
    source: false,
    placeOfSupply: false,
  },
  metadata?: {
    ownerName?: string;
    salonName?: string;
    salonAddress?: string;
    placementDateTime?: string;
  }
) {
  const text = encodeURIComponent(invoiceWhatsappText(order, s, detailFields, metadata));
  // Normalize an Indian number to wa.me format (digits only, default +91).
  let num = (phone || "").replace(/\D/g, "");
  if (num && num.length === 10) num = "91" + num;
  const base = num ? `https://wa.me/${num}` : `https://wa.me/`;
  window.open(`${base}?text=${text}`, "_blank");
}
