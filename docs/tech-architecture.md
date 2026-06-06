# Popylabs ERP – Tech Decisions & Architecture (v1.0)

**Status**: Short decision record. Derived directly from [MVP-Spec-v1.md](./MVP-Spec-v1.md).  
**Date**: June 2026  
**Goal**: Make pragmatic choices that let us ship a reliable offline-first SaaS fast, while satisfying the non-negotiables (IRD invoices, phone-as-scanner hybrid use, power-cut resilience, multi-device, simple UX).

---

## 1. Guiding Constraints (from Spec)

- Offline-first is **P0** and a major differentiator. Sales + stock changes must work with zero internet/power and sync cleanly later.
- Stock correctness is critical (no lost sales or negative ghosts on sync).
- Hybrid scanner: Phone camera must be able to feed an active desktop sale (realtime preferred, polling acceptable).
- Every completed transaction **must** produce a correct, professional, printable IRD TAX INVOICE (specific fields + layout + amount in words).
- Excellent on both old desktop browsers **and** modern phones. PWA installable.
- Launch fast (show working software to existing clients in months, not a year). Keep v1 scope narrow.
- SaaS foundation (multi-tenancy) even if first clients are manually onboarded.

---

## 2. High-Level Stack Decision

**Chosen Stack**:

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + lucide-react
- **Backend / Data / Auth / Realtime / Storage**: **Firebase** (Firestore + Firebase Auth + Firebase Storage)
- **Offline**: Firestore native offline persistence + custom write queue for critical flows
- **PWA**: next-pwa (or manual manifest + service worker) + installable on phone + desktop
- **Invoice / PDF**: Client-side generation with `jspdf` + structured HTML layout (or `@react-pdf/renderer` for more control). Server-side option later.
- **Scanner**: `html5-qrcode` (or ZXing browser) for camera barcode/QR scanning
- **State / Local**: Zustand + Dexie (IndexedDB) for UI state + optimistic local writes
- **Hosting**: Vercel (frontend + API routes if needed) + Firebase (data)

**Why Firebase over Supabase / pure Postgres for v1**:
- Best-in-class offline persistence out of the box (Firestore caches and syncs automatically when online). This directly de-risks the #1 user pain (power cuts).
- Excellent realtime subscriptions — makes the "phone scans into desktop active sale" feature trivial and reliable.
- Very fast to get auth + multi-device + cross-device sync working.
- Lower operational burden early on (no need to manage Postgres + sync engine yet).
- Still gives us a path to proper SaaS (we can add a thin backend layer or migrate data later).

**Trade-off accepted**: Less "pure SQL" control today. We will keep the data model simple and event-oriented so a future migration (to Supabase/Postgres + PowerSync or similar) is feasible without rewriting core logic.

**Alternatives considered**:
- Next.js + Supabase + custom sync queue / ElectricSQL → More "real database" and RLS for tenancy, but significantly more work for reliable offline sales + stock. Slower time to working offline prototype.
- Pure local-first (ElectricSQL / PowerSync + Postgres from day 1) → Best long-term architecture for offline + conflict resolution, but higher complexity and slower initial velocity. Overkill for v1 when we have no clients yet.
- Tauri / desktop app → Violates "works in any browser on old computers + phones" requirement.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (PWA)                          │
│  Next.js + shadcn + Tailwind                                 │
│  - Responsive layouts (phone-first + excellent desktop)      │
│  - Zustand stores                                            │
│  - Dexie (local cache + optimistic writes)                   │
│  - html5-qrcode (scanner)                                    │
│  - jsPDF (invoice rendering)                                 │
│  - Offline queue for mutations                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Firebase SDK (Auth + Firestore + Storage)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Firebase (Backend)                      │
│  - Firebase Auth (email/phone + password; later OTP)         │
│  - Firestore (primary data)                                  │
│    • organizations (tenant)                                  │
│    • users (linked to org)                                   │
│    • products                                                │
│    • transactions (immutable sale/order events)              │
│    • stock_movements (projection from txns)                  │
│  - Realtime listeners (critical for hybrid scanner)          │
│  - Native offline cache + background sync                    │
│  - Firebase Storage (product photos, small compressed)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (Future)
                              ▼
                    Vercel (hosting + optional server routes)
