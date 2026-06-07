# Popylabs ERP

**The simplest SaaS for Sri Lankan SMEs to run sales, stock, and records — on phone or computer.**

No expensive hardware. Works during power cuts. Produces professional bills (with VAT breakdown) from day one.

## Current Status (Production Ready Core)

- Next.js 15 + TypeScript + Tailwind
- Firebase Auth + Firestore (multi-tenant, production security rules)
- Full real data layer:
  - Products fully persisted per organization (add/edit/delete, realtime stock)
  - Sales & Orders: atomic transactions that safely deduct stock + advance invoice sequence + record immutable transactions
  - Live bill PDFs using your actual business name, TIN, and correct serial numbering
- Settings: real org profile (name, TIN, prefix, low stock threshold)
- History: real past transactions with PDF re-download
- Dashboard: real recent activity + low stock counts
- Scanner + PWA manifest ready (offline persistence enabled)
- Proper Vercel config + security headers

See:
- [docs/MVP-Spec-v1.md](./docs/MVP-Spec-v1.md)
- [docs/tech-architecture.md](./docs/tech-architecture.md)

## Important: Production Firebase Setup

**Before going live with real customers:**

1. Use a **separate production Firebase project** (recommended) or lock down rules on your current project.
2. Deploy the production rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
3. Set all `NEXT_PUBLIC_FIREBASE_*` variables in your Vercel project settings (use the production Firebase config).
4. Copy `.env.example` → `.env.local` for local development.

See [docs/firebase-setup.md](./docs/firebase-setup.md) for details.

## Quick Start (Local)

```bash
cp .env.example .env.local
# fill your Firebase keys
npm run dev
```

Register a business → you get a real organization. Everything (products, sales, invoices, history) is now stored in Firestore and scoped to your org.

## Key Production Features

- **Atomic sales**: stock deduction + invoice sequence + transaction record happen together or not at all.
- **Org-scoped security rules**: users can only see and modify their own organization's data.
- **Offline resilient**: Firestore persistence enabled (works during power cuts; syncs when back online).
- **Professional bills** (VAT shown) generated client-side with real business data + amount in words.
- Deployed on Vercel.

## Tech Notes

- Firebase (Auth + Firestore) with production security rules
- Client-side PDF invoices (jsPDF) using live org data
- Strong emphasis on atomic operations for stock + numbering
- PWA + offline persistence for Sri Lankan power/internet realities

---

The core ERP flows (products, sales with stock, invoicing, history) are now production-backed. Next logical additions: improved scanner cross-device sync, better reports, email receipts, roles/staff accounts.
