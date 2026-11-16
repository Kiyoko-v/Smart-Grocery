/**
 * Firebase Integration Module for Smart Grocery & Budget Safety Tracker
 * Supports Multi-User authentication & cloud sync under 'users/{userId}'
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

// Inisialisasi Firebase jika bukan placeholder
if (!isConfigPlaceholder) {
  try {
    app = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(app);
    isInitialized = true;
    console.log("Firebase initialized successfully");
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
      label: 'Lokal',
      badgeClass: 'badge-offline',
      message: 'Mode Local-First aktif. Tersimpan di penyimpanan perangkat.'
    };
  }
  return {
    connected: isInitialized,
    isPlaceholder: false,
    label: 'Cloud Aktif',
    badgeClass: 'badge-online',
    message: 'Terhubung ke sinkronisasi Cloud Firestore realtime.'
  };
}

/**
 * Simpan data lengkap ke dokumen 'users/{userId}' di Cloud Firestore
 */
export async function syncUserDataToFirestore({ userId = 'venetta', profile, cart, budgetLimit, history, preferences, favorites }) {
  if (!firestoreDb || isConfigPlaceholder) return false;

  try {
    const docId = String(userId || 'venetta').replace(/[/]/g, '_');
    const userDocRef = doc(firestoreDb, "users", docId);
    await setDoc(userDocRef, {
      profile: profile || null,
      budgetLimit: Number(budgetLimit) || 750000,
      cart: cart || [],
      history: history || [],
      preferences: preferences || {},
      favorites: favorites || [],
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    console.log(`[Firebase] Data berhasil disinkronkan ke users/${docId}`);
    return true;
  } catch (err) {
    console.warn("[Firebase] Gagal sinkron ke Firestore (tetap aman di LocalStorage):", err);
    return false;
  }
}

/**
 * Muat data dari dokumen 'users/{userId}' di Cloud Firestore
 */
export async function fetchUserDataFromFirestore(userId = 'venetta') {
  if (!firestoreDb || isConfigPlaceholder) return null;

  try {
    const docId = String(userId || 'venetta').replace(/[/]/g, '_');
    const userDocRef = doc(firestoreDb, "users", docId);
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
 * Berlangganan (Realtime Listen) ke dokumen 'users/{userId}'
 */
export function listenToUserData(userId = 'venetta', onDataChange) {
  if (!firestoreDb || isConfigPlaceholder) return () => {};

  try {
    const docId = String(userId || 'venetta').replace(/[/]/g, '_');
    const userDocRef = doc(firestoreDb, "users", docId);
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
