/**
 * Calculator module for Smart Grocery & Budget Safety Tracker
 * Implements F-02 (Perhitungan Kuantitas Otomatis) & F-03 (Kalkulator Diskon Bertingkat)
 */

/**
 * Calculate final price and savings given base price and discount configuration.
 * @param {number} basePrice - Raw unit price before discount
 * @param {object} discountConfig - { type: 'none'|'percent'|'stacked'|'nominal', percent: number, tier1: number, tier2: number, nominal: number }
 * @returns {object} calculation result
 */
export function calculateItemDiscount(basePrice, discountConfig = { type: 'none' }) {
  const price = Math.max(0, Number(basePrice) || 0);
  if (price === 0 || !discountConfig || discountConfig.type === 'none') {
    return {
      basePrice: price,
      finalUnitPrice: price,
      unitSavings: 0,
      effectivePercent: 0,
      discountLabel: 'Tidak ada diskon',
      steps: []
    };
  }

  if (discountConfig.type === 'percent') {
    const p = Math.min(100, Math.max(0, Number(discountConfig.percent) || 0));
    const savings = Math.round(price * (p / 100));
    const finalPrice = Math.max(0, price - savings);
    return {
      basePrice: price,
      finalUnitPrice: finalPrice,
      unitSavings: savings,
      effectivePercent: p,
      discountLabel: `${p}%`,
      steps: [
        { label: `Diskon ${p}%`, amount: savings, priceAfter: finalPrice }
      ]
    };
  }

  if (discountConfig.type === 'nominal') {
    const nom = Math.max(0, Number(discountConfig.nominal) || 0);
    const savings = Math.min(price, nom);
    const finalPrice = Math.max(0, price - savings);
    const effPercent = price > 0 ? Number(((savings / price) * 100).toFixed(1)) : 0;
    return {
      basePrice: price,
      finalUnitPrice: finalPrice,
      unitSavings: savings,
      effectivePercent: effPercent,
      discountLabel: `-Rp ${formatNumber(nom)}`,
      steps: [
        { label: `Potongan Langsung`, amount: savings, priceAfter: finalPrice }
      ]
    };
  }

  if (discountConfig.type === 'stacked') {
    const d1 = Math.min(100, Math.max(0, Number(discountConfig.tier1) || 0));
    const d2 = Math.min(100, Math.max(0, Number(discountConfig.tier2) || 0));

    // Step 1: Diskon pertama
    const savings1 = Math.round(price * (d1 / 100));
    const priceAfter1 = Math.max(0, price - savings1);

    // Step 2: Diskon kedua dihitung dari harga sisa step 1
    const savings2 = Math.round(priceAfter1 * (d2 / 100));
    const finalPrice = Math.max(0, priceAfter1 - savings2);

    const totalSavings = price - finalPrice;
    const effPercent = price > 0 ? Number(((totalSavings / price) * 100).toFixed(1)) : 0;

    return {
      basePrice: price,
      finalUnitPrice: finalPrice,
      unitSavings: totalSavings,
      effectivePercent: effPercent,
      discountLabel: `${d1}% + ${d2}%`,
      steps: [
        { label: `Diskon 1 (${d1}%)`, amount: savings1, priceAfter: priceAfter1 },
        { label: `Diskon 2 (${d2}% dari Rp ${formatNumber(priceAfter1)})`, amount: savings2, priceAfter: finalPrice }
      ]
    };
  }

  return {
    basePrice: price,
    finalUnitPrice: price,
    unitSavings: 0,
    effectivePercent: 0,
    discountLabel: 'Tidak ada',
    steps: []
  };
}

/**
 * Calculate line item total (Qty * finalUnitPrice)
 * F-02: Realtime Quantity Calculation
 */
export function calculateLineTotal(item) {
  const qty = Math.max(0, Number(item.qty) || 0);
  const basePrice = Math.max(0, Number(item.price) || 0);
  const disc = calculateItemDiscount(basePrice, item.discount);

  const lineSubtotal = Math.round(qty * basePrice);
  const lineTotal = Math.round(qty * disc.finalUnitPrice);
  const lineSavings = Math.round(qty * disc.unitSavings);

  return {
    qty,
    basePrice,
    finalUnitPrice: disc.finalUnitPrice,
    lineSubtotal,
    lineTotal,
    lineSavings,
    effectivePercent: disc.effectivePercent,
    discountLabel: disc.discountLabel,
    steps: disc.steps
  };
}

/**
 * Calculate totals for the entire grocery cart
 */
export function calculateCartSummary(items = [], budgetLimit = 0) {
  let totalSpent = 0;
  let totalSubtotal = 0;
  let totalSavings = 0;
  let totalItemsCount = 0;
  let checkedItemsCount = 0;

  const categoryTotals = {};

  items.forEach((item) => {
    const line = calculateLineTotal(item);
    totalSpent += line.lineTotal;
    totalSubtotal += line.lineSubtotal;
    totalSavings += line.lineSavings;
    totalItemsCount += (item.qty || 1);
    if (item.checked) {
      checkedItemsCount += 1;
    }

    const cat = item.category || 'Lain-lain';
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { spent: 0, count: 0 };
    }
    categoryTotals[cat].spent += line.lineTotal;
    categoryTotals[cat].count += (item.qty || 1);
  });

  const budget = Math.max(0, Number(budgetLimit) || 0);
  const remainingBudget = budget - totalSpent;
  const budgetUsagePercent = budget > 0 ? Number(((totalSpent / budget) * 100).toFixed(1)) : 0;

  // F-05: Safety Cap status logic
  // Safe: < 75%
  // Caution: 75% - 90%
  // Warning: 90% - 100%
  // Danger/Exceeded: > 100%
  let safetyStatus = 'safe'; // 'safe', 'caution', 'warning', 'danger'
  let safetyMessage = 'Anggaran belanja aman terjaga!';
  let safetyTone = 'success'; // for css colors

  if (budget <= 0) {
    safetyStatus = 'neutral';
    safetyMessage = 'Belum menetapkan batas anggaran dompet.';
    safetyTone = 'neutral';
  } else if (budgetUsagePercent > 100) {
    safetyStatus = 'danger';
    const overAmount = Math.abs(remainingBudget);
    safetyMessage = `🚨 OVER BUDGET Rp ${formatNumber(overAmount)}! Segera kurangi barang dari troli!`;
    safetyTone = 'danger';
  } else if (budgetUsagePercent >= 90) {
    safetyStatus = 'warning';
    safetyMessage = `⚠️ Kritis! Sisa anggaran kurang dari 10% (Rp ${formatNumber(remainingBudget)})!`;
    safetyTone = 'warning';
  } else if (budgetUsagePercent >= 75) {
    safetyStatus = 'caution';
    safetyMessage = `🟡 Hati-hati! Sudah terpakai ${budgetUsagePercent}% dari batas dompet.`;
    safetyTone = 'caution';
  } else {
    safetyStatus = 'safe';
    safetyMessage = `🟢 Aman! Tersisa Rp ${formatNumber(remainingBudget)} sisa uang dingin.`;
    safetyTone = 'safe';
  }

  return {
    totalSpent,
    totalSubtotal,
    totalSavings,
    totalItemsCount,
    checkedItemsCount,
    totalLines: items.length,
    budget,
    remainingBudget,
    budgetUsagePercent,
    safetyStatus,
    safetyMessage,
    safetyTone,
    categoryTotals
  };
}

/**
 * Format number to Indonesian Rupiah formatting
 */
export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toLocaleString('id-ID');
}

export function formatRupiah(num) {
  return `Rp ${formatNumber(num)}`;
}
