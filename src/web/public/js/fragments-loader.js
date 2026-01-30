(function () {
  const placeholders = Array.from(document.querySelectorAll("[data-fragment]"));

  async function loadOne(el) {
    const key = el.getAttribute("data-fragment");
    if (!key) return;
    const url = `fragments/${key}.html`;
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      el.innerHTML = await res.text();
    } catch (e) {
      el.innerHTML = `<div class="card" style="border:1px solid #c00;padding:8px;color:#c00">載入片段失敗: ${key} (${e.message})</div>`;
    }
  }

  async function loadAll() {
    await Promise.all(placeholders.map(loadOne));
    if (window.App && window.App.i18n) {
      window.App.i18n.updateDOM();
    }
    window.__fragmentsReady = true;
    window.dispatchEvent(new Event("fragments:ready"));
  }

  if (placeholders.length) loadAll();
  else {
    window.__fragmentsReady = true;
    window.dispatchEvent(new Event("fragments:ready"));
  }
})();