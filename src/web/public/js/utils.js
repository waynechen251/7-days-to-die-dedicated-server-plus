(function (w) {
  const App = (w.App = w.App || {});

  App.utils = {
    debounce(fn, wait = 250) {
      let t = null;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    },
    setDisabled(nodes, disabled) {
      (Array.isArray(nodes) ? nodes : [nodes]).forEach(
        (el) => el && (el.disabled = !!disabled)
      );
    },
    setBadge(el, status) {
      el.classList.remove("ok", "warn", "err");
      if (status === "ok") el.classList.add("ok");
      else if (status === "warn") el.classList.add("warn");
      else el.classList.add("err");
    },
    stamp(ts, text) {
      return `[${new Date(ts).toLocaleString()}] ${text}`;
    },
    canonicalVersion(v) {
      const t = String(v || "").trim();
      return t === "" ? "public" : t.toLowerCase();
    },
    escapeHTML(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
    decideType(raw) {
      const v = String(raw).trim();
      if (/^(true|false)$/i.test(v)) return "boolean";
      if (/^-?\d+(\.\d+)?$/.test(v)) return "number";
      return "text";
    },
  };
})(window);
