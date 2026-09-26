"use client";

// Firebase web SDK. The config comes from NEXT_PUBLIC_FIREBASE_* in the root .env
// (next.config.mjs loads it). These values are public by design; security comes from
// Firebase Auth rules and the API verifying ID tokens, not from hiding them.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Each key must be referenced literally so Next can inline it into the client bundle.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** False when the env isn't filled in: the app then runs exactly as before, without sign-in. */
export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

let app: FirebaseApp | null = null;

function firebaseApp(): FirebaseApp {
  if (!firebaseEnabled) throw new Error("Firebase isn't configured");
  app ??= getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

/** Analytics only where the browser supports it; never blocks or breaks the page. */
export async function startAnalytics(): Promise<void> {
  if (!firebaseEnabled || !config.measurementId || typeof window === "undefined") return;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) getAnalytics(firebaseApp());
  } catch {
    // Offline demo or blocked by an extension: analytics is optional.
  }
}
