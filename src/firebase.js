import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, deleteDoc } from "firebase/firestore";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDU2d7fW77TK3wj9LouEkTayzfY3TIoN3o",
  authDomain: "church-attendance-593fa.firebaseapp.com",
  projectId: "church-attendance-593fa",
  storageBucket: "church-attendance-593fa.firebasestorage.app",
  messagingSenderId: "597624016778",
  appId: "1:597624016778:web:c7e79a7adb98283a224273"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Helper: save a whole collection doc ──────────────────────────
export async function saveData(key, value) {
  try {
    await setDoc(doc(db, "churchdata", key), { value: JSON.stringify(value) });
  } catch (e) { console.error("Firebase save error", e); }
}

// ── Helper: load a doc once ───────────────────────────────────────
export async function loadData(key, fallback) {
  try {
    const snap = await getDoc(doc(db, "churchdata", key));
    if (snap.exists()) return JSON.parse(snap.data().value);
  } catch (e) { console.error("Firebase load error", e); }
  return fallback;
}

// ── Helper: listen for real-time changes ─────────────────────────
export function listenData(key, callback) {
  return onSnapshot(doc(db, "churchdata", key), (snap) => {
    if (snap.exists()) {
      try { callback(JSON.parse(snap.data().value)); } catch(e) {}
    }
  });
}

// ── Helper: delete a doc (used to clean up cross-device session data) ──
export async function deleteData(key) {
  try {
    await deleteDoc(doc(db, "churchdata", key));
  } catch (e) { console.error("Firebase delete error", e); }
}

export { db };
