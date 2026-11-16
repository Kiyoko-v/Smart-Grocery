/**
 * Store / Supermarket Selection & Management Module (Shop Options)
 * Allows users to:
 * - View active store in an elongated bar below Safety Cap
 * - Switch between saved stores (Superindo, Indomaret Fresh, Alfamidi, Hypermart, Pasar Tradisional, etc.)
 * - Add new custom stores with persistent storage
 */

const STORES_STORAGE_KEY = 'smart_grocery_saved_stores_v1';
const ACTIVE_STORE_KEY = 'smart_grocery_active_store_v1';

const DEFAULT_STORES = [
  { id: 'store-1', name: 'Superindo Kaliurang', isDefault: true, icon: 'store' },
  { id: 'store-2', name: 'Indomaret Fresh', isDefault: true, icon: 'shopping-cart' },
  { id: 'store-3', name: 'Alfamidi Super', isDefault: true, icon: 'shopping-bag' },
  { id: 'store-4', name: 'Hypermart Pakuwon', isDefault: true, icon: 'store' },
  { id: 'store-5', name: 'Pasar Tradisional Kranggan', isDefault: true, icon: 'carrot' }
];

/**
 * Get list of saved stores
 */
export function getSavedStores() {
  const raw = localStorage.getItem(STORES_STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(DEFAULT_STORES));
    return DEFAULT_STORES;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_STORES;
  } catch (e) {
    return DEFAULT_STORES;
  }
}

/**
 * Get active store name
 */
export function getActiveStore() {
  const active = localStorage.getItem(ACTIVE_STORE_KEY);
  if (active) return active;
  const stores = getSavedStores();
  const defaultName = stores[0]?.name || 'Superindo Kaliurang';
  localStorage.setItem(ACTIVE_STORE_KEY, defaultName);
  return defaultName;
}

/**
 * Set active store
 */
export function setActiveStore(storeName) {
  const clean = String(storeName).trim();
  if (!clean) return getActiveStore();
  localStorage.setItem(ACTIVE_STORE_KEY, clean);
  return clean;
}

/**
 * Add a new custom store
 */
export function addCustomStore(storeName) {
  const clean = String(storeName).trim();
  if (!clean) throw new Error('Nama toko tidak boleh kosong.');

  const stores = getSavedStores();
  const existing = stores.find(s => s.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    setActiveStore(existing.name);
    return { store: existing, isNew: false };
  }

  const newStore = {
    id: 'store-' + Date.now(),
    name: clean,
    isDefault: false,
    icon: 'store',
    addedDate: new Date().toISOString()
  };

  stores.unshift(newStore);
  localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(stores));
  setActiveStore(clean);

  return { store: newStore, isNew: true };
}

/**
 * Remove a custom store
 */
export function removeCustomStore(storeId) {
  let stores = getSavedStores();
  const target = stores.find(s => s.id === storeId);
  if (!target || target.isDefault) return false;

  stores = stores.filter(s => s.id !== storeId);
  localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(stores));

  // If deleted store was active, reset active store to first store
  if (getActiveStore() === target.name) {
    setActiveStore(stores[0]?.name || 'Superindo Kaliurang');
  }

  return true;
}
