(function (w) {
  const App = (w.App = w.App || {});

  async function ensureFragment(id, url) {
    const existing = document.getElementById(id);
    if (existing && existing.classList.contains("modal")) return existing;

    const host =
      document.getElementById("savesModalHost") ||
      document.querySelector('[data-fragment="card-saves-modal"]');

    if (!host) throw new Error("找不到片段宿主節點");

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("載入片段失敗");
    const html = await res.text();
    host.innerHTML = html;

    if (App.i18n?.updateDOM) App.i18n.updateDOM();

    const modal = document.getElementById(id);
    if (!modal || !modal.classList.contains("modal")) {
      throw new Error("片段載入後仍找不到 modal 節點");
    }
    return modal;
  }

  function wireModal() {
    if (App.savesManage) return;

    const modal = document.getElementById("savesManageModal");
    if (!modal) return;

    const closeBtn = document.getElementById("saves-modal-close-btn");
    const closeBtn2 = document.getElementById("saves-modal-close-btn2");

    function show() {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }
    function hide() {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }

    function onKeyDown(e) {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) hide();
    }

    async function open() {
      show();
      App.dom?.refresh?.();
      await App.saves?.loadSaves?.();
    }

    closeBtn?.addEventListener("click", hide);
    closeBtn2?.addEventListener("click", hide);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) hide();
    });
    document.addEventListener("keydown", onKeyDown);

    App.savesManage = { open, hide };
  }

  function bindTrigger() {
    const triggerBtn = document.getElementById("saves-open-manage-btn");
    if (!triggerBtn) return false;

    if (!triggerBtn.__bound_openSavesManage) {
      triggerBtn.addEventListener("click", async () => {
        try {
          await ensureFragment(
            "savesManageModal",
            "fragments/card-saves-modal.html"
          );
          const alreadyBound = !!App.savesManage;
          wireModal();
          if (App.savesManage?.open) {
            await App.savesManage.open();
          } else if (!alreadyBound) {
            console.error("存檔管理視窗綁定失敗：缺少 open()");
          }
        } catch (e) {
          console.error("載入存檔管理視窗失敗:", e);
        }
      });
      triggerBtn.__bound_openSavesManage = true;
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
