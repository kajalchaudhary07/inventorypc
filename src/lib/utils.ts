import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CURRENCY = "₹";

export const inr = (n: number) =>
  `${CURRENCY}${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const num = (n: number) => Number(n || 0).toLocaleString("en-IN");

export const pct = (n: number) => `${Number(n || 0).toFixed(1)}%`;

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Export an array of plain objects to a CSV file (opens in Excel/Sheets).
export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const daysAgo = (d: number) => Date.now() - d * 86400000;

export function getOrderPaymentInfo(order: any) {
  const total = Number(order.total ?? 0);
  let amountPaid = 0;
  
  // Priority 1: amountPaid field on the document (Firestore-persisted)
  if (order.amountPaid !== undefined && order.amountPaid !== null) {
    amountPaid = Number(order.amountPaid);
  } else {
    // Priority 2: localStorage cache (backward compatibility)
    const localPaymentsStr = typeof window !== "undefined" ? localStorage.getItem("pc_order_payments") : null;
    const localPayments = localPaymentsStr ? JSON.parse(localPaymentsStr) : {};
    
    if (order.id && localPayments[order.id] !== undefined) {
      amountPaid = Number(localPayments[order.id]);
    } else {
      // Priority 3: Infer from paymentStatus
      const status = String(order.paymentStatus || "").toLowerCase();
      if (status === "paid") {
        amountPaid = total;
      } else if (status === "partial") {
        amountPaid = total / 2;
      } else {
        amountPaid = 0;
      }
    }
  }
  
  const balanceAmount = Math.max(0, total - amountPaid);
  
  let statusText = "Unpaid";
  let statusColor = "rose";
  
  if (amountPaid >= total) {
    statusText = "Paid";
    statusColor = "emerald";
  } else if (amountPaid > 0) {
    statusText = "Partial Paid";
    statusColor = "amber";
  }
  
  return {
    billAmount: total,
    amountPaid,
    balanceAmount,
    statusText,
    statusColor
  };
}

/**
 * Normalizes text for search matching:
 * - Lowercases and trims
 * - Unicode normalization (NFD) stripping accents
 * - Normalizes apostrophes (' ’ ‘ ʻ ʼ ´ `) -> stripped so "men's" matches "mens"
 * - Normalizes hyphens, dashes, slashes, underscores -> spaces
 * - Replaces any non-alphanumeric punctuation with spaces
 * - Collapses consecutive whitespace into a single space
 */
export function normalizeSearchText(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’‘ʻʼ´`]/g, "")
    .replace(/[-–—_./\\,;:!@#$%^&*()[\]{}|<>?+=~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CustomerSearchable {
  name?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  type?: string;
  description?: string;
  [key: string]: any;
}

/**
 * Calculates a relevance score for a customer item given a user search query.
 * Returns > 0 if matched (higher = more relevant), 0 if no match.
 */
export function calculateCustomerMatchScore(query: string, item: CustomerSearchable): number {
  if (!query || !query.trim()) return 1;

  const rawQ = query.trim().toLowerCase();
  const normQ = normalizeSearchText(query);
  if (!normQ) return 0;

  const qTokens = normQ.split(" ").filter(Boolean);
  const qDigits = rawQ.replace(/\D/g, "");

  const name = item.name || "";
  const normName = normalizeSearchText(name);
  const nameTokens = normName.split(" ").filter(Boolean);

  const ownerName = item.ownerName || "";
  const normOwner = normalizeSearchText(ownerName);
  const ownerTokens = normOwner.split(" ").filter(Boolean);

  const phone = item.phone || "";
  const phoneDigits = phone.replace(/\D/g, "");

  const email = item.email || "";
  const normEmail = normalizeSearchText(email);

  const gstin = item.gstin || "";
  const normGstin = normalizeSearchText(gstin);

  let score = 0;

  // 1. Exact Full Name Match (normalized)
  if (normName === normQ) {
    return 10000;
  }

  // 2. Name Starts With Normalized Query (e.g. "S Men's Salon" starts with "s mens")
  if (normName.startsWith(normQ)) {
    const penalty = Math.min(500, (normName.length - normQ.length) * 2);
    score = Math.max(score, 8000 - penalty);
  }

  // 3. Name starts with raw query (case-insensitive bonus)
  if (name.toLowerCase().startsWith(rawQ)) {
    score = Math.max(score, 8200);
  }

  // 4. Consecutive Word-Prefix Matching on Name:
  // e.g. Query "s men" matches Name ["s", "mens", "salon"] where word 0 starts with "s", word 1 starts with "men"
  if (qTokens.length > 0 && nameTokens.length >= qTokens.length) {
    const isConsecutivePrefix = qTokens.every((token, idx) => nameTokens[idx]?.startsWith(token));
    if (isConsecutivePrefix) {
      score = Math.max(score, 6500);
    }
  }

  // 5. Word-boundary exact match in Name (e.g. word somewhere in name starts with full normQ)
  if (nameTokens.some(tok => tok.startsWith(normQ))) {
    score = Math.max(score, 5000);
  }

  // 6. All query tokens match the prefix of distinct words in Name
  if (qTokens.length > 0) {
    const allTokensPrefixMatch = qTokens.every((token) =>
      nameTokens.some((word) => word.startsWith(token))
    );
    if (allTokensPrefixMatch) {
      score = Math.max(score, 4000);
    }
  }

  // 7. All query tokens are substrings anywhere in Name
  if (qTokens.length > 0) {
    const allTokensInName = qTokens.every((token) => normName.includes(token));
    if (allTokensInName) {
      score = Math.max(score, 2500);
    }
  }

  // 8. Phone Number Match
  if (qDigits.length >= 3) {
    if (phoneDigits.startsWith(qDigits)) {
      score = Math.max(score, 3500);
    } else if (phoneDigits.includes(qDigits)) {
      score = Math.max(score, 1800);
    }
  }

  // 9. Owner Name Match
  if (normOwner) {
    if (normOwner === normQ) {
      score = Math.max(score, 5500);
    } else if (normOwner.startsWith(normQ)) {
      score = Math.max(score, 3800);
    } else if (qTokens.every((tok) => normOwner.includes(tok) || ownerTokens.some((w) => w.startsWith(tok)))) {
      score = Math.max(score, 2000);
    }
  }

  // 10. Email / GSTIN Match
  if (normEmail && (normEmail.startsWith(normQ) || normEmail.includes(normQ))) {
    score = Math.max(score, 1200);
  }
  if (normGstin && (normGstin.startsWith(normQ) || normGstin.includes(normQ))) {
    score = Math.max(score, 1200);
  }

  // 11. Across-all-fields fallback token match
  const combinedText = `${normName} ${normOwner} ${phoneDigits} ${normEmail} ${normGstin}`;
  if (qTokens.length > 0 && qTokens.every((tok) => combinedText.includes(tok))) {
    score = Math.max(score, 800);
  }

  // 12. Fallback Substring in Raw Name (e.g. "look[s men's]")
  if (score === 0 && name.toLowerCase().includes(rawQ)) {
    score = 50;
  }

  return score;
}

