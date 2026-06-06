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

### 2.5 Set Firestore Security Rules (Fix for "Missing or insufficient permissions")

This is the #1 reason you see:

> FirebaseError: Missing or insufficient permissions.

**Fastest fix right now (30 seconds):**

1. Open [Firebase Console](https://console.firebase.google.com/) → your project `popylabs-erp-dev`
2. Go to **Firestore Database** → **Rules** tab
3. Replace everything with this (permissive dev rules, no 30-day expiry):

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

4. Click **Publish**.

This lets any logged-in user read/write while you build on the dev project.

**Proper way (recommended — rules live in git):**

We have added `firestore.rules` + `firebase.json` to the project.

Run these commands (one time):

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
```

**Important:** `firebase init firestore` will offer to overwrite `firestore.rules` and `firestore.indexes.json`. Accept, **then immediately redeploy** the dev rules we actually want (see the redeploy command below).

After init (or any time you edit rules):

```bash
firebase deploy --only firestore:rules
```

This pushes the local `firestore.rules` (the non-expiring dev version) to your Firestore project.

Later (before real customers or going live) we will replace the broad "any authenticated user" rule with proper per-organization rules so that a user can only access their own organization's data.

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

## 7. After Setup + Fixing Permissions Error

```bash
npm run dev
```

If you see `FirebaseError: Missing or insufficient permissions` in the console:

1. Run this from your project folder:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Or, as a quick console fallback: Firebase Console → Firestore → **Rules** tab → paste the permissive rule from section 2.5 → **Publish**
3. Hard refresh the browser (or restart `npm run dev`).

After that you should be able to:

- Register a new business (Auth user + `organizations` + `users` docs created)
- Log in (the auth context reads your profile + org)
- See your real business name in the top bar

Next steps we will build:
- Products stored in Firestore (with optional image URL)
- Real sales that save to Firestore
- Cross-device scanner using active carts + realtime
- Proper IRD-compliant invoices using your organization data

---

**Your Firebase project is ready** (`popylabs-erp-dev`).

After you successfully run `firebase deploy --only firestore:rules`, registration and login should work without permission errors, and your real business name will appear in the top bar.

Just make sure `.env.local` has the correct values and restart the dev server if you changed it.
