# Salon Inventory — Admin Module

A standalone, production-style **inventory dashboard** for a B2B salon-supplies
business, built to drop alongside your existing admin panel. Styled after Zoho
Inventory / Shopify Admin / Odoo, with dark/light mode, charts, animated UI,
and a full Firestore service layer.

> **Runs out of the box in DEMO MODE** with realistic dummy data — just install
> and `npm run dev`. Add your Firebase keys to `.env` and it automatically
> switches to **LIVE MODE** (real-time Firestore + email/password auth).

## Tech stack
React + TypeScript · Vite · Tailwind (dark mode) · Firebase (Firestore / Auth /
Storage) · Zustand · TanStack Table · Recharts · Framer Motion · React Hook Form
+ Zod · lucide-react · react-hot-toast.

## Pages (14)
Dashboard · Products · Product Details · Item Groups & Variants · Stock
Management · Purchase Orders · Sales Orders · Manual Order Entry · Salon
Customers · Vendors · Analytics & Reports · **Business Intelligence** · Activity
Logs · Settings.

The Business Intelligence page adds 30+ KPIs and charts: total sales, sales
growth %, AOV, GMV, gross profit, profit by product/salon, top categories,
manual-vs-app split, delivery success rate, average fulfillment time, return
rate, cancelled orders, active/repeat/churned salons, new-salon growth, monthly
active salons (MAS), repeat-revenue %, region-wise sales, credit-vs-paid orders,
outstanding payments, and a cash-flow trend.

Odoo-style stock operations are included: goods receipts, **partial receiving**,
manual adjustments, **damaged / expired** write-offs, returns/restock, reorder
levels, stock valuation, and fast/slow/dead-stock velocity analysis.

## Folder structure
```
src/
  lib/          firebase.ts · utils.ts · calc.ts · seed.ts
  types/        index.ts (all interfaces)
  store/        uiStore · dataStore · authStore (Zustand)
  services/     data.ts (listeners, CRUD, business ops)
  components/
    ui/         primitives · Modal · DataTable · StatusBadge · ErrorBoundary
    layout/     Sidebar · Topbar · DashboardLayout
  pages/        the 13 pages above
  App.tsx       auth gate + routing (lazy-loaded)
firestore.rules super-admin-only rules
```

## 1. Run the demo (no Firebase needed)
```bash
npm install
npm run dev          # http://localhost:5173 → "Enter demo dashboard"
```
Everything is interactive: add products, create orders (stock decrements, movements
+ activity logged), receive POs, adjust stock, toggle dark mode, etc. Data lives in
memory for the session.

## 2. Go live with Firebase
```bash
cp .env.example .env
```
Paste your web-app config (Firebase console → Project settings → General → Your
apps → SDK setup) into `.env`. Restart `npm run dev`.

Then set up the super-admin (email + password login):
1. Firebase console → **Authentication** → add a user (email + password).
2. Copy that user's **UID**.
3. Firestore → create the **`admins`** collection → add a document whose
   **Document ID == that UID**.
4. Paste `firestore.rules` into **Firestore → Rules → Publish**.

On next load the app shows a real login screen; only UIDs present in `admins`
can read/write — enforced by the rules, not just the UI.

> **Seeding live data:** the dummy arrays in `src/lib/seed.ts` match the
> Firestore schema exactly. You can write them into Firestore once (e.g. a small
> admin script using the same field names) to start with sample data, or just
> begin adding products from the UI.

## Scripts
```bash
npm run dev         # local dev server
npm run build       # production build → /dist
npm run typecheck   # tsc --noEmit
npm run preview     # preview the production build
```

## Notes
- All writes funnel through `src/services/data.ts`, so the same UI works in demo
  and live modes.
- Currency is INR (₹) with GST; change defaults in **Settings** or
  `src/lib/utils.ts`.
- Reports export to CSV (opens in Excel) and print to PDF via the browser.
- For high-volume live use, swap the multi-document writes in `services/data.ts`
  for Firestore `writeBatch`/`runTransaction` and add composite indexes as
  Firestore prompts.
