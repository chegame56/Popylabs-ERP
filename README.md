# Popylabs ERP

**The simplest SaaS for Sri Lankan SMEs to run sales, stock, and records — on phone or computer.**

No expensive hardware. Works during power cuts. Produces correct IRD TAX INVOICES from day one.

## Current Status (Scaffold Complete)

- Next.js 15 + TypeScript + Tailwind + shadcn-friendly setup
- Firebase dependencies ready (Auth, Firestore, Storage)
- All main screens from the MVP spec have working shells:
  - Login / Register
  - Dashboard (today’s summary, quick actions, recent activity)
  - Products (list + add modal)
  - New Sale + New Order (real cart, discount, payment, **live jsPDF TAX INVOICE**)
  - Scanner (camera using html5-qrcode — works on phone)
  - History, Reports, Settings
- AppLayout with responsive nav (great on desktop + phone)
- Real PDF generation for invoices (with amount in words)
- Thermal receipt print hook (placeholder)
- PWA manifest started

See:
- [docs/MVP-Spec-v1.md](./docs/MVP-Spec-v1.md)
- [docs/tech-architecture.md](./docs/tech-architecture.md) (decisions locked)

## Quick Start (Development)

```bash
# 1. Copy env and fill your Firebase web app config
cp .env.local.example .env.local
# Edit .env.local with your Firebase keys

# 2. Run
npm run dev
```

Open http://localhost:3000

You can currently:
- Create account / login (demo)
- Navigate all screens
- Add products to cart in New Sale
- Complete a sale → real PDF TAX INVOICE is generated and downloaded
- Use the Scanner (camera permission required)
- See the “Print Receipt (Thermal)” button in the success modal

## Next (Real Firebase Integration)

We will now wire:
- Real Email + Password auth with Firebase
- Organization document on signup (business profile, TIN, invoice prefix)
- Products stored in Firestore per organization
- Active cart (for phone ↔ desktop scanner)
- Immutable transactions + stock movements on sale completion
- Proper offline behavior + sync
- Refined IRD invoice template (more accurate layout + fields)

## Tech Notes

- Straight to Firebase (as decided)
- Simplest active cart model using `activeCarts/{org_user}` documents + realtime
- PDF primary + thermal receipt print support
- Invoice numbering designed to support branches later

---

Run `npm run dev` and start clicking through the flows. Let me know what to build next (real auth + Firestore products is the logical immediate step).
