(function (w) {
  const App = (w.App = w.App || {});

  async function ensureFragment(id, url) {
    const existing = document.getElementById(id);
    if (existing && existing.classList.contains("modal")) return existing;

    const host =
      document.getElementById("firewallModalHost") ||
      document.querySelector('[data-fragment="card-firewall-modal"]');

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
    if (App.firewallAdvanced) return;

    const modal = document.getElementById("firewallAdvancedModal");
    if (!modal) return;

    const closeBtn = document.getElementById("fw-modal-close-btn");
    const closeBtn2 = document.getElementById("fw-modal-close-btn2");

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
      App.firewall?.bindAdvancedControls?.();
      await App.firewall?.refresh?.();
    }

    closeBtn?.addEventListener("click", hide);
    closeBtn2?.addEventListener("click", hide);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) hide();
    });
    document.addEventListener("keydown", onKeyDown);

    App.firewallAdvanced = { open, hide };
  }

  function bindTrigger() {
    const triggerBtn = document.getElementById("fw-open-advanced-btn");
    if (!triggerBtn) return false;

    if (!triggerBtn.__bound_openFirewallAdvanced) {
      triggerBtn.addEventListener("click", async () => {
        try {
          await ensureFragment(
            "firewallAdvancedModal",
            "fragments/card-firewall-modal.html"
          );
          const alreadyBound = !!App.firewallAdvanced;
          wireModal();
          if (App.firewallAdvanced?.open) {
            await App.firewallAdvanced.open();
          } else if (!alreadyBound) {
            console.error("防火牆進階視窗綁定失敗：缺少 open()");
          }
        } catch (e) {
          console.error("載入防火牆進階視窗失敗:", e);
        }
      });
      triggerBtn.__bound_openFirewallAdvanced = true;
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
