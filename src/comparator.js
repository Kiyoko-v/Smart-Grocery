/**
 * Price Comparator Module (F-04)
 * Realtime comparison between current price and previous month's price
 */
import { formatNumber, formatRupiah } from './calculator.js';

/**
 * Normalize string for resilient lookup
 */
export function normalizeProductName(name = '') {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ');
}

/**
 * Compare current item price against history
 * @param {string} productName - Current item name
 * @param {number} currentPrice - Current entered price
 * @param {Array} historyItems - List of items from previous month(s)
 * @returns {object} Comparison result
 */
export function comparePriceWithHistory(productName, currentPrice, historyItems = []) {
  const normName = normalizeProductName(productName);
  const price = Math.max(0, Number(currentPrice) || 0);

  if (!normName || normName.length < 2) {
    return {
      status: 'none',
      hasHistory: false,
      text: 'Ketik nama & harga untuk cek riwayat',
      badgeClass: 'badge-neutral',
      icon: 'minus'
    };
  }

  // 1. Search exact or best matching item in history
  // Search from most recent history first
  let matchedItem = null;

  for (const hist of historyItems) {
    const histNorm = normalizeProductName(hist.name);
    if (histNorm === normName) {
      matchedItem = hist;
      break;
    }
  }

  // Fallback: Check if one contains the other if length is significant
  if (!matchedItem) {
    for (const hist of historyItems) {
      const histNorm = normalizeProductName(hist.name);
      if ((histNorm.includes(normName) || normName.includes(histNorm)) && Math.abs(histNorm.length - normName.length) < 6) {
        matchedItem = hist;
        break;
      }
    }
  }

  if (!matchedItem) {
    return {
      status: 'new',
      hasHistory: false,
      previousPrice: null,
      text: 'Item Baru (Belum ada catatan bulan lalu)',
      shortBadge: 'Baru ✨',
      badgeClass: 'badge-new',
      icon: 'sparkles',
      diffNominal: 0,
      diffPercent: 0,
      tip: 'Item belanja perdana! Akan tersimpan sebagai data acuan bulan depan.'
    };
  }

  const previousPrice = Number(matchedItem.price) || 0;
  if (previousPrice <= 0) {
    return {
      status: 'new',
      hasHistory: false,
      previousPrice: null,
      text: 'Item Baru',
      shortBadge: 'Baru',
      badgeClass: 'badge-new',
      icon: 'sparkles'
    };
  }

  const diffNominal = price - previousPrice;
  const diffPercent = Number(((diffNominal / previousPrice) * 100).toFixed(1));

  if (diffNominal > 0) {
    // Price Went Up: Panah Merah Naik (↑)
    return {
      status: 'up',
      hasHistory: true,
      previousPrice,
      diffNominal,
      diffPercent,
      icon: 'arrow-up-right',
      arrow: '↑',
      shortBadge: `↑ +${Math.abs(diffPercent)}%`,
      text: `↑ Naik Rp ${formatNumber(diffNominal)} (+${diffPercent}%) vs bln lalu (${formatRupiah(previousPrice)})`,
      badgeClass: 'badge-danger-up',
      tip: `Harga naik dibanding bulan lalu (${formatRupiah(previousPrice)}). Pertimbangkan merk alternatif jika ada!`
    };
  } else if (diffNominal < 0) {
    // Price Went Down: Panah Hijau Turun (↓)
    const absDiff = Math.abs(diffNominal);
    const absPercent = Math.abs(diffPercent);
    return {
      status: 'down',
      hasHistory: true,
      previousPrice,
      diffNominal,
      diffPercent,
      icon: 'arrow-down-right',
      arrow: '↓',
      shortBadge: `↓ -${absPercent}%`,
      text: `↓ Turun Rp ${formatNumber(absDiff)} (-${absPercent}%) vs bln lalu (${formatRupiah(previousPrice)})`,
      badgeClass: 'badge-success-down',
      tip: `Kabar baik! Harga lebih murah ${formatRupiah(absDiff)} dari bulan lalu. Rekomendasi belanja hemat.`
    };
  } else {
    // Price Equal: Tanda Setara (=)
    return {
      status: 'equal',
      hasHistory: true,
      previousPrice,
      diffNominal: 0,
      diffPercent: 0,
      icon: 'equal',
      arrow: '=',
      shortBadge: `= Tetap`,
      text: `= Stabil vs bln lalu (${formatRupiah(previousPrice)})`,
      badgeClass: 'badge-equal',
      tip: `Harga persis sama dengan bulan lalu (${formatRupiah(previousPrice)}). Tidak ada inflasi!`
    };
  }
}
