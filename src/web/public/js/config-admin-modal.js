(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api || {};

  async function ensureFragment(id, url) {
    if (document.getElementById(id)) return;
    const host = document.querySelector(`[data-fragment="admin-config-modal"]`);
    if (!host) return;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("載入片段失敗");
    const html = await res.text();
    host.insertAdjacentHTML("beforeend", html);
  }

  async function init() {
    const triggerBtn = document.getElementById("viewConfigBtn");
    if (!triggerBtn) return;

    triggerBtn.addEventListener("click", async () => {
      try {
        await ensureFragment(
          "adminCfgModal",
          "fragments/card-admin-config-modal.html"
        );
        const alreadyBound = !!App.adminConfig;
        wireModal();
        if (App.adminConfig && App.adminConfig.open) {
          App.adminConfig.open();
        } else if (!alreadyBound) {
          console.error("管理後台設定視窗綁定失敗：缺少 open()");
          alert("載入管理後台設定視窗失敗（缺少開啟方法）");
        }
      } catch (e) {
        console.error(e);
        alert("載入管理後台設定視窗失敗: " + e.message);
      }
    });
  }

  function wireModal() {
    if (App.adminConfig) return;

    const modal = document.getElementById("adminCfgModal");
    const closeBtn = document.getElementById("adminCfgCloseBtn");
    const closeBtn2 = document.getElementById("adminCfgCloseBtn2");
    const refreshBtn = document.getElementById("adminCfgRefreshBtn");
    const copyBtn = document.getElementById("adminCfgCopyBtn");
    const statusEl = document.getElementById("adminCfgStatus");
    const contentEl = document.getElementById("adminCfgContent");

    async function loadConfig() {
      statusEl.textContent = "讀取中…";
      contentEl.textContent = "";
      try {
        const res = await fetchJSON("/api/get-config");
        if (!res.ok) throw new Error(res.message || "讀取失敗");
        const json = res.data || {};
        contentEl.textContent = JSON.stringify(json, null, 2);
        statusEl.textContent = "✅ 已載入";
      } catch (e) {
        contentEl.textContent = "";
        statusEl.textContent = "❌ 讀取失敗: " + e.message;
      }
    }

    function show() {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      statusEl.textContent = "";
    }
    function hide() {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
    async function openModal() {
      show();
      await loadConfig();
    }
    async function refresh() {
      await loadConfig();
    }
    async function copyJSON() {
      const txt = contentEl.textContent || "";
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        statusEl.textContent = "📋 已複製";
      } catch {
        statusEl.textContent = "❌ 複製失敗";
      }
    }

    refreshBtn?.addEventListener("click", refresh);
    copyBtn?.addEventListener("click", copyJSON);
    closeBtn?.addEventListener("click", hide);
    closeBtn2?.addEventListener("click", hide);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) hide();
    });

    App.adminConfig = { open: openModal, refresh };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
