(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api;
  const { escapeHTML } = App.utils;
  const S = App.state;

  function t(key, params) {
    return App.i18n ? App.i18n.t(key, params) : key;
  }

  function getHomeViewport() {
    if (w.innerWidth <= 720) return "mobile";
    if (w.innerWidth <= 980) return "tablet";
    return "desktop";
  }

  function getHomePageSize(kind) {
    const viewport = getHomeViewport();
    const pageSizes = {
      desktop: { worlds: 6, saves: 7 },
      tablet: { worlds: 5, saves: 6 },
      mobile: { worlds: 4, saves: 5 },
    };
    return pageSizes[viewport][kind];
  }

  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  function getPageInfo(items, selectedValue, kind) {
    const pageSize = getHomePageSize(kind);
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
    const selectedIndex = Math.max(0, items.indexOf(selectedValue));
    const page = clamp(Math.floor(selectedIndex / pageSize), 0, totalPages - 1);
    const start = page * pageSize;
    const end = Math.min(start + pageSize, totalItems);

    return {
      items: items.slice(start, end),
      page,
      pageSize,
      start,
      end,
      totalItems,
      totalPages,
    };
  }

  function renderHomePager(el, info, type) {
    if (!el) return;
    if (!info || info.totalItems <= info.pageSize) {
      el.innerHTML = "";
      return;
    }

    el.innerHTML =
      `<span class="saves-browser-pager__status">${escapeHTML(
        t("card.saves.pagerStatus", {
          start: info.start + 1,
          end: info.end,
          total: info.totalItems,
          page: info.page + 1,
          totalPages: info.totalPages,
        })
      )}</span>` +
      `<div class="saves-browser-pager__controls">` +
        `<button type="button" class="btn btn--ghost saves-browser-pager__btn" data-page-target="${escapeHTML(type)}" data-page-dir="prev" ${info.page <= 0 ? "disabled" : ""} title="${escapeHTML(t("card.saves.pagerPrev"))}" aria-label="${escapeHTML(t("card.saves.pagerPrev"))}">‹</button>` +
        `<button type="button" class="btn btn--ghost saves-browser-pager__btn" data-page-target="${escapeHTML(type)}" data-page-dir="next" ${info.page >= info.totalPages - 1 ? "disabled" : ""} title="${escapeHTML(t("card.saves.pagerNext"))}" aria-label="${escapeHTML(t("card.saves.pagerNext"))}">›</button>` +
      `</div>`;
  }

  function getWorldNames(world) {
    return (S.worldMap.get(world) || []).slice();
  }

  function normalizeSelection() {
    if (!S.worldMap.has(S.selectedWorld)) {
      S.selectedWorld =
        (S.activeWorld && S.worldMap.has(S.activeWorld) ? S.activeWorld : "") ||
        S.worldMap.keys().next().value ||
        "";
    }

    const names = getWorldNames(S.selectedWorld);
    if (!names.includes(S.selectedName)) {
      S.selectedName = names[0] || "";
    }
  }

  function syncSaveControls() {
    if (App.status?.applyUIState && S.current) {
      App.status.applyUIState(S.current);
    }
  }

  function setDynamicLabel(el, key, text) {
    if (!el) return;
    if (text) {
      el.removeAttribute("data-i18n");
      el.textContent = text;
      return;
    }
    el.setAttribute("data-i18n", key);
    el.textContent = t(key);
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
    syncSaveControls();
  }

  function fillWorldAndName() {
    const gwSel = document.getElementById("gwSelect");
    if (!gwSel) return;

    normalizeSelection();

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
    S.selectedName = name && getWorldNames(world).includes(name) ? name : "";
    normalizeSelection();

    const gwSel = document.getElementById("gwSelect");
    if (gwSel) gwSel.value = world;

    fillNamesFor(world);
    renderHomeBrowser();
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
    const selectedText =
      S.selectedWorld && S.selectedName
        ? `${S.selectedWorld} / ${S.selectedName}`
        : "";
    setDynamicLabel(
      document.getElementById("saves-export-selected-label"),
      "card.saves.noSaveSelected",
      selectedText
    );
    updateApplyActiveBtnState();
  }

  function updateApplyActiveBtnState() {
    const activeText =
      S.activeWorld && S.activeName ? `${S.activeWorld} / ${S.activeName}` : "";
    setDynamicLabel(
      document.getElementById("saves-active-config-label"),
      "card.saves.activeConfigNone",
      activeText
    );

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

  function renderHomeCounts() {
    const worlds = S.worldMap.size;
    let savesCount = 0;
    S.worldMap.forEach((names) => { savesCount += names.length; });

    const elWorlds = document.getElementById("saves-home-world-count");
    const elSaves = document.getElementById("saves-home-save-count");
    if (elWorlds) elWorlds.textContent = `(${worlds})`;
    if (elSaves) elSaves.textContent = `(${savesCount})`;
  }

  function renderHomeSelectionSummary() {
    const el = document.getElementById("saves-home-selection");
    if (!el) return;

    if (S.selectedWorld && S.selectedName) {
      el.removeAttribute("data-i18n");
      el.textContent = t("card.saves.homeSelectionSave", {
        world: S.selectedWorld,
        name: S.selectedName,
      });
      return;
    }

    if (S.selectedWorld) {
      el.removeAttribute("data-i18n");
      el.textContent = t("card.saves.homeSelectionWorld", {
        world: S.selectedWorld,
      });
      return;
    }

    el.setAttribute("data-i18n", "card.saves.homeSelectionEmpty");
    el.textContent = t("card.saves.homeSelectionEmpty");
  }

  function renderHomeWorldList() {
    const el = document.getElementById("saves-home-worlds");
    const pagerEl = document.getElementById("saves-home-worlds-pager");
    if (!el) return;
    if (S.worldMap.size === 0) {
      el.innerHTML = `<span class="saves-browser-empty" data-i18n="card.saves.noSaves">${escapeHTML(t("card.saves.noSaves"))}</span>`;
      renderHomePager(pagerEl, null, "worlds");
      return;
    }

    const worlds = Array.from(S.worldMap.keys());
    const pageInfo = getPageInfo(worlds, S.selectedWorld, "worlds");
    const parts = [];
    pageInfo.items.forEach((world) => {
      const names = getWorldNames(world);
      const isActiveWorld = world === S.activeWorld;
      const isSelectedWorld = world === S.selectedWorld;
      const title = t("card.saves.selectWorldTitle", { world });
      const badge = isActiveWorld
        ? `<span class="saves-browser-item__badge">${escapeHTML(t("card.saves.activeBadge"))}</span>`
        : "";
      parts.push(
        `<button type="button" class="saves-browser-item${isSelectedWorld ? " saves-browser-item--selected" : ""}" data-world="${escapeHTML(world)}" title="${escapeHTML(title)}">` +
          `<span class="saves-browser-item__copy">` +
            `<span class="saves-browser-item__title">${escapeHTML(world)}</span>` +
            `<span class="saves-browser-item__meta">${escapeHTML(t("card.saves.worldSaveCount", { count: names.length }))}</span>` +
          `</span>` +
          `<span class="saves-browser-item__aside">` +
            badge +
          `</span>` +
        `</button>`
      );
    });
    el.innerHTML = parts.join("");
    renderHomePager(pagerEl, pageInfo, "worlds");
  }

  function renderSelectedWorldMeta() {
    const el = document.getElementById("saves-home-selected-world");
    if (!el) return;
    if (!S.selectedWorld) {
      el.setAttribute("data-i18n", "card.saves.saveListMetaEmpty");
      el.textContent = t("card.saves.saveListMetaEmpty");
      return;
    }
    el.removeAttribute("data-i18n");
    el.textContent = t("card.saves.saveListMeta", { world: S.selectedWorld });
  }

  function renderHomeSaveList() {
    const el = document.getElementById("saves-home-names");
    const pagerEl = document.getElementById("saves-home-names-pager");
    if (!el) return;
    renderSelectedWorldMeta();
    renderHomeSelectionSummary();

    if (S.worldMap.size === 0) {
      el.innerHTML = `<span class="saves-browser-empty" data-i18n="card.saves.noSaves">${escapeHTML(t("card.saves.noSaves"))}</span>`;
      renderHomePager(pagerEl, null, "saves");
      return;
    }

    if (!S.selectedWorld) {
      el.innerHTML = `<span class="saves-browser-empty" data-i18n="card.saves.saveListMetaEmpty">${escapeHTML(t("card.saves.saveListMetaEmpty"))}</span>`;
      renderHomePager(pagerEl, null, "saves");
      return;
    }

    const names = getWorldNames(S.selectedWorld);
    if (names.length === 0) {
      el.innerHTML = `<span class="saves-browser-empty" data-i18n="card.saves.noGameNames">${escapeHTML(t("card.saves.noGameNames"))}</span>`;
      renderHomePager(pagerEl, null, "saves");
      return;
    }

    const pageInfo = getPageInfo(names, S.selectedName, "saves");
    const parts = pageInfo.items.map((name) => {
      const isActive = S.selectedWorld === S.activeWorld && name === S.activeName;
      const isSelected = name === S.selectedName;
      const title = t("card.saves.selectSaveTitle", {
        world: S.selectedWorld,
        name,
      });
      return (
        `<button type="button" class="saves-browser-item${isSelected ? " saves-browser-item--selected" : ""}" data-world="${escapeHTML(S.selectedWorld)}" data-name="${escapeHTML(name)}" title="${escapeHTML(title)}">` +
          `<span class="saves-browser-item__copy">` +
            `<span class="saves-browser-item__title">${escapeHTML(name)}</span>` +
            `<span class="saves-browser-item__meta">${escapeHTML(t("card.saves.saveListSelectHint"))}</span>` +
          `</span>` +
          (isActive
            ? `<span class="saves-browser-item__badge">${escapeHTML(t("card.saves.activeBadge"))}</span>`
            : "") +
        `</button>`
      );
    });
    el.innerHTML = parts.join("");
    renderHomePager(pagerEl, pageInfo, "saves");
  }

  function bindHomeOverviewEvents() {
    const worldsEl = document.getElementById("saves-home-worlds");
    if (worldsEl && !worldsEl.__bound) {
      worldsEl.__bound = true;
      worldsEl.addEventListener("click", (e) => {
        const item = e.target.closest("[data-world]");
        if (!item) return;
        const world = item.dataset.world || "";
        if (!world || world === S.selectedWorld) return;
        S.selectedWorld = world;
        normalizeSelection();
        renderHomeWorldList();
        renderHomeSaveList();
      });
    }

    const namesEl = document.getElementById("saves-home-names");
    if (namesEl && !namesEl.__bound) {
      namesEl.__bound = true;
      namesEl.addEventListener("click", (e) => {
        const item = e.target.closest("[data-world][data-name]");
        if (!item) return;
        const world = item.dataset.world || "";
        const name = item.dataset.name || "";
        if (!world || !name) return;
        S.selectedWorld = world;
        S.selectedName = name;
        renderHomeSaveList();
      });
    }
  }

  function moveHomePage(target, dir) {
    const delta = dir === "prev" ? -1 : dir === "next" ? 1 : 0;
    if (!delta) return;

    if (target === "worlds") {
      const worlds = Array.from(S.worldMap.keys());
      if (!worlds.length) return;
      const pageInfo = getPageInfo(worlds, S.selectedWorld, "worlds");
      const nextPage = clamp(pageInfo.page + delta, 0, pageInfo.totalPages - 1);
      if (nextPage === pageInfo.page) return;
      const nextWorld = worlds[nextPage * pageInfo.pageSize] || worlds[0];
      if (!nextWorld) return;
      S.selectedWorld = nextWorld;
      normalizeSelection();
      renderHomeWorldList();
      renderHomeSaveList();
      return;
    }

    if (target === "saves") {
      const names = getWorldNames(S.selectedWorld);
      if (!names.length) return;
      const pageInfo = getPageInfo(names, S.selectedName, "saves");
      const nextPage = clamp(pageInfo.page + delta, 0, pageInfo.totalPages - 1);
      if (nextPage === pageInfo.page) return;
      const nextName = names[nextPage * pageInfo.pageSize] || names[0];
      if (!nextName) return;
      S.selectedName = nextName;
      renderHomeSaveList();
    }
  }

  function bindHomePagerEvents() {
    ["saves-home-worlds-pager", "saves-home-names-pager"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.__bound) return;
      el.__bound = true;
      el.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-page-target][data-page-dir]");
        if (!btn || btn.disabled) return;
        moveHomePage(btn.dataset.pageTarget || "", btn.dataset.pageDir || "");
      });
    });
  }

  function bindHomeViewportEvents() {
    if (w.__savesHomeViewportBound) return;
    w.__savesHomeViewportBound = true;

    let timer = 0;
    w.addEventListener("resize", () => {
      w.clearTimeout(timer);
      timer = w.setTimeout(() => {
        renderHomeBrowser();
      }, 120);
    });
  }

  function renderHomeBrowser() {
    normalizeSelection();
    renderHomeCounts();
    renderHomeSelectionSummary();
    renderHomeWorldList();
    renderHomeSaveList();
  }

  function bindHomeSelectionSync() {
    const list = document.getElementById("gnList");
    if (!list || list.__bound_home_sync) return;
    list.__bound_home_sync = true;
    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".save-chip");
      if (!btn || btn.disabled) return;
      const name = btn.dataset.name || "";
      if (!name) return;
      S.selectedName = name;
      renderHomeSaveList();
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
    renderHomeBrowser();
    syncSaveControls();
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
      S.savesBackupCount = backups.length;

      fillWorldAndName();
      renderHomeBrowser();
      bindHomeOverviewEvents();
      bindHomePagerEvents();
      bindGnListEvents();
      bindHomeSelectionSync();
      bindHomeViewportEvents();
      syncSaveControls();

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

  w.addEventListener("i18n:changed", () => {
    renderHomeBrowser();
    fillWorldAndName();
  });
})(window);
