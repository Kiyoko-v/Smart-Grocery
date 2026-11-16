/**
 * Hard Budget Limit Protection Module
 * Enforces real-time protection: blocks adding products or increasing quantity
 * when the resulting cart total would exceed the user's budget limit.
 */

import { calculateCartSummary, formatRupiah, formatNumber } from './calculator.js';
import { playWarning, vibrate } from './audio.js';

let pendingBlockedAction = null;

/**
 * Check whether adding an item or increasing quantity exceeds the budget limit.
 * @returns {object} { allowed: boolean, currentTotal, incrementalCost, projectedTotal, budgetLimit, overageAmount, itemName, item }
 */
export function checkBudgetLimitEnforcement({ currentCart, budgetLimit, itemPrice, qty = 1, itemName = 'Barang', item = null }) {
  const summary = calculateCartSummary(currentCart, budgetLimit);
  const currentTotal = summary.totalSpent;
  const incrementalCost = Math.round(Math.max(0, Number(itemPrice) || 0) * Math.max(1, Number(qty) || 1));
  const projectedTotal = currentTotal + incrementalCost;
  const budget = Math.max(0, Number(budgetLimit) || 0);

  // If no budget limit is set (0), allow everything
  if (budget <= 0) {
    return {
      allowed: true,
      currentTotal,
      incrementalCost,
      projectedTotal,
      budgetLimit: budget,
      overageAmount: 0,
      itemName,
      item
    };
  }

  const isExceeded = projectedTotal > budget;
  const overageAmount = isExceeded ? (projectedTotal - budget) : 0;

  return {
    allowed: !isExceeded,
    currentTotal,
    incrementalCost,
    projectedTotal,
    budgetLimit: budget,
    overageAmount,
    itemName,
    item
  };
}

/**
 * Display the Hard Budget Warning Modal
 */
export function showHardBudgetAlertModal(result, { onAdjustBudget, onRemoveItem }) {
  playWarning();
  vibrate([100, 50, 100]);

  pendingBlockedAction = {
    result,
    onAdjustBudget,
    onRemoveItem
  };

  const backdrop = document.getElementById('modal-hard-budget-backdrop');
  if (!backdrop) return;

  const overageTextEl = document.getElementById('hard-budget-overage-text');
  const detailsBoxEl = document.getElementById('hard-budget-details-box');
  const suggestNewLimitBtn = document.getElementById('btn-hard-budget-suggest-limit');

  if (overageTextEl) {
    overageTextEl.innerHTML = `Batas anggaran tercapai! Menambahkan <strong>"${result.itemName}"</strong> melebihi batas dompetmu sebesar <span class="highlight-danger">${formatRupiah(result.overageAmount)}</span>.`;
  }

  if (detailsBoxEl) {
    detailsBoxEl.innerHTML = `
      <div class="budget-calc-row">
        <span>Batas Anggaran Dompet:</span>
        <span class="val-neutral">${formatRupiah(result.budgetLimit)}</span>
      </div>
      <div class="budget-calc-row">
        <span>Total Troli Saat Ini:</span>
        <span class="val-current">${formatRupiah(result.currentTotal)}</span>
      </div>
      <div class="budget-calc-row">
        <span>Harga Barang Baru:</span>
        <span class="val-cost">+${formatRupiah(result.incrementalCost)}</span>
      </div>
      <div class="budget-calc-row total-row">
        <span>Proyeksi Total:</span>
        <span class="val-projected">${formatRupiah(result.projectedTotal)}</span>
      </div>
      <div class="budget-calc-row deficit-row">
        <span>Kelebihan (Overage):</span>
        <span class="val-deficit">+${formatRupiah(result.overageAmount)}</span>
      </div>
    `;
  }

  // Calculate suggested new limit (round up to nearest 25k or 50k)
  const suggestedLimit = Math.ceil(result.projectedTotal / 25000) * 25000;
  if (suggestNewLimitBtn) {
    suggestNewLimitBtn.textContent = `Naikkan Batas ke ${formatRupiah(suggestedLimit)}`;
    suggestNewLimitBtn.dataset.suggestedLimit = suggestedLimit;
  }

  backdrop.classList.add('active');
  backdrop.setAttribute('aria-hidden', 'false');
}

/**
 * Close Hard Budget Warning Modal
 */
export function closeHardBudgetAlertModal() {
  const backdrop = document.getElementById('modal-hard-budget-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  pendingBlockedAction = null;
}

export function getPendingBlockedAction() {
  return pendingBlockedAction;
}
