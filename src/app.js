/**
 * Smart Grocery & Budget Safety Tracker - Core Application
 * Handles SRS Requirements F-01 through F-06 and all Extended Systems:
 * 1. Authentication & Cloud Persistence (Google OAuth, Email/Password, Phone SMS OTP)
 * 2. History & "Most Frequently Bought" Smart Lists with 1-Tap Re-Add
 * 3. Color Theme System (Dark Blue Midnight & Baby Blue Light)
 * 4. Dual-Option "Add Product" (Manual autocomplete & Barcode camera scanner)
 * 5. Pinned Bottom Navigation "Shop Options" Cart Access Sheet
 * 6. Hard Budget Limit Protection (Auto-Block Over-Budget Items & Overage Calculator)
 * 7. Accurate Price Trend & Repurchase Analytics (100% precise unit pricing & SVG trend charts)
 */

import './style.css';
import { DB } from './db.js';
import {
  calculateItemDiscount,
  calculateLineTotal,
  calculateCartSummary,
  formatNumber,
  formatRupiah
} from './calculator.js';
import { comparePriceWithHistory } from './comparator.js';
import {
  playTap,
  playAdd,
  playWarning,
  playCheckout,
  vibrate,
  toggleSound,
  isSoundEnabled
} from './audio.js';
import { getFirebaseStatus } from './firebase.js';

// New Feature Modules
import {
  initTheme,
  applyTheme,
  getCurrentThemeSetting,
  getResolvedTheme,
  onThemeChange
} from './theme.js';
import {
  getCurrentUser,
  onAuthStateChanged,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  requestPasswordReset,
  sendPhoneOTP,
  verifyPhoneOTP,
  signOutUser
} from './auth.js';
import {
  checkBudgetLimitEnforcement,
  showHardBudgetAlertModal,
  closeHardBudgetAlertModal,
  getPendingBlockedAction
} from './budgetProtection.js';
import {
  calculateExactPriceChange,
  getProductPurchaseHistory,
  getMostFrequentlyBoughtItems,
  openPriceTrendModal,
  closePriceTrendModal
} from './priceAnalytics.js';
import {
  startCameraScanner,
  stopCameraScanner,
  toggleTorch,
  handleDetectedBarcode,
  BARCODE_PRODUCT_DATABASE
} from './scanner.js';

// Global App State
const state = {
  cart: [],
  budget: 750000,
  history: [],
  activeTab: 'belanja',
  activeFilter: 'ALL',
  editingItemId: null,
  deferredInstallPrompt: null,
  currentDiscountConfig: { type: 'none', percent: 0, tier1: 50, tier2: 20, nominal: 0 },
  emailAuthMode: 'login', // 'login' | 'signup'
  phoneTimerInterval: null,
  pendingPhoneTarget: '',
  isMostBoughtCollapsed: false
};

/**
 * Initialize Lucide Icons safely
 */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Display toast notification
 */
