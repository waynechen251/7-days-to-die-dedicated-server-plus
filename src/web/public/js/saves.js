(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api;
  const { escapeHTML } = App.utils;
  const D = App.dom;
  const S = App.state;

  function t(key, params) {
    return App.i18n ? App.i18n.t(key, params) : key;
  }

  function fillNamesFor(world) {
    const list = document.getElementById("gnList");
    if (!list) return;

    const sortOpts = { numeric: true, sensitivity: "base" };
    const names = (S.worldMap.get(world) || [])
      .slice()
      .sort((a, b) => a.localeCompare(b, "zh-Hant", sortOpts));

    if (!names.includes(S.selectedName)) {
      S.selectedName = names[0] || "";
    }

    list.innerHTML = "";
    if (names.length === 0) {
      const span = document.createElement("span");
      span.className = "saves-chip-empty";
      span.setAttribute("data-i18n", "card.saves.noGameNames");
      span.textContent = t("card.saves.noGameNames");
      list.appendChild(span);
    } else {
      names.forEach((n) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "save-chip";
        btn.dataset.name = n;
        btn.textContent = n;
        const isSelected = n === S.selectedName;
        btn.classList.toggle("is-selected", isSelected);
        btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        if (world && world === S.activeWorld && n === S.activeName) {
          btn.classList.add("save-chip--active");
          btn.setAttribute("data-i18n-title", "card.saves.activeBadge");
          btn.title = t("card.saves.activeBadge");
        }
        list.appendChild(btn);
      });
    }
    if (App.i18n?.updateDOM) App.i18n.updateDOM(list);
    updateExportSelectionLabel();
  }

  function fillWorldAndName() {
    const gwSel = document.getElementById("gwSelect");
    if (!gwSel) return;

    if (!S.worldMap.has(S.selectedWorld)) {
      S.selectedWorld = S.worldMap.keys().next().value || "";
    }

    gwSel.innerHTML = "";
    const worlds = Array.from(S.worldMap.keys()).sort();
    worlds.forEach((world) => {
      const opt = document.createElement("option");
      opt.value = world;
      opt.textContent =
        world === S.activeWorld
          ? `${world}（${t("card.saves.activeBadge")}）`
          : world;
      gwSel.appendChild(opt);
    });
    if (worlds.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = t("common.none");
      gwSel.appendChild(opt);
    }
    gwSel.value = S.selectedWorld;

    fillNamesFor(S.selectedWorld);
  }

  function selectWorldGame(world, name) {
    if (!S.worldMap.has(world)) return;
    S.selectedWorld = world;
    S.selectedName = name && (S.worldMap.get(world) || []).includes(name) ? name : "";

    const gwSel = document.getElementById("gwSelect");
    if (gwSel) gwSel.value = world;

    fillNamesFor(world);
  }

  async function loadActiveConfig() {
    try {
      const resp = await fetchJSON("/api/serverconfig", { method: "GET" });
      const items = resp?.data?.items || [];
      const gw = items.find((it) => it.name === "GameWorld" && !it.commented);
      const gn = items.find((it) => it.name === "GameName" && !it.commented);
      S.activeWorld = gw?.value || "";
      S.activeName = gn?.value || "";
    } catch (_e) {
      S.activeWorld = "";
      S.activeName = "";
    }
  }

  function updateExportSelectionLabel() {
    const labelEl = document.getElementById("saves-export-selected-label");
    if (labelEl) {
      if (S.selectedWorld && S.selectedName) {
        labelEl.removeAttribute("data-i18n");
        labelEl.textContent = `${S.selectedWorld} / ${S.selectedName}`;
      } else {
        labelEl.setAttribute("data-i18n", "card.saves.noSaveSelected");
        labelEl.textContent = t("card.saves.noSaveSelected");
      }
    }
    updateApplyActiveBtnState();
  }

  function updateApplyActiveBtnState() {
    const activeLabelEl = document.getElementById("saves-active-config-label");
    if (activeLabelEl) {
      if (S.activeWorld && S.activeName) {
        activeLabelEl.removeAttribute("data-i18n");
        activeLabelEl.textContent = `${S.activeWorld} / ${S.activeName}`;
      } else {
        activeLabelEl.setAttribute("data-i18n", "card.saves.activeConfigNone");
        activeLabelEl.textContent = t("card.saves.activeConfigNone");
      }
    }

    const btn = document.getElementById("applyActiveSaveBtn");
    if (!btn) return;

    const isActive =
      !!S.selectedWorld &&
      !!S.selectedName &&
      S.selectedWorld === S.activeWorld &&
      S.selectedName === S.activeName;

    if (isActive) {
      btn.setAttribute("data-i18n", "card.saves.alreadyActive");
      btn.textContent = t("card.saves.alreadyActive");
      btn.disabled = true;
    } else {
      btn.setAttribute("data-i18n", "card.saves.applyActiveSave");
      btn.textContent = t("card.saves.applyActiveSave");
      // 是否可點擊由 status.js 的 applyUIState() 依執行狀態/權限決定
    }
  }

  function bindGnListEvents() {
    const list = document.getElementById("gnList");
    if (!list || list.__bound) return;
    list.__bound = true;

    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".save-chip");
      if (!btn || btn.disabled) return;
      const name = btn.dataset.name || "";
      if (!name || name === S.selectedName) return;

      S.selectedName = name;
      list.querySelectorAll(".save-chip").forEach((c) => {
        const sel = c.dataset.name === name;
        c.classList.toggle("is-selected", sel);
        c.setAttribute("aria-pressed", sel ? "true" : "false");
      });

      if (App.status?.applyUIState) App.status.applyUIState(S.current);
      updateExportSelectionLabel();
    });
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
      const empty = t("card.saves.noSaves");
      el.innerHTML = `<span class="saves-overview__empty" data-i18n="card.saves.noSaves">${escapeHTML(empty)}</span>`;
      return;
    }
    const parts = [];
    S.worldMap.forEach((names, world) => {
      const isActiveWorld = world === S.activeWorld;
      const worldClass =
        "saves-overview__world-name" +
        (isActiveWorld ? " saves-overview__world-name--active" : "");
      const namesHtml = names
        .map((n) => {
          const isActiveName = isActiveWorld && n === S.activeName;
          const cls =
            "saves-overview__name" +
            (isActiveName ? " saves-overview__name--active" : "");
          return (
            `<li class="${cls}" role="button" tabindex="0" ` +
            `data-world="${escapeHTML(world)}" data-name="${escapeHTML(n)}">${escapeHTML(n)}</li>`
          );
        })
        .join("");
      parts.push(
        `<div class="saves-overview__world">` +
          `<span class="${worldClass}" role="button" tabindex="0" data-world="${escapeHTML(world)}">${escapeHTML(world)}</span>` +
          `<ul class="saves-overview__names">${namesHtml}</ul>` +
          `</div>`
      );
    });
    el.innerHTML = parts.join("");
  }

  function bindOverviewEvents() {
    const el = document.getElementById("saves-overview");
    if (!el || el.__bound) return;
    el.__bound = true;

    function handleActivate(target) {
      const item = target.closest("[data-world]");
      if (!item) return;
      const world = item.dataset.world || "";
      const name = item.dataset.name || "";
      if (App.savesOpenModal) App.savesOpenModal(world, name || undefined);
    }

    el.addEventListener("click", (e) => handleActivate(e.target));
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!e.target.closest("[data-world]")) return;
      e.preventDefault();
      handleActivate(e.target);
    });
  }

  async function applyActiveSave() {
    const world = S.selectedWorld;
    const name = S.selectedName;
    const res = await fetchJSON("/api/serverconfig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: { GameWorld: world, GameName: name } }),
    });
    if (!res.ok) throw new Error(res.message || "寫入失敗");

    S.activeWorld = world;
    S.activeName = name;

    fillWorldAndName();
    renderOverview();
    if (App.status?.applyUIState) App.status.applyUIState(S.current);
    updateApplyActiveBtnState();
  }

  async function loadSaves() {
    try {
      const [resp] = await Promise.all([
        fetchJSON("/api/saves/list", { method: "GET" }),
        loadActiveConfig(),
      ]);
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
      bindOverviewEvents();
      bindGnListEvents();

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

  App.saves = {
    loadSaves,
    fillWorldAndName,
    fillNamesFor,
    selectWorldGame,
    updateExportSelectionLabel,
    updateApplyActiveBtnState,
    bindGnListEvents,
    applyActiveSave,
  };
})(window);
