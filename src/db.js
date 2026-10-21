/**
 * Database & Storage Module (F-06)
 * Handles LocalStorage persistence, past month shopping sessions, initial seed data,
 * and Cloud Firestore synchronization with document 'users/venetta'.
 */

import {
  syncUserDataToFirestore,
  fetchUserDataFromFirestore,
  listenToUserData,
  USER_PROFILE,
  USER_DOC_ID
} from './firebase.js';

const KEYS = {
  CART: 'smart_grocery_cart_items_v3',
  BUDGET: 'smart_grocery_budget_limit_v3',
  HISTORY: 'smart_grocery_history_sessions_v3',
  SETTINGS: 'smart_grocery_user_settings_v3'
};

// Baseline reference data from previous month (Desember 2026) for out-of-town students (Rian)
const DEFAULT_PREVIOUS_MONTH_DATA = [
  { id: 'ref-1', name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', price: 72000, lastUpdated: '2026-12-08' },
  { id: 'ref-2', name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', price: 35000, lastUpdated: '2026-12-08' },
  { id: 'ref-3', name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', price: 28000, lastUpdated: '2026-12-08' },
  { id: 'ref-4', name: 'Indomie Goreng (Pack isi 5)', category: 'Sembako', unit: 'pack', price: 15500, lastUpdated: '2026-12-08' },
  { id: 'ref-5', name: 'Sabun Cuci Piring Mama Lemon 750ml', category: 'Dapur & Bumbu', unit: 'pack', price: 13500, lastUpdated: '2026-12-08' },
  { id: 'ref-6', name: 'Biore Body Wash 450ml', category: 'Toiletries', unit: 'pack', price: 34000, lastUpdated: '2026-12-08' },
  { id: 'ref-7', name: 'Shampoo Pantene 160ml', category: 'Toiletries', unit: 'botol', price: 27000, lastUpdated: '2026-12-08' },
  { id: 'ref-8', name: 'Pasta Gigi Pepsodent 190g', category: 'Toiletries', unit: 'pcs', price: 14000, lastUpdated: '2026-12-08' },
  { id: 'ref-9', name: 'Susu UHT Ultra Milk 1L', category: 'Minuman', unit: 'dus', price: 20000, lastUpdated: '2026-12-08' },
  { id: 'ref-10', name: 'Deterjen Rinso 770g', category: 'Toiletries', unit: 'pack', price: 22500, lastUpdated: '2026-12-08' },
  { id: 'ref-11', name: 'Kecap Manis Bango 520ml', category: 'Dapur & Bumbu', unit: 'pack', price: 25000, lastUpdated: '2026-12-08' },
  { id: 'ref-12', name: 'Kopi Kapal Api Special Mix 10s', category: 'Minuman', unit: 'bungkus', price: 14500, lastUpdated: '2026-12-08' },
  { id: 'ref-13', name: 'Nugget Fiesta 500g', category: 'Frozen & Segar', unit: 'pack', price: 47000, lastUpdated: '2026-12-08' },
  { id: 'ref-14', name: 'Air Mineral Galon Aqua 19L', category: 'Minuman', unit: 'galon', price: 22000, lastUpdated: '2026-12-08' },
  { id: 'ref-15', name: 'Sarden ABC Saus Tomat 425g', category: 'Sembako', unit: 'kaleng', price: 25500, lastUpdated: '2026-12-08' },
  { id: 'ref-16', name: 'Roti Tawar Kupas Sari Roti', category: 'Sembako', unit: 'pack', price: 17000, lastUpdated: '2026-12-08' },
  { id: 'ref-17', name: 'Biskuit Roma Kelapa 300g', category: 'Camilan', unit: 'pack', price: 11500, lastUpdated: '2026-12-08' }
];

// F-06 Historical Shopping Sessions for Juli, Agustus, and Desember 2026
const DEFAULT_HISTORY_SESSIONS = [
  {
    id: 'session-dec-2026',
    title: 'Belanja Persiapan Akhir Tahun - Desember 2026',
    date: '2026-12-08T15:30:00Z',
    monthLabel: 'Desember 2026',
    budgetLimit: 800000,
    totalSpent: 713600,
    totalSavings: 34000,
    itemsCount: 16,
    items: [
      { id: 'hd-1', name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', qty: 1, price: 72000, discount: { type: 'none' } },
      { id: 'hd-2', name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', qty: 1, price: 35000, discount: { type: 'none' } },
      { id: 'hd-3', name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', qty: 2, price: 28000, discount: { type: 'none' } },
      { id: 'hd-4', name: 'Indomie Goreng (Pack isi 5)', category: 'Sembako', unit: 'pack', qty: 4, price: 15500, discount: { type: 'none' } },
      { id: 'hd-5', name: 'Biore Body Wash 450ml', category: 'Toiletries', unit: 'pack', qty: 1, price: 34000, discount: { type: 'percent', percent: 10 } },
      { id: 'hd-6', name: 'Sabun Cuci Piring Mama Lemon 750ml', category: 'Dapur & Bumbu', unit: 'pack', qty: 1, price: 13500, discount: { type: 'none' } },
      { id: 'hd-7', name: 'Deterjen Rinso 770g', category: 'Toiletries', unit: 'pack', qty: 1, price: 22500, discount: { type: 'none' } },
      { id: 'hd-8', name: 'Pasta Gigi Pepsodent 190g', category: 'Toiletries', unit: 'pcs', qty: 2, price: 14000, discount: { type: 'none' } },
      { id: 'hd-9', name: 'Susu UHT Ultra Milk 1L', category: 'Minuman', unit: 'dus', qty: 4, price: 20000, discount: { type: 'none' } },
      { id: 'hd-10', name: 'Kecap Manis Bango 520ml', category: 'Dapur & Bumbu', unit: 'pack', qty: 1, price: 25000, discount: { type: 'none' } },
      { id: 'hd-11', name: 'Kopi Kapal Api Special Mix 10s', category: 'Minuman', unit: 'bungkus', qty: 2, price: 14500, discount: { type: 'none' } },
      { id: 'hd-12', name: 'Nugget Fiesta 500g', category: 'Frozen & Segar', unit: 'pack', qty: 2, price: 47000, discount: { type: 'nominal', nominal: 6000 } },
      { id: 'hd-13', name: 'Shampoo Pantene 160ml', category: 'Toiletries', unit: 'botol', qty: 1, price: 27000, discount: { type: 'none' } },
      { id: 'hd-14', name: 'Air Mineral Galon Aqua 19L', category: 'Minuman', unit: 'galon', qty: 3, price: 22000, discount: { type: 'none' } },
      { id: 'hd-15', name: 'Sarden ABC Saus Tomat 425g', category: 'Sembako', unit: 'kaleng', qty: 2, price: 25500, discount: { type: 'none' } },
      { id: 'hd-16', name: 'Roti Tawar Kupas Sari Roti', category: 'Sembako', unit: 'pack', qty: 2, price: 17000, discount: { type: 'none' } }
    ]
  },
  {
    id: 'session-aug-2026',
    title: 'Belanja Awal Semester - Agustus 2026',
    date: '2026-08-08T11:15:00Z',
    monthLabel: 'Agustus 2026',
    budgetLimit: 800000,
    totalSpent: 717250,
    totalSavings: 36250,
    itemsCount: 16,
    items: [
      { id: 'ha-1', name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', qty: 1, price: 70000, discount: { type: 'none' } },
      { id: 'ha-2', name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', qty: 1, price: 33500, discount: { type: 'none' } },
      { id: 'ha-3', name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', qty: 2, price: 27500, discount: { type: 'none' } },
      { id: 'ha-4', name: 'Indomie Goreng (Pack isi 5)', category: 'Sembako', unit: 'pack', qty: 4, price: 15500, discount: { type: 'none' } },
      { id: 'ha-5', name: 'Biore Body Wash 450ml', category: 'Toiletries', unit: 'pack', qty: 2, price: 27500, discount: { type: 'percent', percent: 15 } },
      { id: 'ha-6', name: 'Sabun Cuci Piring Mama Lemon 750ml', category: 'Dapur & Bumbu', unit: 'pack', qty: 1, price: 13000, discount: { type: 'none' } },
      { id: 'ha-7', name: 'Deterjen Rinso 770g', category: 'Toiletries', unit: 'pack', qty: 1, price: 22000, discount: { type: 'none' } },
      { id: 'ha-8', name: 'Pasta Gigi Pepsodent 190g', category: 'Toiletries', unit: 'pcs', qty: 2, price: 14000, discount: { type: 'none' } },
      { id: 'ha-9', name: 'Susu UHT Ultra Milk 1L', category: 'Minuman', unit: 'dus', qty: 4, price: 19000, discount: { type: 'none' } },
      { id: 'ha-10', name: 'Kecap Manis Bango 520ml', category: 'Dapur & Bumbu', unit: 'pack', qty: 1, price: 24500, discount: { type: 'none' } },
      { id: 'ha-11', name: 'Kopi Kapal Api Special Mix 10s', category: 'Minuman', unit: 'bungkus', qty: 2, price: 14500, discount: { type: 'none' } },
      { id: 'ha-12', name: 'Nugget Fiesta 500g', category: 'Frozen & Segar', unit: 'pack', qty: 2, price: 46000, discount: { type: 'nominal', nominal: 5000 } },
      { id: 'ha-13', name: 'Shampoo Pantene 160ml', category: 'Toiletries', unit: 'botol', qty: 1, price: 26500, discount: { type: 'none' } },
      { id: 'ha-14', name: 'Air Mineral Galon Aqua 19L', category: 'Minuman', unit: 'galon', qty: 3, price: 21500, discount: { type: 'none' } },
      { id: 'ha-15', name: 'Sarden ABC Saus Tomat 425g', category: 'Sembako', unit: 'kaleng', qty: 2, price: 25000, discount: { type: 'none' } },
      { id: 'ha-16', name: 'Biskuit Roma Kelapa 300g', category: 'Camilan', unit: 'pack', qty: 3, price: 11500, discount: { type: 'none' } }
    ]
  },
  {
    id: 'session-jul-2026',
    title: 'Belanja Awal Masuk Kos - Juli 2026',
    date: '2026-07-06T10:30:00Z',
    monthLabel: 'Juli 2026',
    budgetLimit: 750000,
    totalSpent: 697000,
    totalSavings: 25000,
    itemsCount: 17,
    items: [
      { id: 'hj-1', name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', qty: 1, price: 68000, discount: { type: 'none' } },
      { id: 'hj-2', name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', qty: 1, price: 32000, discount: { type: 'none' } },
      { id: 'hj-3', name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', qty: 2, price: 26000, discount: { type: 'none' } },
      { id: 'hj-4', name: 'Indomie Goreng (Pack isi 5)', category: 'Sembako', unit: 'pack', qty: 4, price: 15500, discount: { type: 'none' } },
      { id: 'hj-5', name: 'Biore Body Wash 450ml', category: 'Toiletries', unit: 'pack', qty: 1, price: 26000, discount: { type: 'none' } },
      { id: 'hj-6', name: 'Sabun Cuci Piring Mama Lemon 750ml', category: 'Dapur & Bumbu', unit: 'pack', qty: 1, price: 12500, discount: { type: 'none' } },
      { id: 'hj-7', name: 'Deterjen Rinso 770g', category: 'Toiletries', unit: 'pack', qty: 1, price: 21000, discount: { type: 'none' } },
      { id: 'hj-8', name: 'Pasta Gigi Pepsodent 190g', category: 'Toiletries', unit: 'pcs', qty: 1, price: 13500, discount: { type: 'none' } },
      { id: 'hj-9', name: 'Susu UHT Ultra Milk 1L', category: 'Minuman', unit: 'dus', qty: 4, price: 18500, discount: { type: 'none' } },
      { id: 'hj-10', name: 'Kecap Manis Bango 520ml', category: 'Dapur & Bumbu', unit: 'pack', qty: 1, price: 24000, discount: { type: 'none' } },
      { id: 'hj-11', name: 'Kopi Kapal Api Special Mix 10s', category: 'Minuman', unit: 'bungkus', qty: 2, price: 14000, discount: { type: 'none' } },
      { id: 'hj-12', name: 'Nugget Fiesta 500g', category: 'Frozen & Segar', unit: 'pack', qty: 2, price: 45000, discount: { type: 'percent', percent: 10 } },
      { id: 'hj-13', name: 'Shampoo Pantene 160ml', category: 'Toiletries', unit: 'botol', qty: 1, price: 26000, discount: { type: 'none' } },
      { id: 'hj-14', name: 'Roti Tawar Kupas Sari Roti', category: 'Sembako', unit: 'pack', qty: 2, price: 16000, discount: { type: 'none' } },
      { id: 'hj-15', name: 'Biskuit Roma Kelapa 300g', category: 'Camilan', unit: 'pack', qty: 3, price: 11000, discount: { type: 'none' } },
      { id: 'hj-16', name: 'Air Mineral Galon Aqua 19L', category: 'Minuman', unit: 'galon', qty: 3, price: 21000, discount: { type: 'none' } },
      { id: 'hj-17', name: 'Sarden ABC Saus Tomat 425g', category: 'Sembako', unit: 'kaleng', qty: 2, price: 24500, discount: { type: 'none' } }
    ]
  }
];

// Initial demo cart for live testing: Directly tests F-01 to F-05 based on Rian's case study
const DEFAULT_INITIAL_CART = [
  {
    id: 'cart-1',
    name: 'Beras Sania 5kg',
    category: 'Sembako',
    unit: 'pack',
    qty: 1,
    price: 78000,
    discount: { type: 'none' },
    checked: true,
    note: 'Stok sebulan anak rantau (Naik vs Des Rp 72rb)'
  },
  {
    id: 'cart-2',
    name: 'Biore Body Wash 450ml',
    category: 'Toiletries',
    unit: 'pack',
    qty: 2,
    price: 32000,
    discount: { type: 'stacked', tier1: 50, tier2: 20 },
    checked: true,
    note: 'Promo Cuci Gudang 50%+20% Rian (Hemat Rp 38.400)'
  },
  {
    id: 'cart-3',
    name: 'Minyak Goreng 2L',
    category: 'Sembako',
    unit: 'liter',
    qty: 1,
    price: 35000,
    discount: { type: 'nominal', nominal: 15000 },
    checked: true,
    note: 'Promo kupon kasir pot. langsung Rp 15.000'
  },
  {
    id: 'cart-4',
    name: 'Indomie Goreng (Pack isi 5)',
    category: 'Sembako',
    unit: 'pack',
    qty: 3,
    price: 15500,
    discount: { type: 'none' },
    checked: true,
    note: 'Makanan darurat tanggal tua (Harga stabil)'
  },
  {
    id: 'cart-5',
    name: 'Susu UHT Ultra Milk 1L',
    category: 'Minuman',
    unit: 'dus',
    qty: 2,
    price: 18000,
    discount: { type: 'percent', percent: 10 },
    checked: false,
    note: 'Diskon 10% mingguan anak kos (Turun vs Des)'
  },
  {
    id: 'cart-6',
    name: 'Telur Ayam 1kg',
    category: 'Sembako',
    unit: 'kg',
    qty: 2,
    price: 28000,
    discount: { type: 'none' },
    checked: true,
    note: 'Protein harian kos (Harga stabil vs Des)'
  },
  {
    id: 'cart-7',
    name: 'Sabun Pembersih Lantai Wipol 750ml',
    category: 'Toiletries',
    unit: 'pack',
    qty: 1,
    price: 16500,
    discount: { type: 'none' },
    checked: false,
    note: 'Item baru kebersihan kos Rian (Belum ada di riwayat)'
  }
];

export const DB = {
  getUserProfile() {
    return USER_PROFILE;
  },

  getUserDocId() {
    return USER_DOC_ID;
  },

  // Get active cart items
  getCartItems() {
    const raw = localStorage.getItem(KEYS.CART);
    if (!raw) {
      localStorage.setItem(KEYS.CART, JSON.stringify(DEFAULT_INITIAL_CART));
      return DEFAULT_INITIAL_CART;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return DEFAULT_INITIAL_CART;
    }
  },

  saveCartItems(items) {
    localStorage.setItem(KEYS.CART, JSON.stringify(items));
    // Trigger background sync to Firestore users/venetta
    this.triggerCloudSync();
  },

  // Get budget limit (Safety Cap - F-05)
  getBudgetLimit() {
    const raw = localStorage.getItem(KEYS.BUDGET);
    if (!raw) {
      const defaultBudget = 750000;
      localStorage.setItem(KEYS.BUDGET, defaultBudget.toString());
      return defaultBudget;
    }
    return Number(raw) || 750000;
  },

  saveBudgetLimit(amount) {
    const valid = Math.max(0, Number(amount) || 0);
    localStorage.setItem(KEYS.BUDGET, valid.toString());
    // Trigger background sync to Firestore users/venetta
    this.triggerCloudSync();
    return valid;
  },

  // Get past shopping history sessions (F-06)
  getHistorySessions() {
    const raw = localStorage.getItem(KEYS.HISTORY);
    if (!raw) {
      localStorage.setItem(KEYS.HISTORY, JSON.stringify(DEFAULT_HISTORY_SESSIONS));
      return DEFAULT_HISTORY_SESSIONS;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return DEFAULT_HISTORY_SESSIONS;
    }
  },

  saveHistorySessions(sessions) {
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(sessions));
    // Trigger background sync to Firestore users/venetta
    this.triggerCloudSync();
  },

  /**
   * Save completed shopping session into History & update price baseline
   */
  checkoutCartSession({ title, budgetLimit, items, summary }) {
    const history = this.getHistorySessions();
    const now = new Date();
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const monthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    const newSession = {
      id: 'session-' + Date.now(),
      title: title || `Belanja ${monthLabel}`,
      date: now.toISOString(),
      monthLabel,
      budgetLimit,
      totalSpent: summary.totalSpent,
      totalSavings: summary.totalSavings,
      itemsCount: summary.totalItemsCount,
      items: items.map(item => ({ ...item }))
    };

    history.unshift(newSession);
    this.saveHistorySessions(history);

    // Clear active cart
    this.saveCartItems([]);

    return newSession;
  },

  /**
   * Aggregate past items into a reference lookup array for F-04 comparator
   */
  getComparativeHistoryItems() {
    const history = this.getHistorySessions();
    const map = new Map();

    // First load seed data as base
    DEFAULT_PREVIOUS_MONTH_DATA.forEach(item => {
      map.set(item.name.toLowerCase().trim(), item);
    });

    // Overwrite with actual saved sessions
    const reversedHistory = [...history].reverse();
    reversedHistory.forEach(session => {
      if (Array.isArray(session.items)) {
        session.items.forEach(item => {
          map.set(item.name.toLowerCase().trim(), {
            id: item.id,
            name: item.name,
            category: item.category,
            unit: item.unit,
            price: item.price,
            lastSessionDate: session.date,
            lastSessionTitle: session.title
          });
        });
      }
    });

    return Array.from(map.values());
  },

  /**
   * Background cloud synchronization to doc users/venetta
   */
  triggerCloudSync() {
    const cart = this.getCartItems();
    const budgetLimit = this.getBudgetLimit();
    const history = this.getHistorySessions();

    syncUserDataToFirestore({ cart, budgetLimit, history });
  },

  /**
   * Load remote data from Firestore doc users/venetta if available
   */
  async initCloudSync(onSyncComplete) {
    const remoteData = await fetchUserDataFromFirestore();
    if (remoteData) {
      if (Array.isArray(remoteData.cart)) {
        localStorage.setItem(KEYS.CART, JSON.stringify(remoteData.cart));
      }
      if (remoteData.budgetLimit) {
        localStorage.setItem(KEYS.BUDGET, String(remoteData.budgetLimit));
      }
      if (Array.isArray(remoteData.history)) {
        localStorage.setItem(KEYS.HISTORY, JSON.stringify(remoteData.history));
      }
      if (typeof onSyncComplete === 'function') {
        onSyncComplete(remoteData);
      }
    }

    // Subscribe to live changes
    listenToUserData((liveData) => {
      if (liveData && typeof onSyncComplete === 'function') {
        onSyncComplete(liveData);
      }
    });
  },

  resetAllData() {
    localStorage.removeItem(KEYS.CART);
    localStorage.removeItem(KEYS.BUDGET);
    localStorage.removeItem(KEYS.HISTORY);
    this.triggerCloudSync();
    return {
      cart: this.getCartItems(),
      budget: this.getBudgetLimit(),
      history: this.getHistorySessions()
    };
  }
};
