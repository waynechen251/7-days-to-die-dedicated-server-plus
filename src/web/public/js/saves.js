(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api;
  const { escapeHTML } = App.utils;
  const D = App.dom;
  const S = App.state;

  function fillNamesFor(world) {
    const gnSel = document.getElementById("gnSelect");
    if (!gnSel) return;
    gnSel.innerHTML = "";
    const sortOpts = { numeric: true, sensitivity: "base" };
    const names = (S.worldMap.get(world) || [])
      .slice()
      .sort((a, b) => a.localeCompare(b, "zh-Hant", sortOpts));
    names.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      gnSel.appendChild(opt);
    });
    if (names.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = App.i18n ? App.i18n.t("common.none") : "(無)";
      gnSel.appendChild(opt);
    }
  }

  function fillWorldAndName() {
    const gwSel = document.getElementById("gwSelect");
    const gnSel = document.getElementById("gnSelect");
    if (!gwSel || !gnSel) return;

    const prevWorld = gwSel.value;
    const prevName = gnSel.value;

    gwSel.innerHTML = "";
    const worlds = Array.from(S.worldMap.keys()).sort();
    worlds.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w;
      opt.textContent = w;
      gwSel.appendChild(opt);
    });
    if (worlds.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = App.i18n ? App.i18n.t("common.none") : "(無)";
      gwSel.appendChild(opt);
    }
    if (worlds.includes(prevWorld)) gwSel.value = prevWorld;

    fillNamesFor(gwSel.value || worlds[0] || "");
    if (
      prevName &&
      Array.from(gnSel.options).some((o) => o.value === prevName)
    ) {
      gnSel.value = prevName;
    }
  }

  function renderSummary(backupCount) {
    const worlds = S.worldMap.size;
    let savesCount = 0;
    S.worldMap.forEach((names) => { savesCount += names.length; });

    const elWorlds = document.getElementById("saves-sum-worlds");
    const elSaves = document.getElementById("saves-sum-saves");
    const elBackups = document.getElementById("saves-sum-backups");
    if (elWorlds) elWorlds.textContent = worlds;
    if (elSaves) elSaves.textContent = savesCount;
    if (elBackups) elBackups.textContent = backupCount;
  }

  function renderOverview() {
    const el = document.getElementById("saves-overview");
    if (!el) return;
    if (S.worldMap.size === 0) {
      const empty = App.i18n ? App.i18n.t("card.saves.noSaves") : "(尚無存檔)";
      el.innerHTML = `<span class="saves-overview__empty">${empty}</span>`;
      return;
    }
    const parts = [];
    S.worldMap.forEach((names, world) => {
      const namesHtml = names
        .map((n) => `<li class="saves-overview__name">${escapeHTML(n)}</li>`)
        .join("");
      parts.push(
        `<div class="saves-overview__world">` +
          `<span class="saves-overview__world-name">${escapeHTML(world)}</span>` +
          `<ul class="saves-overview__names">${namesHtml}</ul>` +
          `</div>`
      );
    });
    el.innerHTML = parts.join("");
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

      renderSummary(backups.length);
      renderOverview();
      fillWorldAndName();

      const backupSelectEl = document.getElementById("backupSelect");
      if (backupSelectEl) {
        backupSelectEl.innerHTML = "";
        if (backups.length === 0) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = App.i18n ? App.i18n.t("common.noBackup") : "(沒有備份)";
          backupSelectEl.appendChild(opt);
        } else {
          backups.forEach((b) => {
            const opt = document.createElement("option");
            opt.value = b.file;
            const dt = new Date(b.mtime).toLocaleString();
            opt.textContent = `${b.file} (${dt})`;
            backupSelectEl.appendChild(opt);
          });
        }
      }
    } catch (e) {
      const msg = App.i18n
        ? App.i18n.t("messages.loadSavesFailed", { error: e.message })
        : `讀取存檔清單失敗: ${e.message}`;
      App.console.appendLog("backup", `❌ ${msg}`, Date.now());
    }
  }

  App.saves = { loadSaves, fillWorldAndName, fillNamesFor };
})(window);
