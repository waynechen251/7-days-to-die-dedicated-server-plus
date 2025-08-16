(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api;
  const { escapeHTML } = App.utils;
  const D = App.dom;
  const S = App.state;

  function fillNamesFor(world) {
    D.gnSelect.innerHTML = "";
    const sortOpts = { numeric: true, sensitivity: "base" };
    const names = (S.worldMap.get(world) || [])
      .slice()
      .sort((a, b) => a.localeCompare(b, "zh-Hant", sortOpts));
    names.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      D.gnSelect.appendChild(opt);
    });
    if (names.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(無)";
      D.gnSelect.appendChild(opt);
    }
  }

  function fillWorldAndName() {
    const prevWorld = D.gwSelect.value;
    const prevName = D.gnSelect.value;

    D.gwSelect.innerHTML = "";
    const worlds = Array.from(S.worldMap.keys()).sort();
    worlds.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w;
      opt.textContent = w;
      D.gwSelect.appendChild(opt);
    });
    if (worlds.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(無)";
      D.gwSelect.appendChild(opt);
    }
    if (worlds.includes(prevWorld)) D.gwSelect.value = prevWorld;

    fillNamesFor(D.gwSelect.value || worlds[0] || "");
    if (
      prevName &&
      Array.from(D.gnSelect.options).some((o) => o.value === prevName)
    ) {
      D.gnSelect.value = prevName;
    }
  }

  async function loadSaves() {
    try {
      const resp = await fetchJSON("/api/saves/list", { method: "GET" });
      const saves = resp?.data?.saves || [];
      const backups = resp?.data?.backups || [];

      S.worldMap = new Map();
      saves.forEach((s) => {
        const arr = S.worldMap.get(s.world) || [];
        if (!arr.includes(s.name)) arr.push(s.name);
        S.worldMap.set(s.world, arr);
      });

      const sortOpts = { numeric: true, sensitivity: "base" };
      const sortedWorlds = [...S.worldMap.keys()].sort((a, b) =>
        a.localeCompare(b, "zh-Hant", sortOpts)
      );
      const ordered = new Map();
      for (const w of sortedWorlds) {
        const names = (S.worldMap.get(w) || [])
          .slice()
          .sort((a, b) => a.localeCompare(b, "zh-Hant", sortOpts));
        ordered.set(w, names);
      }
      S.worldMap = ordered;

      fillWorldAndName();

      D.backupSelect.innerHTML = "";
      if (backups.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "(沒有備份)";
        D.backupSelect.appendChild(opt);
      } else {
        backups.forEach((b) => {
          const opt = document.createElement("option");
          opt.value = b.file;
          const dt = new Date(b.mtime).toLocaleString();
          opt.textContent = `${b.file} (${dt})`;
          D.backupSelect.appendChild(opt);
        });
      }
    } catch (e) {
      App.console.appendLog(
        "backup",
        `❌ 讀取存檔清單失敗: ${e.message}`,
        Date.now()
      );
    }
  }

  App.saves = { loadSaves, fillWorldAndName, fillNamesFor };
})(window);
