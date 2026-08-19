import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED, setLogLevel, disableNetwork } from 'firebase/firestore';
import { getStorage, ref } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

// Enable persistence for better stability on refresh immediately upon Firestore initialization
enableIndexedDbPersistence(db, { forceOwnership: true })
  .then(() => console.log("Persistence enabled"))
  .catch((err) => {
      if (err.code === 'failed-precondition') {
          // Multiple tabs open, persistence can only be enabled in one tab at a time.
          console.warn("Persistence failed: multiple tabs open");
      } else if (err.code === 'unimplemented') {
          // The current browser does not support all of the features needed to enable persistence
          console.warn("Persistence not supported by browser");
      } else {
          console.warn("Persistence initialization error:", err);
      }
  });

try {
  setLogLevel('silent');
} catch (e) {}

// Centralized quota limit triggering mechanism
export function triggerQuotaExceeded() {
  if (typeof window !== 'undefined') {
    console.warn("Firestore triggerQuotaExceeded called (ignored to keep auth/session online).");
  }
}

// Ensure startup quota state is cleared and we stay online
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('firestore_quota_exceeded');
  } catch (e) {}
  (window as any).firestoreQuotaExceeded = false;
}

export const storage = getStorage(app, firebaseConfig.storageBucket);
storage.maxUploadRetryTime = 600000; // 10 minutes
storage.maxOperationRetryTime = 600000; // 10 minutes

export function isFirestoreShutdownError(error: any) {
  return error?.message?.includes('Firestore shutting down') || 
         error?.code === 'failed-precondition' && error?.message?.includes('terminate');
}

// Connectivity Test & Recovery
export async function testConnection() {
  if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
    try {
      setLogLevel('silent');
    } catch (e) {}
    return true;
  }

  try {
    // 1. First check navigator
    if (!navigator.onLine) return false;

    // 2. Fast fetch check (avoiding heavy Firestore if possible)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      await fetch('https://www.google.com/favicon.ico', { 
        mode: 'no-cors', 
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);
    } catch (e) {
      clearTimeout(timeoutId);
      // If fetch fails, we still try Firestore as a fallback 
      // because CORS/Network might block specific domains
    }

    // 3. Reliable Firestore check
    const docRef = doc(db, '_internal', 'connectivity_ping');
    await getDocFromServer(docRef);
    return true;
  } catch (error: any) {
    if (isFirestoreShutdownError(error)) return false;
    
    const isQuota = error?.code === 'resource-exhausted' || 
                    error?.message?.toLowerCase().includes('quota') || 
                    error?.message?.toLowerCase().includes('exceeded') ||
                    error?.message?.toLowerCase().includes('exhausted');

    if (isQuota) {
      triggerQuotaExceeded();
      return true; // Server is reached, it's just the quota limit
    }

    // These codes imply the server was definitely reached
    const reachedCodes = ['not-found', 'permission-denied', 'unauthenticated', 'invalid-argument'];
    if (reachedCodes.includes(error.code)) return true;
    
    // Explicit network failure codes
    const failureCodes = ['unavailable', 'deadline-exceeded', 'aborted'];
    if (failureCodes.includes(error.code) || error.message?.toLowerCase().includes('offline') || error.message?.toLowerCase().includes('network')) {
      return false;
    }
    
    return false;
  }
}

export async function forceReconnect() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('firestore_quota_exceeded');
    (window as any).firestoreQuotaExceeded = undefined;
  }
  const { terminate, enableNetwork } = await import('firebase/firestore');
  try {
    await enableNetwork(db).catch(() => {});
    await terminate(db);
    window.location.reload(); 
  } catch (e) {
    window.location.reload();
  }
}

export async function clearAppCache() {
  const { terminate, clearIndexedDbPersistence } = await import('firebase/firestore');
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    console.log("Firestore cache cleared");
    window.localStorage.clear(); // Also clear local storage
    alert("Cache cleared successfully. App will restart.");
    window.location.reload();
  } catch (e: any) {
    console.error("Cache clear failed:", e);
    alert(`Cache clear failed: ${e.message}`);
    window.location.reload();
  }
}

testConnection();
