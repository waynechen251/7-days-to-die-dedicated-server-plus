(function (w) {
  const App = (w.App = w.App || {});

  const STORAGE_KEY = "dsp-lang";
  const DEFAULT_LANG = "zh-TW";
  const SUPPORTED_LANGS = ["zh-TW", "en", "zh-CN"];

  let currentLang = DEFAULT_LANG;
  let translations = {};
  let loadedLangs = new Set();

  function detectBrowserLang() {
    const navLangs = navigator.languages || [navigator.language || ""];
    for (const lang of navLangs) {
      const normalized = lang.replace("_", "-");
      if (SUPPORTED_LANGS.includes(normalized)) return normalized;
      const base = normalized.split("-")[0];
      if (base === "zh") {
        if (normalized.includes("CN") || normalized.includes("Hans")) return "zh-CN";
        return "zh-TW";
      }
      if (base === "en") return "en";
    }
    return DEFAULT_LANG;
  }

  function getSavedLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    } catch (_) {}
    return null;
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
  }

  async function loadLang(lang) {
    if (loadedLangs.has(lang)) return true;
    try {
      const res = await fetch(`locales/${lang}.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      const data = await res.json();
      translations[lang] = flattenTranslations(data);
      loadedLangs.add(lang);
      return true;
    } catch (e) {
      console.warn(`[i18n] Failed to load ${lang}:`, e.message);
      return false;
    }
  }

  function flattenTranslations(obj, prefix = "", result = {}) {
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const val = obj[key];
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === "object" && !Array.isArray(val)) {
        flattenTranslations(val, fullKey, result);
      } else {
        result[fullKey] = val;
      }
    }
    return result;
  }

  function t(key, params) {
    const langData = translations[currentLang] || {};
    let text = langData[key];
    if (text === undefined) {
      const fallback = translations[DEFAULT_LANG] || {};
      text = fallback[key];
    }
    if (text === undefined) return key;
    if (params && typeof params === "object") {
      text = text.replace(/\{(\w+)\}/g, (_, k) =>
        Object.prototype.hasOwnProperty.call(params, k) ? params[k] : `{${k}}`
      );
    }
    return text;
  }

  function updateDOM(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.placeholder = t(key);
    });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.title = t(key);
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (key) el.setAttribute("aria-label", t(key));
    });
    root.querySelectorAll("[data-danger-i18n]").forEach((el) => {
      const key = el.getAttribute("data-danger-i18n");
      if (key) el.setAttribute("data-danger", t(key));
    });
    root.querySelectorAll("[data-cancel-i18n]").forEach((el) => {
      const key = el.getAttribute("data-cancel-i18n");
      if (key) el.setAttribute("data-cancel-text", t(key));
    });
    root.querySelectorAll("[data-continue-i18n]").forEach((el) => {
      const key = el.getAttribute("data-continue-i18n");
      if (key) el.setAttribute("data-continue-text", t(key));
    });
    root.querySelectorAll("[data-danger-title-i18n]").forEach((el) => {
      const key = el.getAttribute("data-danger-title-i18n");
      if (key) el.setAttribute("data-danger-title", t(key));
    });
  }

  async function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
    const loaded = await loadLang(lang);
    if (!loaded && lang !== DEFAULT_LANG) {
      await loadLang(DEFAULT_LANG);
      lang = DEFAULT_LANG;
    }
    currentLang = lang;
    saveLang(lang);
    document.documentElement.lang = lang;
    updateDOM();
    const select = document.getElementById("langSelect");
    if (select && select.value !== lang) select.value = lang;
    window.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang } }));
  }

  function getCurrentLang() {
    return currentLang;
  }

  function getSupportedLangs() {
    return SUPPORTED_LANGS.slice();
  }

  async function init() {
    const saved = getSavedLang();
    const lang = saved || detectBrowserLang();
    await loadLang(DEFAULT_LANG);
    if (lang !== DEFAULT_LANG) await loadLang(lang);
    currentLang = loadedLangs.has(lang) ? lang : DEFAULT_LANG;
    document.documentElement.lang = currentLang;
    updateDOM();
    return currentLang;
  }

  App.i18n = {
    t,
    setLanguage,
    updateDOM,
    getCurrentLang,
    getSupportedLangs,
    init,
  };
})(window);
