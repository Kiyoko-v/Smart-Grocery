/**
 * Firebase Integration Module for Smart Grocery & Budget Safety Tracker
 * Target Document: users/venetta
 * User Profile: Venetta (venetta@mutiarabangsa.sch.id)
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// Konfigurasi Firebase Project smart-grocery-3275a (Venetta)
export const firebaseConfig = {
  apiKey: "AIzaSyBySM83lF3ji0G7Fj24k3HrY20tUm0Cd-I",
  authDomain: "smart-grocery-3275a.firebaseapp.com",
  projectId: "smart-grocery-3275a",
  storageBucket: "smart-grocery-3275a.firebasestorage.app",
  messagingSenderId: "43639542008",
  appId: "1:43639542008:web:432661ee92d332f68e6b0d"
};

// Cek apakah konfigurasi masih berupa placeholder atau sudah memiliki API Key asli
export const isConfigPlaceholder = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("...");

let app = null;
let firestoreDb = null;
let isInitialized = false;

export const USER_DOC_ID = "venetta";
export const USER_PROFILE = {
  name: "Venetta",
  email: "venetta@mutiarabangsa.sch.id",
  role: "Siswa Rantau",
  appName: "Smart Grocery & Budget Safety Tracker"
};

// Inisialisasi Firebase jika bukan placeholder
if (!isConfigPlaceholder) {
  try {
    app = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(app);
    isInitialized = true;
    console.log("Firebase initialized successfully for user:", USER_DOC_ID);
  } catch (err) {
    console.warn("Notice inisialisasi Firebase:", err);
  }
} else {
  console.info("Firebase: Berjalan dalam mode Local-First (Placeholder Config). Ganti API Key di src/firebase.js untuk sinkronisasi cloud penuh.");
}

/**
 * Status koneksi Firebase
 */
export function getFirebaseStatus() {
  if (isConfigPlaceholder) {
    return {
      connected: false,
      isPlaceholder: true,
      label: 'Lokal (venetta)',
      badgeClass: 'badge-offline',
      message: 'Mode Local-First aktif. Masukkan API Key Firebase asli untuk cloud realtime.'
    };
  }
  return {
    connected: isInitialized,
    isPlaceholder: false,
    label: 'Cloud: venetta',
    badgeClass: 'badge-online',
    message: `Terhubung ke Firestore doc: users/${USER_DOC_ID}`
  };
}

/**
 * Simpan data lengkap ke dokumen 'users/venetta' di Cloud Firestore
 */
export async function syncUserDataToFirestore({ cart, budgetLimit, history }) {
  if (!firestoreDb || isConfigPlaceholder) return false;

  try {
    const userDocRef = doc(firestoreDb, "users", USER_DOC_ID);
    await setDoc(userDocRef, {
      profile: USER_PROFILE,
      budgetLimit: Number(budgetLimit) || 750000,
      cart: cart || [],
      history: history || [],
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    console.log(`[Firebase] Data berhasil disinkronkan ke users/${USER_DOC_ID}`);
    return true;
  } catch (err) {
    console.warn("[Firebase] Gagal sinkron ke Firestore (tetap aman di LocalStorage):", err);
    return false;
  }
}

/**
 * Muat data dari dokumen 'users/venetta' di Cloud Firestore
 */
export async function fetchUserDataFromFirestore() {
  if (!firestoreDb || isConfigPlaceholder) return null;

  try {
    const userDocRef = doc(firestoreDb, "users", USER_DOC_ID);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.warn("[Firebase] Gagal membaca data Firestore:", err);
  }
  return null;
}

/**
 * Berlangganan (Realtime Listen) ke dokumen 'users/venetta'
 */
export function listenToUserData(onDataChange) {
  if (!firestoreDb || isConfigPlaceholder) return () => {};

  try {
    const userDocRef = doc(firestoreDb, "users", USER_DOC_ID);
    return onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists() && typeof onDataChange === 'function') {
        onDataChange(docSnap.data());
      }
    }, (error) => {
      console.warn("[Firebase] Listener error:", error);
    });
  } catch (err) {
    return () => {};
  }
}
