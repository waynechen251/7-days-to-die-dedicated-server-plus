(function (w) {
  const App = (w.App = w.App || {});
  const D = App.dom;

  const SPLIT_KEY = "ui.split.ratio";
  (function restoreSplit() {
    const saved = localStorage.getItem(SPLIT_KEY);
    if (saved) {
      const pct = Number(saved);
      if (!isNaN(pct) && pct > 5 && pct < 95) {
        document.documentElement.style.setProperty(
          "--split-main-size",
          pct + "%"
        );
      }
    }
  })();

  let splitDragging = false;

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

  function startSplitDrag(e) {
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
    const pct = clampSplit((rel / rect.height) * 100);
    document.documentElement.style.setProperty("--split-main-size", pct + "%");
    localStorage.setItem(SPLIT_KEY, pct.toFixed(2));
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
    document.documentElement.style.setProperty("--split-main-size", "50%");
    localStorage.setItem(SPLIT_KEY, "50");
  });

  window.addEventListener("resize", () => {
    const curVar = getComputedStyle(document.documentElement)
      .getPropertyValue("--split-main-size")
      .trim();
    if (curVar.endsWith("%")) {
      const pct = parseFloat(curVar);
      const clamped = clampSplit(pct);
      if (pct !== clamped) {
        document.documentElement.style.setProperty(
          "--split-main-size",
          clamped + "%"
        );
        localStorage.setItem(SPLIT_KEY, clamped.toFixed(2));
      }
    }
  });
})(window);
