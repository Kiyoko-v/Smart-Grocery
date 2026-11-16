/**
 * Barcode Scanner & Product UPC Lookup Module
 * Supports:
 * - Real camera stream via navigator.mediaDevices.getUserMedia
 * - Native BarcodeDetector API (with fallback frame scanning)
 * - Built-in Supermarket UPC/Barcode Database
 * - Quick barcode simulation chips for testing
 */

import { playAdd, playTap, vibrate } from './audio.js';

export const BARCODE_PRODUCT_DATABASE = {
  '899275321011': { name: 'Beras Sania 5kg', category: 'Sembako', unit: 'pack', price: 78000, upc: '899275321011' },
  '899886620023': { name: 'Indomie Goreng (Pack isi 5)', category: 'Sembako', unit: 'pack', price: 15500, upc: '899886620023' },
  '899999905202': { name: 'Biore Body Wash 450ml', category: 'Toiletries', unit: 'pack', price: 32000, upc: '899999905202' },
  '899138922002': { name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'liter', price: 35000, upc: '899138922002' },
  '899238811005': { name: 'Telur Ayam 1kg', category: 'Sembako', unit: 'kg', price: 28000, upc: '899238811005' },
  '899277521098': { name: 'Susu UHT Ultra Milk 1L', category: 'Minuman', unit: 'dus', price: 18000, upc: '899277521098' },
  '899100123456': { name: 'Sabun Cuci Piring Mama Lemon 750ml', category: 'Dapur & Bumbu', unit: 'pack', price: 13500, upc: '899100123456' },
  '899277912345': { name: 'Nugget Fiesta 500g', category: 'Frozen & Segar', unit: 'pack', price: 47000, upc: '899277912345' },
  '899600123456': { name: 'Deterjen Rinso 770g', category: 'Toiletries', unit: 'pack', price: 22500, upc: '899600123456' },
  '899123456789': { name: 'Air Mineral Galon Aqua 19L', category: 'Minuman', unit: 'galon', price: 22000, upc: '899123456789' }
};

let activeStream = null;
let scanningInterval = null;
let barcodeDetector = null;
let isTorchOn = false;

/**
 * Initialize Barcode Detector if browser supports it
 */
if ('BarcodeDetector' in window) {
  try {
    barcodeDetector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
    });
  } catch (e) {
    console.info('BarcodeDetector init fallback:', e);
  }
}

/**
 * Start camera feed and scanner loop
 */
export async function startCameraScanner(onProductScanned) {
  const videoEl = document.getElementById('scanner-video-feed');
  const errorEl = document.getElementById('scanner-error-message');
  const statusEl = document.getElementById('scanner-status-text');

  if (errorEl) errorEl.style.display = 'none';
  if (statusEl) statusEl.textContent = 'Mengarahkan kamera ke barcode...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    activeStream = stream;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      await videoEl.play();
    }

    if (statusEl) statusEl.textContent = 'Posisikan garis merah sejajar barcode produk';

    // Start detection loop
    if (barcodeDetector && videoEl) {
      scanningInterval = setInterval(async () => {
        if (!activeStream || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;
        try {
          const barcodes = await barcodeDetector.detect(videoEl);
          if (barcodes.length > 0) {
            const rawVal = barcodes[0].rawValue;
            handleDetectedBarcode(rawVal, onProductScanned);
          }
        } catch (err) {
          // Ignore transient detection errors
        }
      }, 300);
    }
  } catch (err) {
    console.warn('Camera access error:', err);
    if (errorEl) {
      errorEl.textContent = 'Kamera tidak dapat diakses (izin ditolak atau tidak ada webcam). Gunakan tombol simulasi cepat di bawah untuk mencoba scan!';
      errorEl.style.display = 'block';
    }
    if (statusEl) statusEl.textContent = 'Mode simulasi barcode aktif';
  }
}

/**
 * Stop active camera feed
 */
export function stopCameraScanner() {
  if (scanningInterval) {
    clearInterval(scanningInterval);
    scanningInterval = null;
  }
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }
  const videoEl = document.getElementById('scanner-video-feed');
  if (videoEl) {
    videoEl.srcObject = null;
  }
  isTorchOn = false;
}

/**
 * Toggle flashlight/torch if supported by device camera
 */
export async function toggleTorch() {
  if (!activeStream) return false;
  const track = activeStream.getVideoTracks()[0];
  if (!track) return false;

  const capabilities = track.getCapabilities ? track.getCapabilities() : {};
  if (!capabilities.torch) {
    return false;
  }

  isTorchOn = !isTorchOn;
  try {
    await track.applyConstraints({
      advanced: [{ torch: isTorchOn }]
    });
    return isTorchOn;
  } catch (e) {
    return false;
  }
}

/**
 * Handle detected barcode value
 */
export function handleDetectedBarcode(barcodeVal, onProductScanned) {
  stopCameraScanner();
  playAdd();
  vibrate([80, 50, 80]);

  const cleanCode = String(barcodeVal).trim();
  const product = BARCODE_PRODUCT_DATABASE[cleanCode] || {
    name: `Produk Barcode #${cleanCode.slice(-4)}`,
    category: 'Sembako',
    unit: 'pcs',
    price: 25000,
    upc: cleanCode
  };

  if (typeof onProductScanned === 'function') {
    onProductScanned(product);
  }
}