function showToast(message, icon = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.innerHTML = `<i data-lucide="${icon}" style="width: 14px; height: 14px;"></i><span>${message}</span>`;
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

/**
 * Update dynamic clock in desktop mockup notch
 */
function updateClock() {
  const clockEl = document.getElementById('mockup-clock');
  if (clockEl) {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${hours}:${mins}`;
  }
}

/* ==========================================================================
   F-05: Pengendali Anggaran (Safety Cap Hero) Rendering
   ========================================================================== */
function renderSafetyCap() {
  const summary = calculateCartSummary(state.cart, state.budget);
  const heroCard = document.getElementById('safety-cap-hero');
  const spentEl = document.getElementById('hero-total-spent');
  const limitEl = document.getElementById('hero-budget-limit');
  const fillEl = document.getElementById('hero-meter-fill');
  const remainingEl = document.getElementById('hero-remaining-text');
  const percentEl = document.getElementById('hero-percent-text');
  const badgeEl = document.getElementById('safety-status-badge');
  const badgeTextEl = document.getElementById('safety-status-text');
  const overBanner = document.getElementById('hero-over-budget-banner');
  const overMsg = document.getElementById('hero-over-budget-msg');
  const islandDot = document.getElementById('dynamic-island-status-dot');
  const islandText = document.getElementById('dynamic-island-text');

  if (!heroCard) return;

  spentEl.textContent = formatRupiah(summary.totalSpent);
  limitEl.textContent = formatRupiah(summary.budget);

  // Meter fill capped at 100% width visually, but percent text shows true value
  const fillWidth = Math.min(100, summary.budgetUsagePercent);
  fillEl.style.width = `${fillWidth}%`;
  percentEl.textContent = `${summary.budgetUsagePercent}%`;

  // Remove previous status classes
  heroCard.className = `safety-cap-card status-${summary.safetyStatus}`;
  fillEl.className = `safety-meter-fill fill-${summary.safetyStatus}`;
  badgeEl.className = `safety-badge badge-${summary.safetyStatus}`;

  if (summary.safetyStatus === 'safe') {
    badgeTextEl.textContent = 'Aman';
    remainingEl.innerHTML = `Sisa Uang Dingin: <strong>${formatRupiah(summary.remainingBudget)}</strong>`;
    overBanner.style.display = 'none';
    if (islandDot) islandDot.style.background = '#10b981';
    if (islandText) islandText.textContent = 'SAFE CAP';
  } else if (summary.safetyStatus === 'caution') {
    badgeTextEl.textContent = 'Hati-hati';
    remainingEl.innerHTML = `Sisa Uang Dingin: <strong>${formatRupiah(summary.remainingBudget)}</strong>`;
    overBanner.style.display = 'none';
    if (islandDot) islandDot.style.background = '#f59e0b';
    if (islandText) islandText.textContent = 'CAUTION';
  } else if (summary.safetyStatus === 'warning') {
    badgeTextEl.textContent = 'Kritis!';
    remainingEl.innerHTML = `Tersisa: <strong style="color: #fb923c;">${formatRupiah(summary.remainingBudget)}</strong>`;
    overBanner.style.display = 'none';
    if (islandDot) islandDot.style.background = '#f97316';
    if (islandText) islandText.textContent = 'WARNING';
    vibrate([60, 40, 60]);
  } else if (summary.safetyStatus === 'danger') {
    badgeTextEl.textContent = 'OVER BUDGET';
    const over = Math.abs(summary.remainingBudget);
    remainingEl.innerHTML = `Defisit: <strong style="color: #f87171;">-${formatRupiah(over)}</strong>`;
    overBanner.style.display = 'flex';
    overMsg.textContent = `🚨 Melebihi budget Rp ${formatNumber(over)}! Keluarkan barang dari troli!`;
    if (islandDot) islandDot.style.background = '#ef4444';
    if (islandText) islandText.textContent = 'OVER LIMIT';
    vibrate([120, 80, 120]);
    playWarning();
  }

  // Update tab cart badge
  const navBadge = document.getElementById('nav-badge-cart-count');
  if (navBadge) {
    navBadge.textContent = state.cart.length;
    navBadge.style.display = state.cart.length > 0 ? 'flex' : 'none';
  }

  // Update Shop Options bottom nav pill in real time (Requirement 5)
  const navShopTotal = document.getElementById('nav-shop-options-total');
  if (navShopTotal) {
    navShopTotal.textContent = formatRupiah(summary.totalSpent);
  }

  // Quick summary in Belanja tab
  const countTag = document.getElementById('summary-items-count');
  const savingsText = document.getElementById('summary-savings-text');
  const checkoutTotal = document.getElementById('checkout-total-display');

  if (countTag) {
    countTag.textContent = `${summary.totalItemsCount} item (${summary.checkedItemsCount} masuk troli)`;
  }
  if (savingsText) {
    savingsText.textContent = `Hemat ${formatRupiah(summary.totalSavings)}`;
  }
  if (checkoutTotal) {
    checkoutTotal.textContent = formatRupiah(summary.totalSpent);
  }

  // Update Shop Options Sheet if open
  renderShopOptionsSheetContent(summary);
}

/* ==========================================================================
   Render Troli Items (Belanja Screen)
   ========================================================================== */
function renderCartItems() {
  const container = document.getElementById('cart-items-container');
  if (!container) return;

  const filteredItems = state.cart.filter(item => {
    if (state.activeFilter === 'ALL') return true;
    return item.category === state.activeFilter;
  });

  if (filteredItems.length === 0) {
    container.innerHTML = `
      <div class="empty-cart-state">
        <div class="empty-icon-circle">
          <i data-lucide="shopping-cart" style="width: 32px; height: 32px;"></i>
        </div>
        <h3 class="empty-title">${state.cart.length === 0 ? 'Troli Masih Kosong' : 'Tidak ada barang di kategori ini'}</h3>
        <p class="empty-desc">${state.cart.length === 0 ? 'Mulai masukkan barang belanjaanmu sambil menyusuri lorong supermarket.' : 'Pilih kategori "Semua" untuk melihat seluruh belanjaan.'}</p>
        <button class="btn-primary-checkout" style="max-width: 220px;" id="btn-empty-add-item">
          <i data-lucide="plus" style="width: 16px; height: 16px;"></i>
          <span>+ Tambah Barang</span>
        </button>
      </div>
    `;

    const emptyAddBtn = document.getElementById('btn-empty-add-item');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => openDualAddModal());
    }

    refreshIcons();
    return;
  }

  let html = '';

  filteredItems.forEach((item) => {
    const line = calculateLineTotal(item);
    
    // Requirement 7: Accurate Price Trend using exact unit pricing from database receipts
    const priceChange = calculateExactPriceChange(item.name, item.price, state.history);

    let compBadgeHtml = '';
    if (priceChange.status === 'up') {
      compBadgeHtml = `
        <span class="comparator-badge badge-price-up" data-action="view-trend" data-item-name="${item.name}" data-item-price="${item.price}" title="${priceChange.tipText} (Ketuk untuk melihat tren)">
          <i data-lucide="arrow-up-right" style="width: 11px; height: 11px;"></i>
          <span>${priceChange.shortBadge || `+${priceChange.diffPercent}%`}</span>
        </span>
      `;
    } else if (priceChange.status === 'down') {
      compBadgeHtml = `
        <span class="comparator-badge badge-price-down" data-action="view-trend" data-item-name="${item.name}" data-item-price="${item.price}" title="${priceChange.tipText} (Ketuk untuk melihat tren)">
          <i data-lucide="arrow-down-right" style="width: 11px; height: 11px;"></i>
          <span>${priceChange.shortBadge || `-${Math.abs(priceChange.diffPercent)}%`}</span>
        </span>
      `;
    } else if (priceChange.status === 'equal') {
      compBadgeHtml = `
        <span class="comparator-badge badge-price-equal" data-action="view-trend" data-item-name="${item.name}" data-item-price="${item.price}" title="${priceChange.tipText}">
          <span>= Tetap</span>
        </span>
      `;
    } else {
      compBadgeHtml = `
        <span class="comparator-badge badge-new" data-action="view-trend" data-item-name="${item.name}" data-item-price="${item.price}" title="Item Baru">
          <i data-lucide="sparkles" style="width: 10px; height: 10px;"></i>
          <span>Baru</span>
        </span>
      `;
    }

    // F-03: Discount Chip HTML
    let discChipHtml = '';
    if (item.discount && item.discount.type !== 'none' && line.lineSavings > 0) {
      discChipHtml = `<span class="discount-chip" title="Hemat ${formatRupiah(line.lineSavings)}">
        <i data-lucide="tag" style="width: 10px; height: 10px;"></i>
        <span>${line.discountLabel}</span>
      </span>`;
    }

    const isChecked = item.checked ? 'checked' : '';
    const checkIcon = item.checked ? '<i data-lucide="check" style="width: 16px; height: 16px;"></i>' : '';

    html += `
      <article class="cart-item-card ${isChecked}" data-item-id="${item.id}">
        <div class="cart-item-top">
          <!-- Thumb friendly check button -->
          <button class="item-check-btn ${isChecked}" data-action="toggle-check" data-item-id="${item.id}" aria-label="Tandai sudah di troli">
            ${checkIcon}
          </button>

          <div class="item-info">
            <div class="item-title-row">
              <h4 class="item-name">${item.name}</h4>
              <div class="item-card-actions">
                <button class="btn-item-action" data-action="view-trend" data-item-name="${item.name}" data-item-price="${item.price}" title="Tren Harga">
                  <i data-lucide="trending-up" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn-item-action" data-action="edit-item" data-item-id="${item.id}" title="Edit Item">
                  <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn-item-action delete" data-action="delete-item" data-item-id="${item.id}" title="Hapus Item">
                  <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
              </div>
            </div>

            <div class="item-meta-row">
              <span class="category-tag">${item.category || 'Umum'}</span>
              <span class="unit-tag">/${item.unit || 'pcs'}</span>
              ${compBadgeHtml}
              ${discChipHtml}
            </div>

            <div class="item-price-unit-row">
              ${line.lineSavings > 0 ? `<span class="original-price-strikethrough">${formatRupiah(line.basePrice)}</span>` : ''}
              <span class="final-unit-price" data-action="view-trend" data-item-name="${item.name}" data-item-price="${item.price}" style="cursor: pointer;" title="Klik untuk cek riwayat harga">${formatRupiah(line.finalUnitPrice)}</span>
              ${item.note ? `<span style="font-size: 10px; color: var(--text-muted); font-style: italic;">• ${item.note}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="cart-item-bottom">
          <!-- F-02: Thumb Qty Stepper -->
          <div class="qty-stepper-control">
            <button class="qty-step-btn" data-action="qty-minus" data-item-id="${item.id}" aria-label="Kurangi kuantitas">-</button>
            <span class="qty-display-number">${item.qty || 1}</span>
            <button class="qty-step-btn" data-action="qty-plus" data-item-id="${item.id}" aria-label="Tambah kuantitas">+</button>
          </div>

          <!-- F-02: Realtime Line Total -->
          <div class="line-total-wrapper">
            <span class="line-total-label">Total Baris</span>
            <span class="line-total-number">${formatRupiah(line.lineTotal)}</span>
          </div>
        </div>
      </article>
    `;
  });

  container.innerHTML = html;
  refreshIcons();
}

/* ==========================================================================
   Requirement 2: Render "Most Frequently Bought" Smart Lists Section
   Auto-populates based on user shopping frequency, allowing 1-tap re-add to cart
   ========================================================================== */
function renderMostFrequentlyBought() {
  const container = document.getElementById('most-bought-carousel-container');
  if (!container) return;

  const mostBought = getMostFrequentlyBoughtItems(state.history);

  if (mostBought.length === 0) {
    container.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); padding: 8px 4px;">
        Belum ada riwayat belanja untuk membentuk rekomendasi frekuensi belanja.
      </div>
    `;
    return;
  }

  let html = '';
  // Display top 8 frequently bought items
  mostBought.slice(0, 8).forEach(item => {
    const priceChange = calculateExactPriceChange(item.name, item.latestPrice, state.history);

    let priceBadgeClass = 'badge-price-equal';
    let badgeText = 'Same Price';
    if (priceChange.status === 'down') {
      priceBadgeClass = 'badge-price-down';
      badgeText = priceChange.shortBadge || `↓ -${Math.abs(priceChange.diffPercent)}%`;
    } else if (priceChange.status === 'up') {
      priceBadgeClass = 'badge-price-up';
      badgeText = priceChange.shortBadge || `↑ +${priceChange.diffPercent}%`;
    }

    html += `
      <div class="most-bought-card">
        <div>
          <div class="mb-top">
            <span class="category-tag">${item.category}</span>
            <span class="mb-freq-badge" title="Frekuensi belanja">${item.purchaseCount}x dibeli</span>
          </div>
          <h5 class="mb-name" title="${item.name}">${item.name}</h5>
        </div>

        <div>
          <div class="mb-price-row">
            <span class="mb-price">${formatRupiah(item.latestPrice)}<span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">/${item.unit}</span></span>
            <span class="comparator-badge ${priceBadgeClass}" data-action="view-trend" data-item-name="${item.name}" data-item-price="${item.latestPrice}" title="Riwayat harga unit">
              ${badgeText}
            </span>
          </div>

          <!-- 1-Tap Re-Add Button (Hard Budget Enforced) -->
          <button type="button" class="btn-readd-cart" data-action="readd-item" data-item-name="${item.name}" data-item-price="${item.latestPrice}" data-item-cat="${item.category}" data-item-unit="${item.unit}">
            <i data-lucide="plus" style="width: 12px; height: 12px;"></i>
            <span>+ 1-Tap Re-Add</span>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  refreshIcons();
}

/**
 * Handle 1-Tap Re-Add from Most Frequently Bought items list
 * Strictly enforces Hard Budget Limit Protection
 */
function handleOneTapReAdd(product) {
  playTap();
  const price = Number(product.price) || 0;
  const name = product.name || 'Produk';

  // Requirement 6: Check Hard Budget Constraint
  const check = checkBudgetLimitEnforcement({
    currentCart: state.cart,
    budgetLimit: state.budget,
    itemPrice: price,
    qty: 1,
    itemName: name
  });

  if (!check.allowed) {
    showHardBudgetAlertModal(check, {
      onAdjustBudget: (suggestedLimit) => {
        saveBudget(suggestedLimit);
        // Execute pending add
        executeDirectAddToCart(product);
      },
      onRemoveItem: () => openRemoveItemModal()
    });
    return;
  }

  executeDirectAddToCart(product);
}

function executeDirectAddToCart(product) {
  // Check if item already exists in active cart; if so, increment quantity
  const existingIndex = state.cart.findIndex(i => i.name.toLowerCase().trim() === product.name.toLowerCase().trim());

  if (existingIndex !== -1) {
    state.cart[existingIndex].qty = (state.cart[existingIndex].qty || 1) + 1;
    state.cart[existingIndex].checked = true;
    showToast(`Kuantitas "${product.name}" ditambah (+1)`, 'check-circle');
  } else {
    const newItem = {
      id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: product.name,
      category: product.category || 'Sembako',
      unit: product.unit || 'pcs',
      qty: 1,
      price: Number(product.price) || 0,
      discount: { type: 'none' },
      checked: true,
      note: 'Ditambahkan via 1-Tap Re-Add'
    };
    state.cart.unshift(newItem);
    showToast(`"${product.name}" masuk ke troli`, 'shopping-bag');
  }

  playAdd();
  vibrate([50]);
  DB.saveCartItems(state.cart);
  renderCartItems();
  renderSafetyCap();
  renderAnggaranScreen();
}

/* ==========================================================================
   Render Riwayat Screen (F-06 History Tab)
   ========================================================================== */
function renderHistoryScreen() {
  const sessions = DB.getHistorySessions();
  const listContainer = document.getElementById('history-sessions-container');
  const totalSessionsEl = document.getElementById('history-total-sessions');
  const totalSavingsEl = document.getElementById('history-total-savings');

  if (!listContainer) return;

  totalSessionsEl.textContent = `${sessions.length} Bulan`;

  let totalSavings = 0;
  sessions.forEach(s => {
    totalSavings += (s.totalSavings || 0);
  });
  totalSavingsEl.textContent = formatRupiah(totalSavings);

  if (sessions.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-cart-state">
        <div class="empty-icon-circle">
          <i data-lucide="calendar" style="width: 32px; height: 32px;"></i>
        </div>
        <h3 class="empty-title">Belum Ada Riwayat Belanja</h3>
        <p class="empty-desc">Selesaikan sesi belanjamu di troli untuk menyimpannya ke database bulanan.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  let html = '';
  sessions.forEach((session) => {
    const dateFormatted = new Date(session.date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const previewItems = (session.items || []).slice(0, 3).map(i => `${i.name} (${i.qty} ${i.unit || 'pcs'})`).join(', ');
    const moreCount = (session.items || []).length > 3 ? ` +${session.items.length - 3} barang lainnya` : '';

    html += `
      <article class="history-session-card" data-session-id="${session.id}">
        <div class="history-session-header">
          <div>
            <h4 class="session-title">${session.title}</h4>
            <div class="session-date">${dateFormatted} • ${session.itemsCount || session.items.length} Barang</div>
          </div>
          <div class="session-badge-spent">
            <div class="spent-val">${formatRupiah(session.totalSpent)}</div>
            <div class="budget-info">Batas: ${formatRupiah(session.budgetLimit)}</div>
          </div>
        </div>

        <div class="session-preview-items">
          ${previewItems}${moreCount}
        </div>

        <div class="session-card-actions">
          <span style="font-size: 11px; color: #34d399; font-weight: 700;">
            <i data-lucide="sparkles" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;"></i>
            Hemat ${formatRupiah(session.totalSavings || 0)}
          </span>
          <div style="display: flex; gap: 6px;">
            <button class="btn-copy-history" data-action="view-receipt" data-session-id="${session.id}">
              <i data-lucide="receipt" style="width: 12px; height: 12px;"></i>
              <span>Lihat Struk</span>
            </button>
            <button class="btn-copy-history" style="color: var(--color-brand); background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.3);" data-action="copy-to-cart" data-session-id="${session.id}">
              <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
              <span>Salin ke Troli</span>
            </button>
          </div>
        </div>
      </article>
    `;
  });

  listContainer.innerHTML = html;
  refreshIcons();
}

/* ==========================================================================
   Render Anggaran & Analisis Tab
   ========================================================================== */
function renderAnggaranScreen() {
  const inputBudget = document.getElementById('input-page-budget-cap');
  if (inputBudget) {
    inputBudget.value = state.budget;
  }

  const summary = calculateCartSummary(state.cart, state.budget);
  const container = document.getElementById('category-breakdown-container');
  if (!container) return;

  const categories = Object.keys(summary.categoryTotals);

  if (categories.length === 0) {
    container.innerHTML = `
      <p style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px 0;">
        Belum ada barang di troli untuk dianalisis.
      </p>
    `;
    return;
  }

  const catColors = {
    'Sembako': '#10b981',
    'Toiletries': '#38bdf8',
    'Dapur & Bumbu': '#f59e0b',
    'Minuman': '#8b5cf6',
    'Frozen & Segar': '#ec4899',
    'Camilan': '#f97316',
    'Lain-lain': '#64748b'
  };

  let html = '';
  categories.forEach(cat => {
    const data = summary.categoryTotals[cat];
    const catPercent = summary.totalSpent > 0 ? ((data.spent / summary.totalSpent) * 100).toFixed(1) : 0;
    const color = catColors[cat] || '#10b981';

    html += `
      <div class="cat-bar-item">
        <div class="cat-bar-header">
          <span class="cat-name">${cat} (${data.count} item)</span>
          <span class="cat-amount">${formatRupiah(data.spent)} (${catPercent}%)</span>
        </div>
        <div class="cat-track">
          <div class="cat-fill" style="width: ${catPercent}%; background: ${color};"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/* ==========================================================================
   F-03 & F-04: Realtime Calculator & Live Comparator in Modal
   ========================================================================== */
function updateModalCalculations() {
  const nameInput = document.getElementById('item-field-name');
  const priceInput = document.getElementById('item-field-price');
  const qtyInput = document.getElementById('item-field-qty');

  const name = nameInput ? nameInput.value.trim() : '';
  const price = priceInput ? Number(priceInput.value) || 0 : 0;
  const qty = qtyInput ? Math.max(1, Number(qtyInput.value) || 1) : 1;

  // 1. Calculate discount
  const discResult = calculateItemDiscount(price, state.currentDiscountConfig);
  const lineTotal = Math.round(qty * discResult.finalUnitPrice);
  const totalSavings = Math.round(qty * discResult.unitSavings);

  // Update live preview in sheet
  const liveTotalEl = document.getElementById('modal-live-line-total');
  const liveSavingsEl = document.getElementById('modal-live-savings-tag');

  if (liveTotalEl) liveTotalEl.textContent = formatRupiah(lineTotal);
  if (liveSavingsEl) {
    if (totalSavings > 0) {
      liveSavingsEl.textContent = `Hemat ${formatRupiah(totalSavings)} (${discResult.effectivePercent}%)`;
      liveSavingsEl.style.display = 'block';
    } else {
      liveSavingsEl.textContent = 'Hemat Rp 0';
      liveSavingsEl.style.display = 'none';
    }
  }

  // Update Math breakdown if discount is active
  const mathCard = document.getElementById('discount-math-breakdown');
  const mathStepsEl = document.getElementById('math-steps-container');
  const mathTag = document.getElementById('math-effective-tag');

  if (state.currentDiscountConfig.type !== 'none' && price > 0) {
    mathCard.style.display = 'block';
    mathTag.textContent = `Hemat ${discResult.effectivePercent}%`;

    let stepsHtml = '';
    stepsHtml += `<div class="math-step"><span>Harga Normal:</span><span>${formatRupiah(price)}</span></div>`;
    discResult.steps.forEach(s => {
      stepsHtml += `<div class="math-step"><span>${s.label}:</span><span>-${formatRupiah(s.amount)} → ${formatRupiah(s.priceAfter)}</span></div>`;
    });
    stepsHtml += `<div class="math-step highlight"><span>Harga Akhir Satuan:</span><span>${formatRupiah(discResult.finalUnitPrice)}</span></div>`;
    mathStepsEl.innerHTML = stepsHtml;
  } else {
    mathCard.style.display = 'none';
  }

  // 2. F-04: Update Live Price Comparator
  const compCard = document.getElementById('form-comparator-card');
  const compBadge = document.getElementById('modal-comparator-badge');
  const compBadgeText = document.getElementById('modal-comparator-badge-text');
  const compMainMsg = document.getElementById('modal-comparator-main-msg');
  const compTip = document.getElementById('modal-comparator-tip');

  const comparativeHistory = DB.getComparativeHistoryItems();
  const comp = comparePriceWithHistory(name, price, comparativeHistory);

  compCard.className = `live-comparator-card status-${comp.status}`;

  if (comp.status === 'up') {
    compBadge.className = 'comparator-badge badge-danger-up';
    compBadgeText.textContent = `↑ +${Math.abs(comp.diffPercent)}%`;
    compMainMsg.innerHTML = `<span style="color: #f87171;">${comp.text}</span>`;
    compTip.textContent = comp.tip;
  } else if (comp.status === 'down') {
    compBadge.className = 'comparator-badge badge-success-down';
    compBadgeText.textContent = `↓ -${Math.abs(comp.diffPercent)}%`;
    compMainMsg.innerHTML = `<span style="color: #34d399;">${comp.text}</span>`;
    compTip.textContent = comp.tip;
  } else if (comp.status === 'equal') {
    compBadge.className = 'comparator-badge badge-equal';
    compBadgeText.textContent = '= Tetap';
    compMainMsg.innerHTML = `<span style="color: var(--color-brand);">${comp.text}</span>`;
    compTip.textContent = comp.tip;
  } else if (comp.status === 'new') {
    compBadge.className = 'comparator-badge badge-new';
    compBadgeText.textContent = 'Baru ✨';
    compMainMsg.innerHTML = `<span style="color: #a78bfa;">${comp.text}</span>`;
    compTip.textContent = comp.tip;
  } else {
    compBadge.className = 'comparator-badge badge-neutral';
    compBadgeText.textContent = 'Menunggu Input';
    compMainMsg.innerHTML = `<span>Ketik nama barang & harga satuan di atas</span>`;
    compTip.textContent = 'Sistem otomatis membandingkan dengan harga belanjaanmu bulan lalu secara realtime.';
  }

  refreshIcons();
}

/* ==========================================================================
   Dual-Option "Add Product" Action Button (Requirement 4)
   ========================================================================== */
function openDualAddModal() {
  playTap();
  const backdrop = document.getElementById('modal-dual-add-backdrop');
  if (backdrop) {
    backdrop.classList.add('active');
    backdrop.setAttribute('aria-hidden', 'false');
  }
}

function closeDualAddModal() {
  const backdrop = document.getElementById('modal-dual-add-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

/* ==========================================================================
   Camera Barcode Scanner (Requirement 4)
   ========================================================================== */
function openScannerModal() {
  playTap();
  const backdrop = document.getElementById('modal-scanner-backdrop');
  if (backdrop) {
    backdrop.classList.add('active');
    backdrop.setAttribute('aria-hidden', 'false');
    startCameraScanner(handleScannedProduct);
  }
}

function closeScannerModal() {
  const backdrop = document.getElementById('modal-scanner-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
    stopCameraScanner();
  }
}

function handleScannedProduct(product) {
  closeScannerModal();
  handleOneTapReAdd(product);
}

/* ==========================================================================
   Modal Bottom Sheet Controls (Add/Edit Item)
   ========================================================================== */
function openItemModal(itemId = null) {
  playTap();
  state.editingItemId = itemId;

  const backdrop = document.getElementById('modal-item-backdrop');
  const titleEl = document.getElementById('modal-item-title');
  const submitLabel = document.getElementById('btn-submit-label');

  // Fields
  const idField = document.getElementById('item-field-id');
  const nameField = document.getElementById('item-field-name');
  const catField = document.getElementById('item-field-category');
  const unitField = document.getElementById('item-field-unit');
  const qtyField = document.getElementById('item-field-qty');
  const priceField = document.getElementById('item-field-price');

  if (itemId) {
    const item = state.cart.find(i => i.id === itemId);
    if (!item) return;

    titleEl.textContent = 'Edit Barang Belanja';
    submitLabel.textContent = 'Simpan Perubahan';
    idField.value = item.id;
    nameField.value = item.name;
    catField.value = item.category || 'Sembako';
    unitField.value = item.unit || 'pcs';
    qtyField.value = item.qty || 1;
    priceField.value = item.price || 0;

    // Load discount
    state.currentDiscountConfig = item.discount ? { ...item.discount } : { type: 'none' };
  } else {
    titleEl.textContent = 'Tambah Barang ke Troli (Manual)';
    submitLabel.textContent = 'Masukkan ke Troli';
    idField.value = '';
    nameField.value = '';
    catField.value = 'Sembako';
    unitField.value = 'pcs';
    qtyField.value = 1;
    priceField.value = '';
    state.currentDiscountConfig = { type: 'none', percent: 0, tier1: 50, tier2: 20, nominal: 0 };
  }

  // Sync discount UI buttons
  setDiscountType(state.currentDiscountConfig.type || 'none');
  if (state.currentDiscountConfig.type === 'percent') {
    document.getElementById('input-disc-percent').value = state.currentDiscountConfig.percent || '';
  } else if (state.currentDiscountConfig.type === 'stacked') {
    document.getElementById('input-disc-tier1').value = state.currentDiscountConfig.tier1 || 50;
    document.getElementById('input-disc-tier2').value = state.currentDiscountConfig.tier2 || 20;
  } else if (state.currentDiscountConfig.type === 'nominal') {
    document.getElementById('input-disc-nominal').value = state.currentDiscountConfig.nominal || '';
  }

  updateModalCalculations();
  backdrop.classList.add('active');
  backdrop.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    if (!itemId) nameField.focus();
  }, 200);
}

function closeItemModal() {
  playTap();
  const backdrop = document.getElementById('modal-item-backdrop');
  backdrop.classList.remove('active');
  backdrop.setAttribute('aria-hidden', 'true');
  state.editingItemId = null;
}

function setDiscountType(type) {
  state.currentDiscountConfig.type = type;

  // Update tabs
  document.querySelectorAll('.disc-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.discType === type);
  });

  // Toggle panes
  document.getElementById('discount-pane-percent').style.display = type === 'percent' ? 'block' : 'none';
  document.getElementById('discount-pane-stacked').style.display = type === 'stacked' ? 'block' : 'none';
  document.getElementById('discount-pane-nominal').style.display = type === 'nominal' ? 'block' : 'none';

  updateModalCalculations();
}

/**
 * Handle save item from manual modal (Hard Budget Limit Enforced)
 */
function handleSaveItemFromModal() {
  const name = document.getElementById('item-field-name').value.trim();
  const category = document.getElementById('item-field-category').value;
  const unit = document.getElementById('item-field-unit').value;
  const qty = Math.max(1, Number(document.getElementById('item-field-qty').value) || 1);
  const price = Math.max(0, Number(document.getElementById('item-field-price').value) || 0);

  if (!name) {
    showToast('Nama produk wajib diisi!', 'alert-circle');
    document.getElementById('item-field-name').focus();
    return;
  }

  if (price <= 0) {
    showToast('Masukkan harga satuan yang valid!', 'alert-circle');
    document.getElementById('item-field-price').focus();
    return;
  }

  // Construct discount config
  const discount = { ...state.currentDiscountConfig };
  if (discount.type === 'percent') {
    discount.percent = Number(document.getElementById('input-disc-percent').value) || 0;
  } else if (discount.type === 'stacked') {
    discount.tier1 = Number(document.getElementById('input-disc-tier1').value) || 0;
    discount.tier2 = Number(document.getElementById('input-disc-tier2').value) || 0;
  } else if (discount.type === 'nominal') {
    discount.nominal = Number(document.getElementById('input-disc-nominal').value) || 0;
  }

  // Calculate final unit price
  const discResult = calculateItemDiscount(price, discount);
  const finalPrice = discResult.finalUnitPrice;

  // Requirement 6: Hard Budget Limit Enforcement check
  let cartWithoutCurrent = state.cart;
  if (state.editingItemId) {
    cartWithoutCurrent = state.cart.filter(i => i.id !== state.editingItemId);
  }

  const check = checkBudgetLimitEnforcement({
    currentCart: cartWithoutCurrent,
    budgetLimit: state.budget,
    itemPrice: finalPrice,
    qty,
    itemName: name
  });

  if (!check.allowed) {
    showHardBudgetAlertModal(check, {
      onAdjustBudget: (suggestedLimit) => {
        saveBudget(suggestedLimit);
        // Retry saving item
        applyItemModalSave(name, category, unit, qty, price, discount);
      },
      onRemoveItem: () => openRemoveItemModal()
    });
    return;
  }

  applyItemModalSave(name, category, unit, qty, price, discount);
}

function applyItemModalSave(name, category, unit, qty, price, discount) {
  if (state.editingItemId) {
    const idx = state.cart.findIndex(i => i.id === state.editingItemId);
    if (idx !== -1) {
      state.cart[idx] = {
        ...state.cart[idx],
        name,
        category,
        unit,
        qty,
        price,
        discount
      };
      showToast(`Perubahan "${name}" disimpan`, 'check-circle');
    }
  } else {
    const newItem = {
      id: 'item-' + Date.now(),
      name,
      category,
      unit,
      qty,
      price,
      discount,
      checked: true,
      note: ''
    };
    state.cart.unshift(newItem);
    playAdd();
    showToast(`"${name}" masuk ke troli`, 'shopping-bag');
  }

  DB.saveCartItems(state.cart);
  closeItemModal();
  renderCartItems();
  renderSafetyCap();
  renderAnggaranScreen();
}

/* ==========================================================================
   Remove Item Modal (Quick Action in Hard Budget Alert)
   ========================================================================== */
function openRemoveItemModal() {
  playTap();
  const backdrop = document.getElementById('modal-remove-item-backdrop');
  const container = document.getElementById('remove-item-cart-list');

  if (!backdrop || !container) return;

  if (state.cart.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-muted);text-align:center;">Troli kosong.</p>';
  } else {
    let html = '';
    state.cart.forEach(item => {
      const line = calculateLineTotal(item);
      html += `
        <div class="shop-options-item-row">
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">${item.name}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${item.qty} ${item.unit || 'pcs'} × ${formatRupiah(line.finalUnitPrice)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 800; color: var(--text-primary);">${formatRupiah(line.lineTotal)}</span>
            <button type="button" class="btn-item-action delete" data-action="quick-remove-budget" data-item-id="${item.id}" title="Hapus untuk Bebaskan Budget">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            </button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  backdrop.classList.add('active');
  backdrop.setAttribute('aria-hidden', 'false');
  refreshIcons();
}

function closeRemoveItemModal() {
  const backdrop = document.getElementById('modal-remove-item-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

/* ==========================================================================
   Shop Options Sheet Modal (Requirement 5 & 6)
   ========================================================================== */
function openShopOptionsModal() {
  playTap();
  const backdrop = document.getElementById('modal-shop-options-backdrop');
  if (!backdrop) return;

  const summary = calculateCartSummary(state.cart, state.budget);
  renderShopOptionsSheetContent(summary);

  backdrop.classList.add('active');
  backdrop.setAttribute('aria-hidden', 'false');
  refreshIcons();
}

function closeShopOptionsModal() {
  const backdrop = document.getElementById('modal-shop-options-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

function renderShopOptionsSheetContent(summary) {
  const remainingValEl = document.getElementById('shop-options-remaining-val');
  const budgetFillEl = document.getElementById('shop-options-budget-fill');
  const spentValEl = document.getElementById('shop-options-spent-val');
  const limitValEl = document.getElementById('shop-options-limit-val');
  const subtotalEl = document.getElementById('shop-options-subtotal');
  const savingsEl = document.getElementById('shop-options-savings');
  const totalCostEl = document.getElementById('shop-options-total-cost');
  const itemsContainer = document.getElementById('shop-options-cart-items-container');
  const itemsBadge = document.getElementById('shop-options-items-badge');

  if (!remainingValEl) return;

  const isDeficit = summary.remainingBudget < 0;
  remainingValEl.textContent = formatRupiah(Math.abs(summary.remainingBudget));
  remainingValEl.style.color = isDeficit ? '#ef4444' : '#10b981';

  const fillWidth = Math.min(100, summary.budgetUsagePercent);
  budgetFillEl.style.width = `${fillWidth}%`;
  budgetFillEl.className = `shop-options-budget-fill fill-${summary.safetyStatus}`;

  spentValEl.textContent = `Terpakai: ${formatRupiah(summary.totalSpent)}`;
  limitValEl.textContent = `Batas: ${formatRupiah(summary.budget)} (${summary.budgetUsagePercent}%)`;

  subtotalEl.textContent = formatRupiah(summary.totalSubtotal);
  savingsEl.textContent = `-${formatRupiah(summary.totalSavings)}`;
  totalCostEl.textContent = formatRupiah(summary.totalSpent);

  if (itemsBadge) {
    itemsBadge.textContent = `${state.cart.length} barang di troli`;
  }

  if (itemsContainer) {
    if (state.cart.length === 0) {
      itemsContainer.innerHTML = '<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px 0;">Troli belanja masih kosong.</p>';
    } else {
      let html = '';
      state.cart.forEach(item => {
        const line = calculateLineTotal(item);
        html += `
          <div class="shop-options-item-row" data-item-id="${item.id}">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${formatRupiah(line.finalUnitPrice)} / ${item.unit || 'pcs'}</div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="qty-stepper-control" style="transform: scale(0.85); margin: 0;">
                <button class="qty-step-btn" data-action="qty-minus" data-item-id="${item.id}">-</button>
                <span class="qty-display-number">${item.qty || 1}</span>
                <button class="qty-step-btn" data-action="qty-plus" data-item-id="${item.id}">+</button>
              </div>
              <span style="font-weight: 800; color: var(--text-primary); font-size: 12px; min-width: 60px; text-align: right;">${formatRupiah(line.lineTotal)}</span>
            </div>
          </div>
        `;
      });
      itemsContainer.innerHTML = html;
    }
  }
}

/* ==========================================================================
   Budget Modal Controls
   ========================================================================== */
function openBudgetModal() {
  playTap();
  const backdrop = document.getElementById('modal-budget-backdrop');
  const input = document.getElementById('input-modal-budget-limit');
  if (input) input.value = state.budget;
  backdrop.classList.add('active');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeBudgetModal() {
  playTap();
  const backdrop = document.getElementById('modal-budget-backdrop');
  backdrop.classList.remove('active');
  backdrop.setAttribute('aria-hidden', 'true');
}

function saveBudget(amount) {
  const newBudget = DB.saveBudgetLimit(amount);
  state.budget = newBudget;
  renderSafetyCap();
  renderAnggaranScreen();
  showToast(`Batas dompet diatur ke ${formatRupiah(newBudget)}`, 'wallet');
}

/* ==========================================================================
   Receipt Modal (Inspection of Past Sesi Belanja)
   ========================================================================== */
function openReceiptModal(sessionId) {
  playTap();
  const session = DB.getHistorySessions().find(s => s.id === sessionId);
  if (!session) return;

  const backdrop = document.getElementById('modal-receipt-backdrop');
  const title = document.getElementById('receipt-modal-title');
  const body = document.getElementById('receipt-modal-body');

  title.textContent = `Struk: ${session.title}`;

  const dateStr = new Date(session.date).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  let itemsHtml = '';
  (session.items || []).forEach(item => {
    const line = calculateLineTotal(item);
    itemsHtml += `
      <div class="receipt-row">
        <div>
          <div style="font-weight: 700; color: var(--text-primary);">${item.name}</div>
          <div style="font-size: 10px; color: var(--text-muted);">
            ${item.qty} ${item.unit || 'pcs'} × ${formatRupiah(line.finalUnitPrice)}
            ${line.lineSavings > 0 ? `(Diskon ${line.discountLabel})` : ''}
          </div>
        </div>
        <div style="font-weight: 800; color: var(--text-primary);">${formatRupiah(line.lineTotal)}</div>
      </div>
    `;
  });

  body.innerHTML = `
    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
      Tanggal: ${dateStr}
    </div>
    <div class="receipt-table">
      ${itemsHtml}
    </div>
    <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-medium); display: flex; justify-content: space-between; align-items: baseline;">
      <span style="font-weight: 700; color: var(--text-secondary);">Total Akhir:</span>
      <span style="font-size: 20px; font-weight: 800; color: #34d399;">${formatRupiah(session.totalSpent)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 4px;">
      <span>Batas Anggaran: ${formatRupiah(session.budgetLimit)}</span>
      <span>Hemat: ${formatRupiah(session.totalSavings || 0)}</span>
    </div>
  `;

  backdrop.classList.add('active');
  backdrop.setAttribute('aria-hidden', 'false');
  refreshIcons();
}

function closeReceiptModal() {
  playTap();
  const backdrop = document.getElementById('modal-receipt-backdrop');
  backdrop.classList.remove('active');
  backdrop.setAttribute('aria-hidden', 'true');
}

/* ==========================================================================
   Checkout Cart Flow (F-06 Selesaikan & Simpan Belanja)
   ========================================================================== */
function handleCheckoutSession() {
  if (state.cart.length === 0) {
    showToast('Troli masih kosong! Tambahkan barang terlebih dahulu.', 'alert-triangle');
    return;
  }

  const summary = calculateCartSummary(state.cart, state.budget);

  // Trigger celebration confetti!
  if (window.confetti) {
    window.confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  playCheckout();
  vibrate([100, 50, 100, 50, 150]);

  // Save session into DB (F-06)
  const savedSession = DB.checkoutCartSession({
    budgetLimit: state.budget,
    items: state.cart,
    summary
  });

  // Clear local cart
  state.cart = [];
  closeShopOptionsModal();

  renderCartItems();
  renderSafetyCap();
  renderHistoryScreen();
  renderAnggaranScreen();
  renderMostFrequentlyBought();

  // Switch to Riwayat tab to view saved session
  switchTab('riwayat');
  showToast(`🎉 Belanja selesai! Tersimpan ke Riwayat & acuan harga bulan depan.`, 'sparkles');
}

/* ==========================================================================
   Tab Navigation Handler
   ========================================================================== */
function switchTab(tabName) {
  playTap();
  state.activeTab = tabName;

  // Update bottom nav buttons
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab screens
  document.querySelectorAll('.tab-screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === `tab-screen-${tabName}`);
  });

  if (tabName === 'belanja') {
    renderCartItems();
    renderMostFrequentlyBought();
  } else if (tabName === 'riwayat') {
    renderHistoryScreen();
  } else if (tabName === 'anggaran') {
    renderAnggaranScreen();
  }

  refreshIcons();
}

/* ==========================================================================
   Color Theme System Controls (Requirement 3)
   ========================================================================== */
function updateThemeUI(themeInfo) {
  const currentSetting = getCurrentThemeSetting();
  const label = document.getElementById('active-theme-label');
  const iconTheme = document.getElementById('icon-theme');

  if (label) {
    if (currentSetting === 'system') {
      label.textContent = 'System Default';
    } else if (currentSetting === 'light') {
      label.textContent = 'Light Mode (Baby Blue)';
    } else {
      label.textContent = 'Dark Mode (Midnight)';
    }
  }

  if (iconTheme) {
    const resolved = getResolvedTheme();
    iconTheme.setAttribute('data-lucide', resolved === 'light' ? 'sun' : 'moon');
    refreshIcons();
  }

  // Update active state in settings grid
  document.querySelectorAll('.theme-option-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeChoice === currentSetting);
  });
}

function handleToggleQuickTheme() {
  playTap();
  const current = getCurrentThemeSetting();
  let next = 'light';
  if (current === 'light') next = 'dark';
  else if (current === 'dark') next = 'system';
  else next = 'light';

  applyTheme(next);
  updateThemeUI();
  showToast(`Tema diubah: ${next === 'system' ? 'System Default' : next === 'light' ? 'Light (Baby Blue)' : 'Dark (Midnight)'}`, 'palette');
}

/* ==========================================================================
   User Profile & Authentication System UI (Requirement 1)
   ========================================================================== */
function updateAuthUI(user) {
  const avatarEl = document.getElementById('header-avatar-initials');
  const sheetAvatarEl = document.getElementById('profile-sheet-avatar');
  const sheetNameEl = document.getElementById('profile-sheet-name');
  const sheetEmailEl = document.getElementById('profile-sheet-email');
  const sheetRoleEl = document.getElementById('profile-sheet-role');
  const sheetProviderBadge = document.getElementById('profile-sheet-provider-badge');

  if (!user) return;

  const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
  if (avatarEl) avatarEl.textContent = initial;
  if (sheetAvatarEl) sheetAvatarEl.textContent = initial;
  if (sheetNameEl) sheetNameEl.textContent = user.name || 'Pengguna';
  if (sheetEmailEl) sheetEmailEl.textContent = user.email || user.phone || 'Tersambung';
  if (sheetRoleEl) sheetRoleEl.textContent = user.role || 'Member';
  if (sheetProviderBadge) {
    sheetProviderBadge.textContent = user.provider ? user.provider.toUpperCase() : 'AUTH';
  }
}

function openProfileModal() {
  playTap();
  const backdrop = document.getElementById('modal-profile-backdrop');
  if (backdrop) {
    updateThemeUI();
    backdrop.classList.add('active');
    backdrop.setAttribute('aria-hidden', 'false');
    refreshIcons();
  }
}

function closeProfileModal() {
  const backdrop = document.getElementById('modal-profile-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

function openAuthModal() {
  playTap();
  const backdrop = document.getElementById('modal-auth-backdrop');
  if (backdrop) {
    backdrop.classList.add('active');
    backdrop.setAttribute('aria-hidden', 'false');
    refreshIcons();
  }
}

function closeAuthModal() {
  const backdrop = document.getElementById('modal-auth-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
    if (state.phoneTimerInterval) {
      clearInterval(state.phoneTimerInterval);
      state.phoneTimerInterval = null;
    }
  }
}

function setAuthMethodTab(method) {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.authMethod === method);
  });

  document.getElementById('auth-pane-google').style.display = method === 'google' ? 'block' : 'none';
  document.getElementById('auth-pane-email').style.display = method === 'email' ? 'block' : 'none';
  document.getElementById('auth-pane-phone').style.display = method === 'phone' ? 'block' : 'none';
}

function startOtpCountdown(seconds = 60) {
  const secEl = document.getElementById('otp-seconds');
  const resendBtn = document.getElementById('btn-resend-otp');
  let remaining = seconds;

  if (resendBtn) resendBtn.disabled = true;
  if (secEl) secEl.textContent = remaining;

  if (state.phoneTimerInterval) clearInterval(state.phoneTimerInterval);

  state.phoneTimerInterval = setInterval(() => {
    remaining -= 1;
    if (secEl) secEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(state.phoneTimerInterval);
      state.phoneTimerInterval = null;
      if (resendBtn) resendBtn.disabled = false;
    }
  }, 1000);
}

/* ==========================================================================
   PWA & Service Worker Registration
   ========================================================================== */
function registerPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('PWA Service Worker registered:', reg.scope);
      }).catch((err) => {
        console.warn('PWA SW registration failed:', err);
      });
    });
  }

  // Handle BeforeInstallPrompt
  const installBtn = document.getElementById('btn-pwa-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    if (installBtn) {
      installBtn.classList.add('show');
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      const { outcome } = await state.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('Aplikasi berhasil dipasang ke layar utama!', 'check-circle');
      }
      state.deferredInstallPrompt = null;
      installBtn.classList.remove('show');
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.classList.remove('show');
    showToast('Smart Grocery siap dipakai offline!', 'check');
  });
}

