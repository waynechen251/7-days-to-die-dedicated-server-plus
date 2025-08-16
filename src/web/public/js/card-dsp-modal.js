(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api || {};

  async function ensureFragment(id, url) {
    const existing = document.getElementById(id);
    if (existing && existing.classList.contains("modal")) return existing;

    const host =
      document.getElementById("dspModalHost") ||
      document.querySelector('[data-fragment="card-dsp-modal"]');

    if (!host) throw new Error("找不到片段宿主節點");

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("載入片段失敗");
    const html = await res.text();
    host.innerHTML = html;

    const modal = document.getElementById(id);
    if (!modal || !modal.classList.contains("modal")) {
      throw new Error("片段載入後仍找不到 modal 節點");
    }
    return modal;
  }

  function wireModal() {
    if (App.adminConfig) return;

    const modal = document.getElementById("adminCfgModal");
    if (!modal) return;

    const closeBtn = document.getElementById("adminCfgCloseBtn");
    const closeBtn2 = document.getElementById("adminCfgCloseBtn2");
    const refreshBtn = document.getElementById("adminCfgRefreshBtn");
    const copyBtn = document.getElementById("adminCfgCopyBtn");
    const contentEl = document.getElementById("adminCfgContent");

    async function loadConfig() {
      contentEl.textContent = "";
      try {
        const res = await fetchJSON("/api/get-config");
        if (!res?.ok) throw new Error(res?.message || "讀取失敗");
        const json = res.data || {};
        contentEl.textContent = JSON.stringify(json, null, 2);
      } catch (e) {
        contentEl.textContent = "";
      }
    }

    function show() {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
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
      } catch {}
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

  function bindTrigger() {
    const triggerBtn = document.getElementById("viewConfigBtn");
    if (!triggerBtn) return false;

    if (!triggerBtn.__bound_openAdminCfg) {
      triggerBtn.addEventListener("click", async () => {
        try {
          await ensureFragment(
            "adminCfgModal",
            "fragments/card-dsp-modal.html"
          );
          const alreadyBound = !!App.adminConfig;
          wireModal();
          if (App.adminConfig?.open) {
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
      triggerBtn.__bound_openAdminCfg = true;
    }
    return true;
  }

  function boot() {
    if (bindTrigger()) return;
    const once = () => bindTrigger();
    if (w.__fragmentsReady) once();
    else w.addEventListener("fragments:ready", once, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
