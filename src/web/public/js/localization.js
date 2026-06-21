(function (w) {
  const App = (w.App = w.App || {});
  let initialized = false;
  let lastActionFeedback = null;

  function t(key, def, params) {
    if (App.i18n?.t) {
      const translated = App.i18n.t(key, params);
      if (translated !== key) return translated;
    }
    return def || key;
  }

  function $id(id) {
    return document.getElementById(id);
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", hidden);
  }

  function getSelectedVersion() {
    return $id("versionSelect")?.value || "";
  }

  function setFeedback(message, tone) {
    const feedback = $id("loc-action-feedback");
    if (!feedback) return;
    if (!message) {
      feedback.textContent = "";
      setHidden(feedback, true);
      return;
    }
    feedback.textContent = message;
    feedback.style.background =
      tone === "ok"
        ? "rgba(26, 122, 26, 0.16)"
        : tone === "warn"
        ? "rgba(168, 112, 0, 0.16)"
        : "rgba(122, 26, 26, 0.16)";
    feedback.style.color =
      tone === "ok"
        ? "var(--c-ok, #1a7a1a)"
        : tone === "warn"
        ? "var(--c-warn, #a87000)"
        : "var(--c-err, #7a1a1a)";
    setHidden(feedback, false);
  }

  function formatTimestamp(iso) {
    if (!iso) return t("card.localization.statLastGeneratedNone", "尚未生成");
    try {
      return new Date(iso).toLocaleString();
    } catch (_e) {
      return iso;
    }
  }

  function renderSummary(data) {
    const meta = data?.meta || {};
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    const activeProfile = data?.activeProfile || profiles[0] || null;
    const entryCount = Array.isArray(activeProfile?.entries) ? activeProfile.entries.length : 0;

    const summaryEl = $id("loc-status-summary");
    if (summaryEl) {
      summaryEl.textContent = activeProfile
        ? t("card.localization.statusOk", "目前設定集: {name}", {
            name: activeProfile.displayName || activeProfile.name,
          })
        : t("card.localization.statusUnknown", "尚未建立設定集");
    }

    const entryCountEl = $id("loc-stat-entrycount");
    if (entryCountEl) entryCountEl.textContent = entryCount;

    const profileCountEl = $id("loc-stat-profilecount");
    if (profileCountEl) profileCountEl.textContent = profiles.length;

    const lastGeneratedEl = $id("loc-stat-lastgenerated");
    if (lastGeneratedEl) lastGeneratedEl.textContent = formatTimestamp(meta.lastGeneratedAt);

    setHidden($id("loc-restart-alert"), !meta.needsRestart);
  }

  async function refresh() {
    try {
      const result = await App.api.fetchJSON(
        `/api/localization?version=${encodeURIComponent(getSelectedVersion())}&_=${Date.now()}`,
        { cache: "no-store" }
      );
      if (!result?.ok) throw new Error(result?.message || "查詢失敗");
      renderSummary(result.data || {});
      if (lastActionFeedback) {
        setFeedback(lastActionFeedback.message, lastActionFeedback.tone);
      }
    } catch (err) {
      const summaryEl = $id("loc-status-summary");
      if (summaryEl) {
        summaryEl.textContent = t("card.localization.summaryRefreshFailed", "狀態讀取失敗");
      }
    }
  }

  async function acknowledgeRestart() {
    try {
      await App.api.fetchJSON("/api/localization/acknowledge-restart", { method: "POST" });
    } catch (_e) {
      // 忽略失敗，下次重新整理仍會再次顯示提示
    } finally {
      await refresh();
    }
  }

  function bindEvents() {
    const openBtn = $id("loc-open-manage-btn");
    const refreshBtn = $id("loc-refresh-btn");
    const ackBtn = $id("loc-ack-restart-btn");

    if (openBtn && !openBtn.__locBound) {
      openBtn.addEventListener("click", async () => {
        await App.localizationModal?.open?.();
      });
      openBtn.__locBound = true;
    }

    if (refreshBtn && !refreshBtn.__locBound) {
      refreshBtn.addEventListener("click", refresh);
      refreshBtn.__locBound = true;
    }

    if (ackBtn && !ackBtn.__locBound) {
      ackBtn.addEventListener("click", acknowledgeRestart);
      ackBtn.__locBound = true;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    refresh();
    w.addEventListener("i18n:changed", refresh);
  }

  App.localization = { refresh, init, bindEvents };

  const onReady = () => init();
  if (w.__fragmentsReady) onReady();
  else w.addEventListener("fragments:ready", onReady, { once: true });
})(window);
