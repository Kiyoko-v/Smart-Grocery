/**
 * Color Theme System Module
 * Supports:
 * - 'system': System Default (follows OS preference)
 * - 'light': Soft, clean Baby Blue (#87CEEB / #E0F2FE accent palette) with high-contrast, crisp readable elements
 * - 'dark': Deep Midnight / Dark Blue (#0F172A / #1E293B slate palette) for high contrast and modern visual depth
 */

const THEME_STORAGE_KEY = 'smart_grocery_theme_mode_v1';

let currentThemeSetting = 'system'; // 'system' | 'light' | 'dark'
let systemMediaWatcher = null;
let themeChangeListeners = [];

/**
 * Get effective theme ('dark' | 'light') based on current setting
 */
export function getResolvedTheme(setting = currentThemeSetting) {
  if (setting === 'system') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return setting;
}

/**
 * Apply theme to document element
 */
export function applyTheme(setting, saveToStorage = true) {
  currentThemeSetting = setting;
  if (saveToStorage) {
    localStorage.setItem(THEME_STORAGE_KEY, setting);
  }

  const resolved = getResolvedTheme(setting);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-theme-setting', setting);

  // Update meta theme-color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolved === 'light' ? '#E0F2FE' : '#0F172A');
  }

  // Notify listeners
  themeChangeListeners.forEach(fn => {
    try {
      fn({ setting, resolved });
    } catch (e) {
      console.error('Theme listener error:', e);
    }
  });

  return { setting, resolved };
}

/**
 * Initialize theme manager
 */
export function initTheme(onThemeChange) {
  if (typeof onThemeChange === 'function') {
    themeChangeListeners.push(onThemeChange);
  }

  const saved = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
  currentThemeSetting = saved;

  // Watch for system theme changes if set to system
  if (window.matchMedia) {
    systemMediaWatcher = window.matchMedia('(prefers-color-scheme: light)');
    const handleSystemChange = () => {
      if (currentThemeSetting === 'system') {
        applyTheme('system', false);
      }
    };

    if (systemMediaWatcher.addEventListener) {
      systemMediaWatcher.addEventListener('change', handleSystemChange);
    } else if (systemMediaWatcher.addListener) {
      systemMediaWatcher.addListener(handleSystemChange);
    }
  }

  return applyTheme(saved, false);
}

/**
 * Get active theme setting
 */
export function getCurrentThemeSetting() {
  return currentThemeSetting;
}

/**
 * Add change listener
 */
export function onThemeChange(callback) {
  if (typeof callback === 'function') {
    themeChangeListeners.push(callback);
  }
}
