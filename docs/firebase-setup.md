# Firebase Setup for Popylabs ERP

This project uses **Firebase** for:
- Authentication (Email + Password)
- Firestore (main database for organizations, products, sales, etc.)

**We do NOT use Firebase Storage** for product images to avoid any costs. Product images (if any) will use public image URLs instead.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** (or use an existing one)
3. Give it a name (e.g. `popylabs-erp-dev`)

## 2. Enable Required Services

### Authentication
- Go to **Authentication** → **Get started**
- Enable **Email/Password** provider only (for v1)

### Firestore Database
- Go to **Firestore Database** → **Create database**
- You can start in **test mode** for the quickest start (30-day limit), **or** use the rules file we provide in this repo (recommended).
- Choose a location close to Sri Lanka (e.g. `asia-southeast1`)

> **No Storage needed** — you can skip the Storage setup completely.

### 2.5 Set Firestore Security Rules (Critical for production)

**The #1 cause of "Could not load your organization profile", permission errors, and blank pages after deploying to Vercel is that the strict multi-tenant rules from this repo have not been published to your Firebase project.**

The app now uses **production-grade org-scoped rules** (see `firestore.rules` in the repo root). These rules:

- Allow a new user (during register) to create their own organization (they become the owner).
- Allow a signed-in user to read/write **only** data belonging to the organization linked in their `/users/{uid}` profile document.
- Make transactions immutable (no client-side edits/deletes).
- Require every product and transaction to carry the correct `organizationId`.

**How to deploy the rules (do this for every Firebase project you point the app at):**

```bash
# One-time setup
npm install -g firebase-tools
firebase login

# From the project root (where firestore.rules lives)
firebase deploy --only firestore:rules
```

You must be logged into the Firebase CLI with an account that has permission on the target project.

After changing `firestore.rules` locally, always re-run the deploy command above (or the equivalent in CI).

You should also deploy indexes when the `firestore.indexes.json` changes (the queries for products sorted by name and transactions sorted by date require composite indexes):

```bash
firebase deploy --only firestore:indexes
```

Both commands can be combined:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

(Do this for the exact project whose config is in your Vercel environment variables / local .env.local.)

**Never** rely on the temporary "test mode" rules for anything real. They expire and give overly broad access.

The file `firebase.json` in the repo tells the Firebase CLI to use `firestore.rules` for this project.

## 3. Get Your Web App Configuration

In the Firebase Console:

1. Go to **Project settings** (gear icon) → **General** tab
2. Scroll to "Your apps" → click the web `</>` icon (or create a new web app)
3. Copy the `firebaseConfig` object.

You will paste the values into environment variables (next step). **Never commit real keys to git.**

## 4. Configure Environment Variables

1. In the project root, copy the example:
   ```bash
   cp .env.local.example .env.local
   ```

2. Open `.env.local` — it should already contain your values (I pre-filled the example with the config you provided).

Your `.env.local` should look like this (example — use your own values):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=1:...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-...

# Set to "true" ONLY for local development with emulators. Use "false" in production.
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

## 5. (Strongly Recommended) Use Firebase Emulators Locally

This keeps everything free and fast during development.

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. Initialize emulators in this folder:
   ```bash
   firebase init emulators
   ```
   Select only: **Authentication** and **Firestore** (skip Storage).

3. Start the emulators:
   ```bash
   firebase emulators:start
   ```

4. In `.env.local`, set:
   ```env
   NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
   ```

5. Restart your Next.js dev server.

## 6. Important Notes for v1

- One organization per user (simple model).
- **You must have valid Firestore rules published**, otherwise every `getDoc` / `setDoc` (register, login, loading org profile, future products/sales) will throw "Missing or insufficient permissions".
- The repo now includes `firestore.rules` + `firebase.json`. Use `firebase deploy --only firestore:rules` (or the quick console paste above).
- **Product images**: Use public image URLs only. No Firebase Storage.
- Do not put real customer data into a project until you have deployed the production Firestore rules from this repo.

