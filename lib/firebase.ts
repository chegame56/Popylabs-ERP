import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, enableIndexedDbPersistence } from "firebase/firestore";
// Storage is initialized (part of the Firebase config) but we deliberately avoid using it
// for product images to prevent any storage costs. Product photos will use public image URLs only.
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Fill these from .env.local (copy from .env.local.example)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize only once
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Enable offline persistence for power-cut / flaky internet resilience (PWA + Sri Lanka use case).
// This is safe in production. It uses IndexedDB.
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      // Multiple tabs open — persistence can only be enabled in one tab at a time.
      console.warn("Firestore persistence disabled (multiple tabs open)");
    } else if (err.code === "unimplemented") {
      console.warn("Firestore persistence not supported in this browser");
    }
  });
}

// Emulator support (great for local development)
const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

if (useEmulators && typeof window !== "undefined") {
  console.log("🔥 Using Firebase Emulators");

  // Auth emulator
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

  // Firestore emulator
  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  // Storage emulator - only needed if you decide to use Storage in the future.
  // For now we are NOT using Storage for product images (cost control).
  // connectStorageEmulator(storage, "127.0.0.1", 9199);
}

export default app;
