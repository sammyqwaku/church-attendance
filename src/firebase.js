import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, deleteDoc } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// ── Firebase configuration ────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDU2d7fW77TK3wj9LouEkTayzfY3TIoN3o",
  authDomain: "church-attendance-593fa.firebaseapp.com",
  projectId: "church-attendance-593fa",
  storageBucket: "church-attendance-593fa.firebasestorage.app",
  messagingSenderId: "597624016778",
  appId: "1:597624016778:web:c7e79a7adb98283a224273"
};

// ── Initialize Firebase ───────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── FIREBASE ANONYMOUS AUTH ───────────────────────────────────
// Signs the app in silently so Firestore security rules can
// require request.auth != null — blocking browser console attacks.
// Completely free, invisible to users, persists across refreshes.
let authResolved = false;
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      authResolved = true;
      resolve(user);
    } else {
      signInAnonymously(auth)
        .then((cred) => { authResolved = true; resolve(cred.user); })
        .catch((err)  => { console.error("Firebase auth error:", err); resolve(null); });
    }
  });
});

async function waitAuth() {
  if (authResolved) return;
  await authReady;
}

// ── Save a document to Firestore ──────────────────────────────
export async function saveData(key, value) {
  try {
    await waitAuth();
    await setDoc(doc(db, "churchdata", key), { value: JSON.stringify(value) });
  } catch (e) { console.error("Firebase save error", e); }
}

// ── Load a document once ──────────────────────────────────────
export async function loadData(key, fallback) {
  try {
    await waitAuth();
    const snap = await getDoc(doc(db, "churchdata", key));
    if (snap.exists()) return JSON.parse(snap.data().value);
  } catch (e) { console.error("Firebase load error", e); }
  return fallback;
}

// ── Listen for real-time changes ──────────────────────────────
export function listenData(key, callback) {
  return onSnapshot(doc(db, "churchdata", key), (snap) => {
    if (snap.exists()) {
      try { callback(JSON.parse(snap.data().value)); } catch(e) {}
    }
  });
}

// ── Delete a document ─────────────────────────────────────────
export async function deleteData(key) {
  try {
    await waitAuth();
    await deleteDoc(doc(db, "churchdata", key));
  } catch (e) { console.error("Firebase delete error", e); }
}

export { db, auth };