```

**Key data principle**: Treat **transactions** (sales/orders) as immutable events. Stock is a derived projection (can be recalculated from events). This is the safest model for offline + eventual sync.

---

## 4. Critical Technical Decisions

### 4.1 Offline & Sync Strategy (Highest Risk Area)
- **Use Firestore offline persistence** as the foundation (automatic for queries and writes when the SDK is configured correctly).
- **Additional write queue** (using Dexie or a simple array in localStorage + Firestore `add` with client timestamps) for sales and stock adjustments. This gives us:
  - Immediate UI feedback even if Firestore write is queued.
  - Ability to show "pending sync" state clearly.
  - Easier to add conflict UI later.
- On reconnect: Process queue in order, then let Firestore listeners reconcile UI.
- **Stock safety rule**: Never trust the current `quantity` field in a product document for offline decisions. On sale completion (even offline), record a `transaction` + `stock_movement` event with `delta`. Recompute available stock from events when needed.
- Conflict resolution (v1): Last-write-wins with timestamp. Log all events so we can debug/repair if a shop reports issues. We will surface "sync issues" clearly.

**Offline indicator** must be prominent (top bar).

### 4.2 Cross-Device / Phone-as-Scanner Flow (Simplest Approach)
We are using the **simplest approach that still delivers real hybrid value**.

- When a user starts a **New Sale** (or New Order), we create (or reuse) a lightweight `activeCarts/{orgId}_{userId}` document in Firestore.
- The cart document contains: current line items (product snapshots + qty), status (`open` / `completed`), and basic metadata.
- Desktop (or phone) doing the sale subscribes to its own active cart in realtime.
- On the phone, the **Scanner** screen has a mode "Add to current sale". Successful scans (or manual entry) write directly into the active cart document.
- Desktop sees items appear live in the cart.
- On "Complete Sale", the active cart is turned into a permanent `transaction`, stock movements are recorded, the cart doc is marked completed (or deleted), and the IRD TAX INVOICE is generated.
- Fallback behavior: If no active cart exists, scanner can still add products to a new sale or show "no active sale — start one on another device".

This is the minimal realtime surface we need. No complex sessions or rooms. One active cart per user in the org at a time is sufficient for v1.

If this proves too simple in practice, we can evolve it post-launch.

### 4.3 Authentication & Tenancy (SaaS Foundation)
- Firebase Auth using **Email + Password only** for v1 (as confirmed).
- Every user belongs to exactly **one organization** in v1 (simplifies everything).
- Organization document stores business profile (legalName, tin, address, logoUrl, invoicePrefix, nextInvoiceSequence, defaultVatRate, lowStockThreshold, etc.).
- Use Firestore security rules + `organizationId` on every document for isolation.
- Later (post v1): Support multiple organizations per user + staff invitations + basic roles.

### 4.4 Invoice Generation (Compliance)
- Generate on the client at sale completion (and on demand for reprints).
- Use a structured template that hard-codes the required IRD fields in the correct order/layout. This is non-negotiable.
- Primary output: **PDF file**
  - Download button
  - Print button (opens PDF print dialog)
  - Share button (uses Web Share API + falls back to download)
- Traditional receipt printing support:
  - Dedicated "Print Receipt" action that renders a narrow, large-font HTML version optimized for thermal printers (80mm or 58mm paper).
  - Uses CSS `@media print` + specific receipt classes. User can set default printer to their thermal printer.
  - Keep this simple but usable (big text, minimal info, clear totals, tax summary).
- Also provide quick "Copy text for WhatsApp" as a secondary share path.
- Amount in words: Small pure TS utility (supports LKR, handles "Rupees Only").
- We re-render invoices from the stored transaction data on demand (safer, no snapshot bloat). Make the renderer a pure function so it's easy to update when IRD rules change.
- Invoice number generation: Handled at completion time using the organization's configured prefix + sequence logic (see data model).

### 4.5 Data Model Sketch (v1) + Invoice Numbering (Best Pragmatic Approach)

Core collections:

- `organizations/{orgId}` — business profile (legalName, tin, address, logoUrl, contactPhone, defaultVatRate, lowStockThreshold, invoicePrefix, nextInvoiceSequence, lastSequenceResetMonth)
- `users/{uid}` — with `organizationId`, email, displayName, role (owner for v1)
- `products/{productId}` — orgId, name, sellingPrice, costPrice?, barcode, photoUrl?, category, stockQuantity (denormalized projection for quick display), lowStockThreshold, isActive
- `transactions/{txnId}` — immutable event: orgId, type ('sale' | 'order'), createdAt, createdBy, lines: array of {productId, name, qty, unitPrice, lineTotal}, subtotal, discount, grandTotal, paymentMethod, customerName?, customerPhone?, source?, invoiceNumber, status
- `stockMovements/{moveId}` — orgId, productId, delta (positive or negative), reason ('sale' | 'adjustment' | 'initial'), refTransactionId?, createdAt, deviceInfo?

**Invoice numbering (best pragmatic approach for v1)**:
- Store `invoicePrefix` (e.g. "INV-") and `nextInvoiceSequence` on the organization.
- On sale/order completion we atomically claim the next number (use a small transaction or a counter document + rules).
- Format for v1: `{prefix}{YY}{MM}{sequence padded}` (e.g. `INV-2606000123`). This is easy to make branch-aware later.
- Support for branches: We will **not** implement multiple branches in v1 UI, but the data model + numbering logic will be designed so we can later add `branchId` + per-branch sequences without breaking existing numbers. The "best" choice here is to keep the org-level sequence simple and clean now, while documenting the extension path.

Keep documents reasonably small. Line items live inside the transaction document.

Stock is **never** the source of truth for calculations during sales — we always derive from movements when doing reconciliation. The `stockQuantity` on product is a convenience projection updated after each movement.

### 4.6 UI / Component Strategy
- Use shadcn/ui primitives heavily (Dialog, Sheet, Table, Button, Input, etc.) for speed and consistency.
- One main "App" layout with bottom nav on phone / sidebar on desktop (or responsive header + command palette later).
- Screens map closely to the spec:
  - `(app)/dashboard`
  - `(app)/products`
  - `(app)/sale` (New Sale + New Order modes via param or tabs)
  - `(app)/scanner`
  - `(app)/history`
  - `(app)/reports`
  - `(app)/settings`
- Big tappable targets everywhere. Use responsive grid/flex that collapses nicely.
- Optimistic updates + clear loading / error / offline states on every mutation.

### 4.7 Photos & Media
- Firebase Storage, uploaded from client.
- Resize/compress on client before upload (use `browser-image-compression` or canvas) to keep things fast on mobile data.
- Store `photoURL` (or small + original) on product.

### 4.8 Deployment & Dev Experience
- Vercel for Next.js (preview deployments per branch = great for showing clients iterations).
- Firebase project per environment (dev / prod) or use emulators locally.
- Start with a single Firebase project and manual "org" creation for first real users.
- Local development: Firebase emulators for Auth + Firestore when possible.

---

## 5. Implementation Phasing (Straight to Firebase)

We are building with real Firebase from day one (no separate mock-only phase).

**Phase 1 (Core Build)**: Scaffold + Firebase foundation + main flows
- Next.js 15 scaffold + PWA setup + shadcn/ui + Tailwind
- Firebase project setup + emulators for local dev
- Auth (Email + Password)
- Organization creation / business profile (TIN, prefix, etc.) on first login
- Products: CRUD + photo upload (Storage) + stock management
- Active cart + realtime scanner (phone adds to desktop sale)
- New Sale + New Order flows with cart, discount, payment
- On complete: Create immutable transaction + stock movements + generate real IRD TAX INVOICE PDF + receipt print view
- Dashboard with today's summary, low stock, recent activity
- Basic offline support using Firestore persistence + local queue for writes

**Phase 2**: Polish, history, reports, settings, offline hardening
- Sales/Orders history + invoice reprint + receipt print
- Light reports (daily totals, top products, low stock)
- Settings (full business profile, invoice numbering preview)
- Strong offline testing: full day of sales + stock changes in airplane mode → reconnect + verify stock + invoices
- Error/empty/offline states, big tappable targets, low-tech friendly UX
- Cross-device testing (desktop + real phone)

**Phase 3**: Post-launch / first users
- Proper SaaS multi-org + staff accounts (if needed)
- Subscription billing for Popylabs ERP itself
- Data export, better audit, more reports
- Any IRD format tweaks based on real usage

We will still build the UI in a way that core flows can be exercised quickly even before every Firebase piece is perfect.

---

## 6. Risks & Mitigations

| Risk                              | Mitigation                                                                 |
|-----------------------------------|----------------------------------------------------------------------------|
| Stock goes wrong after offline sales | Immutable transaction events + ability to replay/recompute stock. Clear "pending" UI. |
| IRD rejects invoices              | Hard-code the exact required layout + fields early. Make a test "sample invoice" button. Get local accountant review. |
| Realtime scanner feels laggy      | Use Firestore listeners; fall back to manual refresh button + "last scanned" list. |
| PWA offline experience is janky   | Heavy testing on real Android + low-end Windows laptop. Big "You are offline" banner. |
| Scope creep                       | Ruthlessly stick to the P0 list in the spec. Anything else goes to a visible "v1.1" backlog. |
| Firebase lock-in                  | Keep domain logic (sale creation, stock projection, invoice rendering) in plain TS functions that don't know about Firestore. |

---

## 7. Confirmed Decisions

All open decisions from the previous version have been locked by the user:

1. **Go straight to Firebase** — Build with real Firebase (Firestore + Auth + Storage) from the beginning. Use Firebase emulators for local development and testing. No separate mock-only prototype phase.
2. **Simplest approach for hybrid scanner / active cart** — Use the lightest possible realtime mechanism that still delivers the core "phone scans into desktop sale" experience (detailed in 4.2 below).
3. **Invoice outputs** — Primary: PDF file (download + print via jsPDF). Also provide:
   - Traditional receipt printing (narrow thermal printer friendly HTML + CSS `@media print` for 80mm/58mm paper).
   - Easy "Share PDF" (or image/PDF link) for WhatsApp/email.
4. **Branches & invoice sequences** — Best pragmatic approach for v1: Single organization with configurable invoice prefix + reliable sequence generation. Design the model and numbering logic so multi-branch (different sequences per branch) can be added cleanly later without data migration pain. See data model section.
5. **Auth** — Email + Password only for v1. No phone OTP or magic links in the initial release.

---

**Decisions Locked** (user confirmation 2026-06):
1. Go straight to Firebase (no separate local-only Phase 0).
2. Simplest viable approach for active cart / hybrid scanning.
3. Primary output = PDF file (download + print). Also support traditional receipt printing (thermal-friendly HTML print) + share PDF option.
4. Best pragmatic approach for branches/sequences (see 4.5).
5. Email + Password login only for v1.

**Next step**: Scaffold the Next.js + Firebase project directly (with Firebase from the start, using emulators for local dev). Update MVP spec "Next" line.

Update this file if any implementation realities force changes.