## 7. After Setup + Fixing "Could not load your organization profile"

```bash
npm run dev
```

### The error banner: "Could not load your organization profile. Check Firestore security rules..."

This banner (with a recovery form) appears when:

- A signed-in Firebase Auth user exists, **but** the app cannot read a matching `/users/{your-uid}` document that points to a readable `/organizations/{id}` document.
- Most common after a Vercel deploy: you set the Firebase env vars on Vercel but **never ran `firebase deploy --only firestore:rules`** against that same project.
- The register flow only partially completed (organization created but the `users/{uid}` link doc was never written, or was deleted).
- You created the Firebase Auth user directly in the console / another tool instead of going through the app's Register page.
- Field name mismatch (the code and rules now consistently use `organizationId` on user/profile docs and `ownerUid` on the organization doc).

**Fix steps (in order):**

1. Make sure you are pointing at the correct Firebase project (check `.env.local` locally or the Vercel environment variables — `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must match).
2. From the repo root, run:
   ```bash
   firebase deploy --only firestore:rules
   ```
   (This publishes the strict org-scoped rules in `firestore.rules`.)
3. Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R). If you just signed in, try signing out and signing back in.
4. If you still see the banner, use the **"Quick recovery — create / link your organization"** form that appears directly under the banner. Enter your business legal name and click "Create my organization". This performs the same two writes the Register page does (allowed by the rules for the current signed-in UID as owner).

After a successful recovery or a clean registration you should see your business name in the top bar and be able to use Products, Sales, etc.

### "Failed to load products" / "Could not load your products" / history errors

These toasts appear when the realtime `onSnapshot` queries fail.

Common causes (now that you have an organization profile):

- **Missing composite indexes** (very common on production Firestore after adding the multi-tenant queries): The queries do `where("organizationId", "==", yourOrg) + orderBy("name")` (products) or `orderBy("createdAt")` (transactions). These require indexes defined in `firestore.indexes.json`.
  - Fix: `firebase deploy --only firestore:indexes`
  - Or, temporarily, open the browser DevTools console — the exact error usually contains a long URL like `https://console.firebase.google.com/.../indexes?create_composite=...`. Click it (while logged into the right Google account) and it creates the index in ~1-5 minutes. Then hard refresh.

- Permission denied on products/transactions: Your current user's `/users/{uid}` profile either doesn't exist, points to the wrong `organizationId`, or the rules were not deployed. Use the recovery form on any page (it appears under the red banner) or re-run the rules deploy.

- Old data: Products or transactions created before you had a proper organization profile may have the wrong (or missing) `organizationId` field. They will not appear for the current org. Just add new ones via the Products page — new ones are written with the correct scope.

After deploying rules + indexes, the Products list, Sale screen (product picker), Dashboard recent activity, and History should all populate from real Firestore data for your organization.

### Register vs direct Auth users

The only supported way to get a fully linked account today is the in-app **Register** page (or the recovery form in the banner). It creates:
- `organizations/{randomId}` with `ownerUid = yourUid`
- `users/{yourUid}` with `organizationId = the new org id`

If you add users only via Firebase Authentication (no profile doc), they will hit the banner until they (or an owner) runs the recovery flow.

---

**Production note for Vercel**

- Rules live in Firestore, not in your Next.js bundle. Changing `firestore.rules` and pushing to Vercel does **nothing** to Firebase. You must run the `firebase deploy --only firestore:rules` command (against the project whose keys are in Vercel env vars).
- Strongly recommended: use separate Firebase projects for dev/staging vs production. Rotate any keys that were exposed while the app was running an unpatched Next.js version (see earlier CVE notes).
- Set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false` (or leave it unset) for all non-local environments.

After you run the rules deploy, registration/login should succeed and the organization profile (legal name, invoice prefix, low stock threshold, etc.) will load for every page.
