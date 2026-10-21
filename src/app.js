/**
 * Smart Grocery & Budget Safety Tracker - Core Application
 * Handles SRS Requirements F-01 through F-06
 */

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

// Global App State
const state = {
  cart: [],
  budget: 750000,
  history: [],
  activeTab: 'belanja',
  activeFilter: 'ALL',
  editingItemId: null,
  deferredInstallPrompt: null,
  currentDiscountConfig: { type: 'none', percent: 0, tier1: 50, tier2: 20, nominal: 0 }
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
  }, 2600);
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
}

/* ==========================================================================
   Render Troli Items (Belanja Screen)
   ========================================================================== */
function renderCartItems() {
  const container = document.getElementById('cart-items-container');
  if (!container) return;

  const comparativeHistory = DB.getComparativeHistoryItems();

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
      emptyAddBtn.addEventListener('click', () => openItemModal());
    }

    refreshIcons();
    return;
  }

  let html = '';

  filteredItems.forEach((item) => {
    const line = calculateLineTotal(item);
    // F-04: Compare price vs previous month
    const comp = comparePriceWithHistory(item.name, item.price, comparativeHistory);

    // Comparator badge HTML
    let compBadgeHtml = '';
    if (comp.status === 'up') {
      compBadgeHtml = `<span class="comparator-badge badge-danger-up" title="${comp.text}">
        <i data-lucide="arrow-up-right" style="width: 11px; height: 11px;"></i>
        <span>↑ +${Math.abs(comp.diffPercent)}%</span>
      </span>`;
    } else if (comp.status === 'down') {
      compBadgeHtml = `<span class="comparator-badge badge-success-down" title="${comp.text}">
        <i data-lucide="arrow-down-right" style="width: 11px; height: 11px;"></i>
        <span>↓ -${Math.abs(comp.diffPercent)}%</span>
      </span>`;
    } else if (comp.status === 'equal') {
      compBadgeHtml = `<span class="comparator-badge badge-equal" title="${comp.text}">
        <span>= Tetap</span>
      </span>`;
    } else if (comp.status === 'new') {
      compBadgeHtml = `<span class="comparator-badge badge-new" title="Item Baru">
        <i data-lucide="sparkles" style="width: 10px; height: 10px;"></i>
        <span>Baru</span>
      </span>`;
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
              <span class="final-unit-price">${formatRupiah(line.finalUnitPrice)}</span>
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
            <button class="btn-copy-history" style="color: #60a5fa; background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3);" data-action="copy-to-cart" data-session-id="${session.id}">
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
    'Toiletries': '#3b82f6',
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
    compMainMsg.innerHTML = `<span style="color: #60a5fa;">${comp.text}</span>`;
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
    titleEl.textContent = 'Tambah Barang ke Troli';
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

  if (state.editingItemId) {
    // Edit existing item
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
    // Add new item
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
          <div style="font-weight: 700; color: #fff;">${item.name}</div>
          <div style="font-size: 10px; color: var(--text-muted);">
            ${item.qty} ${item.unit || 'pcs'} × ${formatRupiah(line.finalUnitPrice)}
            ${line.lineSavings > 0 ? `(Diskon ${line.discountLabel})` : ''}
          </div>
        </div>
        <div style="font-weight: 800; color: #fff;">${formatRupiah(line.lineTotal)}</div>
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
  renderCartItems();
  renderSafetyCap();
  renderHistoryScreen();
  renderAnggaranScreen();

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
  } else if (tabName === 'riwayat') {
    renderHistoryScreen();
  } else if (tabName === 'anggaran') {
    renderAnggaranScreen();
  }

  refreshIcons();
}

/* ==========================================================================
   PWA & Service Worker Registration
   ========================================================================== */
function registerPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
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

  // Center Floating Add Button
  document.getElementById('btn-floating-add-item').addEventListener('click', () => openItemModal());

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

  // Cart item delegator (Check, Qty +/- stepper, Edit, Delete)
  const cartContainer = document.getElementById('cart-items-container');
  cartContainer.addEventListener('click', (e) => {
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

    const minusBtn = e.target.closest('[data-action="qty-minus"]');
    if (minusBtn) {
      playTap();
      const id = minusBtn.dataset.itemId;
      const item = state.cart.find(i => i.id === id);
      if (item) {
        if (item.qty > 1) {
          item.qty -= 1;
        } else {
          // If 1, ask to remove
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

    const plusBtn = e.target.closest('[data-action="qty-plus"]');
    if (plusBtn) {
      playTap();
      const id = plusBtn.dataset.itemId;
      const item = state.cart.find(i => i.id === id);
      if (item) {
        item.qty = (item.qty || 1) + 1;
        DB.saveCartItems(state.cart);
        renderCartItems();
        renderSafetyCap();
        renderAnggaranScreen();
      }
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-item"]');
    if (editBtn) {
      const id = editBtn.dataset.itemId;
      openItemModal(id);
      return;
    }

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
  });

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

  // Reset Sample data button for students
  document.getElementById('btn-load-sample').addEventListener('click', () => {
    playTap();
    const result = DB.resetAllData();
    state.cart = result.cart;
    state.budget = result.budget;
    state.history = result.history;
    renderCartItems();
    renderSafetyCap();
    renderHistoryScreen();
    renderAnggaranScreen();
    showToast('Data contoh anak rantau berhasil dimuat ulang!', 'refresh-cw');
  });

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
          showToast('Data berhasil dipulihkan!', 'check-circle');
        } catch (err) {
          showToast('Gagal memulihkan file cadangan!', 'alert-circle');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  // Cloud sync status pill click
  const cloudPill = document.getElementById('header-cloud-pill');
  if (cloudPill) {
    cloudPill.addEventListener('click', () => {
      playTap();
      const status = getFirebaseStatus();
      showToast(status.message, 'cloud');
    });
  }

  // Manual cloud sync button in Anggaran tab
  const btnSyncManual = document.getElementById('btn-sync-cloud-manual');
  if (btnSyncManual) {
    btnSyncManual.addEventListener('click', () => {
      playTap();
      DB.triggerCloudSync();
      const status = getFirebaseStatus();
      showToast(`Data disinkronkan ke ${status.label}!`, 'cloud');
    });
  }
}

function renderCloudStatus() {
  const status = getFirebaseStatus();
  const pill = document.getElementById('header-cloud-pill');
  const label = document.getElementById('cloud-pill-label');

  if (pill && label) {
    pill.className = `cloud-sync-pill ${status.connected ? 'online' : 'offline'}`;
    label.textContent = status.label;
    pill.title = status.message;
  }
}

/* ==========================================================================
   App Initialization
   ========================================================================== */
function initApp() {
  updateClock();
  setInterval(updateClock, 30000);

  // Load from DB
  state.cart = DB.getCartItems();
  state.budget = DB.getBudgetLimit();
  state.history = DB.getHistorySessions();

  setupEventListeners();
  renderSafetyCap();
  renderCartItems();
  renderAnggaranScreen();
  renderCloudStatus();
  registerPWA();

  // Initialize Cloud Sync with Firestore doc users/venetta
  DB.initCloudSync((remoteData) => {
    if (remoteData) {
      if (Array.isArray(remoteData.cart)) state.cart = remoteData.cart;
      if (remoteData.budgetLimit) state.budget = remoteData.budgetLimit;
      if (Array.isArray(remoteData.history)) state.history = remoteData.history;
      renderSafetyCap();
      renderCartItems();
      renderAnggaranScreen();
      renderHistoryScreen();
      renderCloudStatus();
      showToast('Data Cloud (users/venetta) tersinkronisasi!', 'cloud');
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