/* ==========================================================================
   Setup Global Event Listeners
   ========================================================================== */
function setupEventListeners() {
  // Navigation Tabs
  document.getElementById('nav-tab-belanja').addEventListener('click', () => switchTab('belanja'));
  document.getElementById('nav-tab-riwayat').addEventListener('click', () => switchTab('riwayat'));
  document.getElementById('nav-tab-anggaran').addEventListener('click', () => switchTab('anggaran'));

  // Requirement 4: Center Floating Add Button opens Dual-Option Choice Modal
  document.getElementById('btn-floating-add-item').addEventListener('click', () => openDualAddModal());

  // Requirement 5: Pinned "Shop Options" button
  document.getElementById('btn-nav-shop-options').addEventListener('click', () => openShopOptionsModal());

  // Dual-Option modal listeners
  document.getElementById('btn-choice-manual').addEventListener('click', () => {
    closeDualAddModal();
    openItemModal();
  });
  document.getElementById('btn-choice-scanner').addEventListener('click', () => {
    closeDualAddModal();
    openScannerModal();
  });
  document.getElementById('btn-close-dual-add-modal').addEventListener('click', closeDualAddModal);
  document.getElementById('modal-dual-add-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-dual-add-backdrop') closeDualAddModal();
  });

  // Scanner modal listeners
  document.getElementById('btn-close-scanner-modal').addEventListener('click', closeScannerModal);
  document.getElementById('modal-scanner-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-scanner-backdrop') closeScannerModal();
  });
  document.getElementById('btn-toggle-torch').addEventListener('click', async () => {
    const isOn = await toggleTorch();
    document.getElementById('torch-label').textContent = isOn ? 'Senter (Aktif)' : 'Senter';
    showToast(isOn ? 'Senter kamera menyala' : 'Senter mati', 'zap');
  });

  // Barcode test chips (Simulator)
  document.querySelectorAll('.barcode-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const barcode = chip.dataset.barcode;
      handleDetectedBarcode(barcode, handleScannedProduct);
    });
  });

  // Hard Budget Limit Warning Modal Listeners (Requirement 6)
  document.getElementById('btn-close-hard-budget-modal').addEventListener('click', closeHardBudgetAlertModal);
  document.getElementById('btn-hard-budget-cancel').addEventListener('click', closeHardBudgetAlertModal);
  document.getElementById('modal-hard-budget-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-hard-budget-backdrop') closeHardBudgetAlertModal();
  });

  document.getElementById('btn-hard-budget-adjust').addEventListener('click', () => {
    const btn = document.getElementById('btn-hard-budget-suggest-limit');
    const suggested = Number(btn.dataset.suggestedLimit) || (state.budget + 50000);
    const pending = getPendingBlockedAction();
    closeHardBudgetAlertModal();
    if (pending && typeof pending.onAdjustBudget === 'function') {
      pending.onAdjustBudget(suggested);
    } else {
      saveBudget(suggested);
    }
  });

  document.getElementById('btn-hard-budget-remove-item').addEventListener('click', () => {
    closeHardBudgetAlertModal();
    openRemoveItemModal();
  });

  // Remove Item Modal Listeners
  document.getElementById('btn-close-remove-item-modal').addEventListener('click', closeRemoveItemModal);
  document.getElementById('modal-remove-item-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-remove-item-backdrop') closeRemoveItemModal();
  });

  const removeItemContainer = document.getElementById('remove-item-cart-list');
  if (removeItemContainer) {
    removeItemContainer.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-action="quick-remove-budget"]');
      if (delBtn) {
        playTap();
        const id = delBtn.dataset.itemId;
        const item = state.cart.find(i => i.id === id);
        if (item) {
          state.cart = state.cart.filter(i => i.id !== id);
          DB.saveCartItems(state.cart);
          renderCartItems();
          renderSafetyCap();
          renderAnggaranScreen();
          closeRemoveItemModal();
          showToast(`"${item.name}" dikeluarkan dari troli untuk membebaskan budget.`, 'check');
        }
      }
    });
  }

  // Shop Options Sheet Listeners (Requirement 5)
  document.getElementById('btn-close-shop-options-modal').addEventListener('click', closeShopOptionsModal);
  document.getElementById('modal-shop-options-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-shop-options-backdrop') closeShopOptionsModal();
  });
  document.getElementById('btn-shop-options-checkout').addEventListener('click', () => {
    closeShopOptionsModal();
    handleCheckoutSession();
  });

  // Price Trend Popover Listeners (Requirement 7)
  document.getElementById('btn-close-price-trend-modal').addEventListener('click', closePriceTrendModal);
  document.getElementById('modal-price-trend-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-price-trend-backdrop') closePriceTrendModal();
  });

  // Most Frequently Bought Toggle
  const toggleMbBtn = document.getElementById('btn-toggle-most-bought');
  if (toggleMbBtn) {
    toggleMbBtn.addEventListener('click', () => {
      playTap();
      state.isMostBoughtCollapsed = !state.isMostBoughtCollapsed;
      const carousel = document.getElementById('most-bought-carousel-container');
      const icon = document.getElementById('icon-toggle-most-bought');
      if (carousel) carousel.style.display = state.isMostBoughtCollapsed ? 'none' : 'flex';
      if (icon) icon.setAttribute('data-lucide', state.isMostBoughtCollapsed ? 'chevron-down' : 'chevron-up');
      refreshIcons();
    });
  }

  // Most Frequently Bought delegation (1-Tap Re-Add & View Trend)
  const mbContainer = document.getElementById('most-bought-carousel-container');
  if (mbContainer) {
    mbContainer.addEventListener('click', (e) => {
      const readdBtn = e.target.closest('[data-action="readd-item"]');
      if (readdBtn) {
        const product = {
          name: readdBtn.dataset.itemName,
          price: Number(readdBtn.dataset.itemPrice) || 0,
          category: readdBtn.dataset.itemCat || 'Sembako',
          unit: readdBtn.dataset.itemUnit || 'pcs'
        };
        handleOneTapReAdd(product);
        return;
      }

      const trendTrigger = e.target.closest('[data-action="view-trend"]');
      if (trendTrigger) {
        const name = trendTrigger.dataset.itemName;
        const price = Number(trendTrigger.dataset.itemPrice) || 0;
        openPriceTrendModal(name, price, state.history);
        return;
      }
    });
  }

  // Theme Switcher Quick Header Button & Settings
  const themeBtn = document.getElementById('btn-toggle-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', handleToggleQuickTheme);
  }

  document.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      playTap();
      const choice = btn.dataset.themeChoice;
      applyTheme(choice);
      updateThemeUI();
      showToast(`Tema diterapkan: ${choice === 'system' ? 'System Default' : choice === 'light' ? 'Light (Baby Blue)' : 'Dark (Midnight)'}`, 'palette');
    });
  });

  // User Profile & Authentication Listeners (Requirement 1)
  document.getElementById('btn-open-profile-modal').addEventListener('click', openProfileModal);
  document.getElementById('btn-close-profile-modal').addEventListener('click', closeProfileModal);
  document.getElementById('modal-profile-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-profile-backdrop') closeProfileModal();
  });

  document.getElementById('btn-force-cloud-sync').addEventListener('click', () => {
    playTap();
    DB.triggerCloudSync();
    showToast('Data disinkronkan ke Cloud Firestore!', 'cloud');
  });

  document.getElementById('btn-trigger-switch-account').addEventListener('click', () => {
    closeProfileModal();
    openAuthModal();
  });

  document.getElementById('btn-trigger-signout').addEventListener('click', () => {
    playTap();
    signOutUser();
    closeProfileModal();
    showToast('Berhasil keluar akun. Menggunakan profil Tamu.', 'log-out');
  });

  // Auth Modal Listeners
  document.getElementById('btn-close-auth-modal').addEventListener('click', closeAuthModal);
  document.getElementById('modal-auth-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-auth-backdrop') closeAuthModal();
  });

  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playTap();
      setAuthMethodTab(btn.dataset.authMethod);
    });
  });

  // Google OAuth SSO Button
  document.getElementById('btn-google-oauth-login').addEventListener('click', async () => {
    playTap();
    try {
      const user = await signInWithGoogle();
      closeAuthModal();
      DB.triggerCloudSync();
      showToast(`Selamat datang, ${user.name}!`, 'check-circle');
    } catch (err) {
      showToast(err.message, 'alert-circle');
    }
  });

  // Email Sign In / Sign Up toggles
  const btnEmailLogin = document.getElementById('btn-email-mode-login');
  const btnEmailSignup = document.getElementById('btn-email-mode-signup');
  const groupSignupName = document.getElementById('group-signup-name');
  const emailSubmitLabel = document.getElementById('btn-email-submit-label');

  btnEmailLogin.addEventListener('click', () => {
    playTap();
    state.emailAuthMode = 'login';
    btnEmailLogin.classList.add('active');
    btnEmailSignup.classList.remove('active');
    groupSignupName.style.display = 'none';
    emailSubmitLabel.textContent = 'Masuk Sekarang';
  });

  btnEmailSignup.addEventListener('click', () => {
    playTap();
    state.emailAuthMode = 'signup';
    btnEmailSignup.classList.add('active');
    btnEmailLogin.classList.remove('active');
    groupSignupName.style.display = 'block';
    emailSubmitLabel.textContent = 'Daftar Akun Baru';
  });

  // Email Submit
  document.getElementById('btn-submit-email-auth').addEventListener('click', async () => {
    playTap();
    const email = document.getElementById('auth-email-input').value;
    const pwd = document.getElementById('auth-password-input').value;
    const name = document.getElementById('auth-email-name').value;
    const errorEl = document.getElementById('auth-email-error-msg');
    errorEl.style.display = 'none';

    try {
      let user;
      if (state.emailAuthMode === 'signup') {
        user = await signUpWithEmail(name, email, pwd);
      } else {
        user = await signInWithEmail(email, pwd);
      }
      closeAuthModal();
      DB.triggerCloudSync();
      showToast(`Berhasil masuk sebagai ${user.name}!`, 'check-circle');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      vibrate([50]);
    }
  });

  // Forgot Password Dialog
  document.getElementById('btn-forgot-password-link').addEventListener('click', () => {
    playTap();
    document.getElementById('modal-forgot-password-backdrop').classList.add('active');
  });

  document.getElementById('btn-close-forgot-pwd-modal').addEventListener('click', () => {
    document.getElementById('modal-forgot-password-backdrop').classList.remove('active');
  });

  document.getElementById('btn-submit-forgot-pwd').addEventListener('click', async () => {
    playTap();
    const email = document.getElementById('input-forgot-email').value;
    try {
      const res = await requestPasswordReset(email);
      document.getElementById('modal-forgot-password-backdrop').classList.remove('active');
      showToast(res.message, 'mail');
    } catch (err) {
      showToast(err.message, 'alert-circle');
    }
  });

  // Phone Number SMS OTP Handlers
  document.getElementById('btn-send-phone-otp').addEventListener('click', async () => {
    playTap();
    const phoneInput = document.getElementById('auth-phone-input').value;
    const fullPhone = '+62' + phoneInput.replace(/[^0-9]/g, '');

    try {
      const res = await sendPhoneOTP(fullPhone);
      state.pendingPhoneTarget = res.phone;
      document.getElementById('otp-target-phone').textContent = res.phone;
      document.getElementById('phone-step-input').style.display = 'none';
      document.getElementById('phone-step-verify').style.display = 'block';
      startOtpCountdown(60);

      // Focus first otp box
      const firstOtp = document.querySelector('.otp-box');
      if (firstOtp) firstOtp.focus();

      showToast(`SMS OTP dikirim! (Simulasi Kode: ${res.demoCode})`, 'message-square');
    } catch (err) {
      showToast(err.message, 'alert-circle');
    }
  });

  document.getElementById('btn-resend-otp').addEventListener('click', async () => {
    playTap();
    try {
      const res = await sendPhoneOTP(state.pendingPhoneTarget);
      startOtpCountdown(60);
      showToast(`Kode baru dikirim! (Simulasi: ${res.demoCode})`, 'message-square');
    } catch (err) {
      showToast(err.message, 'alert-circle');
    }
  });

  // Auto-advance OTP inputs
  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      if (box.value.length === 1 && idx < otpBoxes.length - 1) {
        otpBoxes[idx + 1].focus();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        otpBoxes[idx - 1].focus();
      }
    });
  });

  document.getElementById('btn-verify-phone-otp').addEventListener('click', async () => {
    playTap();
    let code = '';
    otpBoxes.forEach(b => code += b.value);
    const errorEl = document.getElementById('auth-phone-error-msg');
    errorEl.style.display = 'none';

    try {
      const user = await verifyPhoneOTP(state.pendingPhoneTarget, code);
      closeAuthModal();
      DB.triggerCloudSync();
      showToast(`Nomor HP terverifikasi! Selamat datang, ${user.name}.`, 'check-circle');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      vibrate([50]);
    }
  });

  // Sound toggle button
  const soundBtn = document.getElementById('btn-toggle-sound');
  const soundIcon = document.getElementById('icon-sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const enabled = toggleSound();
      if (soundIcon) {
        soundIcon.setAttribute('data-lucide', enabled ? 'volume-2' : 'volume-x');
        refreshIcons();
      }
      showToast(enabled ? 'Efek Suara Aktif' : 'Efek Suara Dibisukan', enabled ? 'volume-2' : 'volume-x');
    });
  }

  // Budget Limit Edit triggers
  document.getElementById('btn-open-budget-modal').addEventListener('click', openBudgetModal);
  document.getElementById('btn-edit-limit-quick').addEventListener('click', openBudgetModal);
  document.getElementById('btn-close-budget-modal').addEventListener('click', closeBudgetModal);
  document.getElementById('modal-budget-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-budget-backdrop') closeBudgetModal();
  });

  // Save budget from modal
  document.getElementById('btn-save-modal-budget').addEventListener('click', () => {
    const val = Number(document.getElementById('input-modal-budget-limit').value) || 0;
    if (val <= 0) {
      showToast('Masukkan nominal batas anggaran valid!', 'alert-circle');
      return;
    }
    saveBudget(val);
    closeBudgetModal();
  });

  // Modal budget preset chips
  document.querySelectorAll('[data-modal-budget]').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = Number(btn.dataset.modalBudget);
      document.getElementById('input-modal-budget-limit').value = b;
    });
  });

  // Save budget from Anggaran Tab page
  document.getElementById('btn-save-page-budget').addEventListener('click', () => {
    const val = Number(document.getElementById('input-page-budget-cap').value) || 0;
    if (val <= 0) {
      showToast('Masukkan nominal batas anggaran valid!', 'alert-circle');
      return;
    }
    saveBudget(val);
  });

  // Page budget preset chips
  document.querySelectorAll('[data-budget]').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = Number(btn.dataset.budget);
      document.getElementById('input-page-budget-cap').value = b;
    });
  });

  // Category filter chips in Belanja Tab
  document.querySelectorAll('#cart-category-chips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      playTap();
      document.querySelectorAll('#cart-category-chips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.category;
      renderCartItems();
    });
  });

  // Item Modal Listeners
  document.getElementById('btn-close-item-modal').addEventListener('click', closeItemModal);
  document.getElementById('modal-item-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-item-backdrop') closeItemModal();
  });
  document.getElementById('btn-submit-item-modal').addEventListener('click', handleSaveItemFromModal);

  // Modal Qty buttons
  document.getElementById('btn-modal-qty-minus').addEventListener('click', () => {
    playTap();
    const input = document.getElementById('item-field-qty');
    const val = Math.max(1, (Number(input.value) || 1) - 1);
    input.value = val;
    updateModalCalculations();
  });
  document.getElementById('btn-modal-qty-plus').addEventListener('click', () => {
    playTap();
    const input = document.getElementById('item-field-qty');
    const val = (Number(input.value) || 1) + 1;
    input.value = val;
    updateModalCalculations();
  });

  // Realtime inputs trigger recalculation (F-02, F-03, F-04)
  document.getElementById('item-field-name').addEventListener('input', updateModalCalculations);
  document.getElementById('item-field-price').addEventListener('input', updateModalCalculations);
  document.getElementById('item-field-qty').addEventListener('input', updateModalCalculations);
  document.getElementById('input-disc-percent').addEventListener('input', updateModalCalculations);
  document.getElementById('input-disc-tier1').addEventListener('input', updateModalCalculations);
  document.getElementById('input-disc-tier2').addEventListener('input', updateModalCalculations);
  document.getElementById('input-disc-nominal').addEventListener('input', updateModalCalculations);

  // Discount Segmented Tabs
  document.querySelectorAll('.disc-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playTap();
      setDiscountType(btn.dataset.discType);
    });
  });

  // Preset Stacked Discounts [50% + 20%], [30% + 10%]
  document.querySelectorAll('.preset-disc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playTap();
      const t1 = Number(btn.dataset.tier1);
      const t2 = Number(btn.dataset.tier2);
      document.getElementById('input-disc-tier1').value = t1;
      document.getElementById('input-disc-tier2').value = t2;
      state.currentDiscountConfig.tier1 = t1;
      state.currentDiscountConfig.tier2 = t2;
      updateModalCalculations();
    });
  });

  // Autocomplete suggestion chips in Add modal
  document.querySelectorAll('#autocomplete-chips-row .sugg-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      playTap();
      document.getElementById('item-field-name').value = chip.dataset.fill;
      document.getElementById('item-field-category').value = chip.dataset.cat;
      document.getElementById('item-field-unit').value = chip.dataset.unit;
      document.getElementById('item-field-price').value = chip.dataset.price;
      updateModalCalculations();
    });
  });

  // Cart item & Shop options delegation (Check, Qty +/- stepper, Trend Popover, Edit, Delete)
  const handleItemDelegation = (e) => {
    // 1. View Historical Price Trend
    const trendTrigger = e.target.closest('[data-action="view-trend"]');
    if (trendTrigger) {
      const name = trendTrigger.dataset.itemName;
      const price = Number(trendTrigger.dataset.itemPrice) || 0;
      openPriceTrendModal(name, price, state.history);
      return;
    }

    // 2. Toggle check in cart
    const checkBtn = e.target.closest('[data-action="toggle-check"]');
    if (checkBtn) {
      playTap();
      const id = checkBtn.dataset.itemId;
      const item = state.cart.find(i => i.id === id);
      if (item) {
        item.checked = !item.checked;
        DB.saveCartItems(state.cart);
        renderCartItems();
        renderSafetyCap();
      }
      return;
    }

    // 3. Qty Minus stepper
    const minusBtn = e.target.closest('[data-action="qty-minus"]');
    if (minusBtn) {
      playTap();
      const id = minusBtn.dataset.itemId;
      const item = state.cart.find(i => i.id === id);
      if (item) {
        if (item.qty > 1) {
          item.qty -= 1;
        } else {
          // If 1, remove item
          state.cart = state.cart.filter(i => i.id !== id);
          showToast(`"${item.name}" dihapus dari troli`, 'trash');
        }
        DB.saveCartItems(state.cart);
        renderCartItems();
        renderSafetyCap();
        renderAnggaranScreen();
      }
      return;
    }

    // 4. Qty Plus stepper (Hard Budget Limit Enforced)
    const plusBtn = e.target.closest('[data-action="qty-plus"]');
    if (plusBtn) {
      playTap();
      const id = plusBtn.dataset.itemId;
      const item = state.cart.find(i => i.id === id);
      if (item) {
        const line = calculateLineTotal(item);
        const incrementalCost = line.finalUnitPrice;

        // Check Hard Budget constraint
        const check = checkBudgetLimitEnforcement({
          currentCart: state.cart,
          budgetLimit: state.budget,
          itemPrice: incrementalCost,
          qty: 1,
          itemName: item.name
        });

        if (!check.allowed) {
          showHardBudgetAlertModal(check, {
            onAdjustBudget: (suggestedLimit) => {
              saveBudget(suggestedLimit);
              item.qty = (item.qty || 1) + 1;
              DB.saveCartItems(state.cart);
              renderCartItems();
              renderSafetyCap();
              renderAnggaranScreen();
            },
            onRemoveItem: () => openRemoveItemModal()
          });
          return;
        }

        item.qty = (item.qty || 1) + 1;
        DB.saveCartItems(state.cart);
        renderCartItems();
        renderSafetyCap();
        renderAnggaranScreen();
      }
      return;
    }

    // 5. Edit item
    const editBtn = e.target.closest('[data-action="edit-item"]');
    if (editBtn) {
      const id = editBtn.dataset.itemId;
      openItemModal(id);
      return;
    }

    // 6. Delete item
    const delBtn = e.target.closest('[data-action="delete-item"]');
    if (delBtn) {
      playTap();
      const id = delBtn.dataset.itemId;
      const item = state.cart.find(i => i.id === id);
      if (item) {
        state.cart = state.cart.filter(i => i.id !== id);
        DB.saveCartItems(state.cart);
        renderCartItems();
        renderSafetyCap();
        renderAnggaranScreen();
        showToast(`"${item.name}" dihapus dari troli`, 'trash-2');
      }
      return;
    }
  };

  const cartContainer = document.getElementById('cart-items-container');
  if (cartContainer) cartContainer.addEventListener('click', handleItemDelegation);

  const shopOptionsCart = document.getElementById('shop-options-cart-items-container');
  if (shopOptionsCart) shopOptionsCart.addEventListener('click', handleItemDelegation);

  // Checkout Session Button (F-06)
  document.getElementById('btn-checkout-session').addEventListener('click', handleCheckoutSession);

  // Clear Trolley Button
  document.getElementById('btn-clear-cart').addEventListener('click', () => {
    if (state.cart.length === 0) return;
    if (confirm('Kosongkan semua barang dari troli belanja?')) {
      playTap();
      state.cart = [];
      DB.saveCartItems([]);
      renderCartItems();
      renderSafetyCap();
      renderAnggaranScreen();
      showToast('Troli telah dikosongkan', 'trash');
    }
  });

  // Reset Sample data button for students (Rian Simulation: Juli, Ags, Des)
  const handleReloadSimulation = () => {
    playTap();
    const result = DB.resetAllData();
    state.cart = result.cart;
    state.budget = result.budget;
    state.history = result.history;
    renderCartItems();
    renderSafetyCap();
    renderHistoryScreen();
    renderAnggaranScreen();
    renderMostFrequentlyBought();
    showToast('Simulasi data Rian (Juli, Ags, Des) berhasil dimuat!', 'refresh-cw');
  };

  const btnLoadSample = document.getElementById('btn-load-sample');
  if (btnLoadSample) btnLoadSample.addEventListener('click', handleReloadSimulation);

  const btnLoadSampleHistory = document.getElementById('btn-load-sample-history');
  if (btnLoadSampleHistory) btnLoadSampleHistory.addEventListener('click', handleReloadSimulation);

  // History Tab delegator (View Receipt, Copy to Cart)
  const historyContainer = document.getElementById('history-sessions-container');
  historyContainer.addEventListener('click', (e) => {
    const receiptBtn = e.target.closest('[data-action="view-receipt"]');
    if (receiptBtn) {
      const id = receiptBtn.dataset.sessionId;
      openReceiptModal(id);
      return;
    }

    const copyBtn = e.target.closest('[data-action="copy-to-cart"]');
    if (copyBtn) {
      playTap();
      const id = copyBtn.dataset.sessionId;
      const session = DB.getHistorySessions().find(s => s.id === id);
      if (session && Array.isArray(session.items)) {
        // Clone items with new IDs
        const copiedItems = session.items.map(item => ({
          ...item,
          id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          checked: false
        }));

        state.cart = [...state.cart, ...copiedItems];
        DB.saveCartItems(state.cart);
        renderCartItems();
        renderSafetyCap();
        renderAnggaranScreen();
        switchTab('belanja');
        showToast(`${copiedItems.length} barang disalin ke troli!`, 'copy');
      }
      return;
    }
  });

  // Receipt Modal close
  document.getElementById('btn-close-receipt-modal').addEventListener('click', closeReceiptModal);
  document.getElementById('modal-receipt-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-receipt-backdrop') closeReceiptModal();
  });

  // Export & Import Backup (JSON)
  document.getElementById('btn-export-backup').addEventListener('click', () => {
    playTap();
    const backupData = {
      cart: DB.getCartItems(),
      budget: DB.getBudgetLimit(),
      history: DB.getHistorySessions(),
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-grocery-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Cadangan data berhasil diunduh!', 'download');
  });

  const importInput = document.getElementById('input-import-backup');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed.history) DB.saveHistorySessions(parsed.history);
          if (parsed.budget) DB.saveBudgetLimit(parsed.budget);
          if (parsed.cart) DB.saveCartItems(parsed.cart);

          state.cart = DB.getCartItems();
          state.budget = DB.getBudgetLimit();
          state.history = DB.getHistorySessions();

          renderCartItems();
          renderSafetyCap();
          renderHistoryScreen();
          renderAnggaranScreen();
          renderMostFrequentlyBought();
          showToast('Data berhasil dipulihkan!', 'check-circle');
        } catch (err) {
          showToast('Gagal memulihkan file cadangan!', 'alert-circle');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }
}

