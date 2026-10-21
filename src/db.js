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
  CART: 'smart_grocery_cart_items_v2',
  BUDGET: 'smart_grocery_budget_limit_v2',
  HISTORY: 'smart_grocery_history_sessions_v2',
  SETTINGS: 'smart_grocery_user_settings_v2'
};

// Seed baseline from previous month (September 2026) for out-of-town students
const DEFAULT_PREVIOUS_MONTH_DATA = [
  { id: 'ref-1', name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', price: 72000, lastUpdated: '2026-09-05' },
  { id: 'ref-2', name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', price: 34000, lastUpdated: '2026-09-05' },
  { id: 'ref-3', name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', price: 28000, lastUpdated: '2026-09-05' },
  { id: 'ref-4', name: 'Indomie Goreng (Pack isi 5)', category: 'Sembako', unit: 'pack', price: 15500, lastUpdated: '2026-09-05' },
  { id: 'ref-5', name: 'Sabun Cuci Piring Mama Lemon 750ml', category: 'Dapur & Bumbu', unit: 'pack', price: 13000, lastUpdated: '2026-09-05' },
  { id: 'ref-6', name: 'Biore Body Wash 450ml', category: 'Toiletries', unit: 'pack', price: 24500, lastUpdated: '2026-09-05' },
  { id: 'ref-7', name: 'Shampoo Pantene 160ml', category: 'Toiletries', unit: 'botol', price: 27000, lastUpdated: '2026-09-05' },
  { id: 'ref-8', name: 'Pasta Gigi Pepsodent 190g', category: 'Toiletries', unit: 'pcs', price: 14000, lastUpdated: '2026-09-05' },
  { id: 'ref-9', name: 'Susu UHT Ultra Milk 1L', category: 'Minuman', unit: 'dus', price: 19500, lastUpdated: '2026-09-05' },
  { id: 'ref-10', name: 'Deterjen Rinso 770g', category: 'Toiletries', unit: 'pack', price: 22000, lastUpdated: '2026-09-05' },
  { id: 'ref-11', name: 'Kecap Manis Bango 520ml', category: 'Dapur & Bumbu', unit: 'pack', price: 25000, lastUpdated: '2026-09-05' },
  { id: 'ref-12', name: 'Kopi Kapal Api Special Mix 10s', category: 'Minuman', unit: 'bungkus', price: 14500, lastUpdated: '2026-09-05' },
  { id: 'ref-13', name: 'Nugget Fiesta 500g', category: 'Frozen & Segar', unit: 'pack', price: 46000, lastUpdated: '2026-09-05' }
];

const DEFAULT_HISTORY_SESSIONS = [
  {
    id: 'session-sep-2026',
    title: 'Belanja Bulanan Kos - September 2026',
    date: '2026-09-05T14:30:00Z',
    monthLabel: 'September 2026',
    budgetLimit: 750000,
    totalSpent: 684500,
    totalSavings: 42000,
    itemsCount: 16,
    items: [
      { id: 'h-1', name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', qty: 1, price: 72000, discount: { type: 'none' } },
      { id: 'h-2', name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', qty: 1, price: 34000, discount: { type: 'none' } },
      { id: 'h-3', name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', qty: 2, price: 28000, discount: { type: 'none' } },
      { id: 'h-4', name: 'Indomie Goreng (Pack isi 5)', category: 'Sembako', unit: 'pack', qty: 3, price: 15500, discount: { type: 'none' } },
      { id: 'h-5', name: 'Biore Body Wash 450ml', category: 'Toiletries', unit: 'pack', qty: 1, price: 24500, discount: { type: 'percent', percent: 10 } },
      { id: 'h-6', name: 'Shampoo Pantene 160ml', category: 'Toiletries', unit: 'botol', qty: 1, price: 27000, discount: { type: 'none' } },
      { id: 'h-7', name: 'Pasta Gigi Pepsodent 190g', category: 'Toiletries', unit: 'pcs', qty: 1, price: 14000, discount: { type: 'none' } },
      { id: 'h-8', name: 'Susu UHT Ultra Milk 1L', category: 'Minuman', unit: 'dus', qty: 4, price: 19500, discount: { type: 'none' } },
      { id: 'h-9', name: 'Deterjen Rinso 770g', category: 'Toiletries', unit: 'pack', qty: 1, price: 22000, discount: { type: 'none' } },
      { id: 'h-10', name: 'Nugget Fiesta 500g', category: 'Frozen & Segar', unit: 'pack', qty: 2, price: 46000, discount: { type: 'percent', percent: 15 } }
    ]
  },
  {
    id: 'session-aug-2026',
    title: 'Belanja Awal Semester - Agustus 2026',
    date: '2026-08-08T11:15:00Z',
    monthLabel: 'Agustus 2026',
    budgetLimit: 800000,
    totalSpent: 732000,
    totalSavings: 35000,
    itemsCount: 18,
    items: [
      { id: 'ha-1', name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', qty: 1, price: 70000, discount: { type: 'none' } },
      { id: 'ha-2', name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', qty: 1, price: 33500, discount: { type: 'none' } },
      { id: 'ha-3', name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', qty: 2, price: 29000, discount: { type: 'none' } }
    ]
  }
];

// Initial demo cart
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
    note: 'Stok sebulan anak rantau'
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
    note: 'Promo Supermarket Diskon Tumpuk'
  },
  {
    id: 'cart-3',
    name: 'Telur Ayam 1kg',
    category: 'Sembako',
    unit: 'kg',
    qty: 2,
    price: 28000,
    discount: { type: 'none' },
    checked: true,
    note: 'Protein harian kos'
  },
  {
    id: 'cart-4',
    name: 'Indomie Goreng (Pack isi 5)',
    category: 'Sembako',
    unit: 'pack',
    qty: 3,
    price: 15500,
    discount: { type: 'none' },
    checked: false,
    note: 'Makanan darurat tanggal tua'
  },
  {
    id: 'cart-5',
    name: 'Susu UHT Ultra Milk 1L',
    category: 'Minuman',
    unit: 'dus',
    qty: 2,
    price: 18000,
    discount: { type: 'none' },
    checked: false,
    note: 'Promo mingguan'
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
