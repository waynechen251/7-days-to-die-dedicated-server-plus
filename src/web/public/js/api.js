(function (w) {
  const App = (w.App = w.App || {});

  function jsonOptions(method, body, headers) {
    return {
      method,
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    };
  }

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

  const saves = {
    list() {
      return fetchJSON("/api/saves/list", { method: "GET" });
    },
    exportFull() {
      return fetchText("/api/backup", { method: "POST" });
    },
    exportSingle(world, name) {
      return fetchText(
        "/api/saves/export-one",
        jsonOptions("POST", { world, name })
      );
    },
    importBackup(scope, file) {
      return fetchText(
        "/api/saves/import-backup",
        jsonOptions("POST", { scope, file })
      );
    },
    importUpload(scope, file) {
      return fetchText(
        `/api/saves/import-upload?scope=${encodeURIComponent(
          scope
        )}&filename=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        }
      );
    },
    deleteSingle(world, name) {
      return fetchText(
        "/api/saves/delete",
        jsonOptions("POST", { world, name })
      );
    },
    deleteBackup(file) {
      return fetchText(
        "/api/saves/delete-backup",
        jsonOptions("POST", { file })
      );
    },
    setActive(world, name) {
      return fetchJSON(
        "/api/serverconfig",
        jsonOptions("POST", { updates: { GameWorld: world, GameName: name } })
      );
    },
  };

  App.api = Object.assign(App.api || {}, { fetchText, fetchJSON, saves });
})(window);