/* ==========================================================================
   App Initialization
   ========================================================================== */
function initApp() {
  updateClock();
  setInterval(updateClock, 30000);

  // Initialize Color Theme (Requirement 3: Dark Blue & Baby Blue)
  initTheme((themeInfo) => {
    updateThemeUI(themeInfo);
  });

  // Load from DB
  state.cart = DB.getCartItems();
  state.budget = DB.getBudgetLimit();
  state.history = DB.getHistorySessions();

  setupEventListeners();

  // Listen to Auth State (Requirement 1)
  onAuthStateChanged((user) => {
    updateAuthUI(user);
  });

  renderSafetyCap();
  renderCartItems();
  renderMostFrequentlyBought();
  renderAnggaranScreen();
  registerPWA();

  // Initialize Cloud Sync with Firestore
  DB.initCloudSync((remoteData) => {
    if (remoteData) {
      if (Array.isArray(remoteData.cart)) state.cart = remoteData.cart;
      if (remoteData.budgetLimit) state.budget = remoteData.budgetLimit;
      if (Array.isArray(remoteData.history)) state.history = remoteData.history;
      renderSafetyCap();
      renderCartItems();
      renderMostFrequentlyBought();
      renderAnggaranScreen();
      renderHistoryScreen();
      showToast('Data tersinkronisasi ke cloud!', 'cloud');
    }
  });

  refreshIcons();
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
