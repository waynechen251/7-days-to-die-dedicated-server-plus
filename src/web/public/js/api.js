(function (w) {
  const App = (w.App = w.App || {});

  async function fetchText(url, options = {}, timeoutMs = 30000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      if (res.status === 401) {
        if (App.auth) App.auth.showLoginScreen();
        throw new Error("未授權");
      }
      if (res.status === 403) {
        throw new Error("許可被拒");
      }
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      return text;
    } finally {
      clearTimeout(id);
    }
  }

  async function fetchJSON(url, options = {}, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", ...(options.headers || {}) },
        ...options,
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        if (App.auth) App.auth.showLoginScreen();
        throw new Error("未授權");
      }
      if (res.status === 403) {
        throw new Error("許可被拒");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } finally {
      clearTimeout(id);
    }
  }

  App.api = { fetchText, fetchJSON };
})(window);
