(function (w) {
  const App = (w.App = w.App || {});
  const D = App.dom;

  const LEGACY_SPLIT_KEY = "ui.split.ratio";
  const SPLIT_KEY = "ui.console.lastOpenRatio";
  const COLLAPSED_KEY = "ui.console.collapsed";

  function t(key, fallback) {
    return App.i18n?.t ? App.i18n.t(key) : fallback;
  }

  function loadSavedRatio() {
    const saved =
      localStorage.getItem(SPLIT_KEY) || localStorage.getItem(LEGACY_SPLIT_KEY);
    const pct = Number(saved);
    return !isNaN(pct) && pct > 5 && pct < 95 ? pct : null;
  }

  function saveSplit(pct) {
    localStorage.setItem(SPLIT_KEY, pct.toFixed(2));
  }

  function restoreSplit() {
    const pct = loadSavedRatio();
    if (pct == null) return;
    document.documentElement.style.setProperty("--split-main-size", pct + "%");
  }

  function loadCollapsed() {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  }

  restoreSplit();

  let splitDragging = false;
  let collapsed = loadCollapsed();

  function clampSplit(pct) {
    const min =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--split-main-min"
        )
      ) || 15;
    const max =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--split-main-max"
        )
      ) || 85;
    return Math.min(Math.max(pct, min), max);
  }

  function updateCollapseButton() {
    const text = collapsed
      ? t("common.expand", "展開")
      : t("common.collapse", "收合");
    if (D.consoleCollapseText) D.consoleCollapseText.textContent = text;
    if (D.consoleCollapseBtn) {
      D.consoleCollapseBtn.title = text;
      D.consoleCollapseBtn.setAttribute("aria-label", text);
      D.consoleCollapseBtn.setAttribute("aria-expanded", String(!collapsed));
    }
    if (D.consoleCollapseIcon) {
      D.consoleCollapseIcon.textContent = collapsed ? "▸" : "▾";
    }
  }

  function applyCollapsedState() {
    D.appSplit?.classList.toggle("console-collapsed", collapsed);
    D.paneConsoleEl?.classList.toggle("is-collapsed", collapsed);
    updateCollapseButton();
  }

  function setCollapsed(next) {
    collapsed = !!next;
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch (_) {}
    applyCollapsedState();
  }

  function setSplitPercent(pct) {
    const clamped = clampSplit(pct);
    document.documentElement.style.setProperty("--split-main-size", clamped + "%");
    saveSplit(clamped);
  }

  function startSplitDrag(e) {
    if (collapsed) return;
    e.preventDefault();
    splitDragging = true;
    D.appSplit.classList.add("resizing");
    document.body.style.userSelect = "none";
  }

  function onSplitDrag(e) {
    if (!splitDragging) return;
    const rect = D.appSplit.getBoundingClientRect();
    const y = e.clientY ?? (e.touches && e.touches[0].clientY);
    if (y == null) return;
    const rel = y - rect.top;
    const pct = (rel / rect.height) * 100;
    setSplitPercent(pct);
  }

  function endSplitDrag() {
    if (!splitDragging) return;
    splitDragging = false;
    D.appSplit.classList.remove("resizing");
    document.body.style.userSelect = "";
  }

  D.splitResizer?.addEventListener("mousedown", startSplitDrag);
  D.splitResizer?.addEventListener("touchstart", startSplitDrag, {
    passive: false,
  });
  window.addEventListener("mousemove", onSplitDrag);
  window.addEventListener("touchmove", onSplitDrag, { passive: false });
  window.addEventListener("mouseup", endSplitDrag);
  window.addEventListener("touchend", endSplitDrag);
  window.addEventListener("touchcancel", endSplitDrag);

  D.splitResizer?.addEventListener("dblclick", () => {
    if (collapsed) return;
    setSplitPercent(50);
  });

  D.consoleCollapseBtn?.addEventListener("click", () => {
    if (!collapsed) {
      const curVar = getComputedStyle(document.documentElement)
        .getPropertyValue("--split-main-size")
        .trim();
      if (curVar.endsWith("%")) {
        const pct = parseFloat(curVar);
        if (!isNaN(pct)) saveSplit(clampSplit(pct));
      }
    }
    setCollapsed(!collapsed);
  });

  window.addEventListener("resize", () => {
    if (collapsed) return;
    const curVar = getComputedStyle(document.documentElement)
      .getPropertyValue("--split-main-size")
      .trim();
    if (curVar.endsWith("%")) {
      const pct = parseFloat(curVar);
      const clamped = clampSplit(pct);
      if (pct !== clamped) {
        setSplitPercent(clamped);
      }
    }
  });

  w.addEventListener("i18n:changed", updateCollapseButton);

  App.split = {
    isCollapsed: () => collapsed,
    setCollapsed,
    refreshUI: applyCollapsedState,
  };

  applyCollapsedState();
})(window);
