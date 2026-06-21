(function (w) {
  const App = (w.App = w.App || {});

  function t(key, def, params) {
    if (App.i18n?.t) {
      const translated = App.i18n.t(key, params);
      if (translated !== key) return translated;
    }
    return def || key;
  }
  const escapeHTML = (s) => App.utils.escapeHTML(s);

  let dataStore = { profiles: [], activeProfileId: null, buildId: null, languageColumns: [] };
  let workingEntries = [];
  let nextRowId = 1;
  let searchTerm = "";
  let officialItems = [];
  let officialPageInfo = { page: 0, pageSize: 50, total: 0, totalPages: 0 };
  let statusFilter = "all"; // "all" | "edited" | "unedited"
  let editedPageInfo = { page: 0, pageSize: 50, total: 0, totalPages: 0 };
  let searchDebounceTimer = null;
  let savedSnapshot = "[]";

  const LANG_ORDER_STORAGE_KEY = "loc-lang-column-order";
  let langColumnOrder = null;

  function loadLangColumnOrder() {
    try {
      const raw = localStorage.getItem(LANG_ORDER_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function saveLangColumnOrder(order) {
    try {
      localStorage.setItem(LANG_ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch (_e) {
      // 忽略 localStorage 不可用的狀況（例如隱私模式）
    }
  }

  const HIDDEN_COLUMNS_STORAGE_KEY = "loc-hidden-columns";
  let hiddenColumns = null;

  function loadHiddenColumns() {
    try {
      const raw = localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (_e) {
      return new Set();
    }
  }

  function saveHiddenColumns() {
    try {
      localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify([...hiddenColumns]));
    } catch (_e) {
      // 忽略 localStorage 不可用的狀況（例如隱私模式）
    }
  }

  function isColumnVisible(colKey) {
    if (!hiddenColumns) hiddenColumns = loadHiddenColumns();
    return !hiddenColumns.has(colKey);
  }

  function toggleColumnVisibility(colKey) {
    if (!hiddenColumns) hiddenColumns = loadHiddenColumns();
    if (hiddenColumns.has(colKey)) hiddenColumns.delete(colKey);
    else hiddenColumns.add(colKey);
    saveHiddenColumns();
    renderEntries();
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
    const el = $id("locFeedback");
    if (!el) return;
    if (!message) {
      el.textContent = "";
      setHidden(el, true);
      return;
    }
    el.textContent = message;
    el.style.color =
      tone === "ok"
        ? "var(--c-ok, #1a7a1a)"
        : tone === "warn"
        ? "var(--c-warn, #a87000)"
        : "var(--c-err, #7a1a1a)";
    setHidden(el, false);
  }

  function getActiveProfile() {
    return dataStore.profiles.find((p) => p.id === dataStore.activeProfileId) || null;
  }

  function getLanguageColumns() {
    const canonical =
      Array.isArray(dataStore.languageColumns) && dataStore.languageColumns.length
        ? dataStore.languageColumns
        : ["english", "tchinese"];
    if (!langColumnOrder) langColumnOrder = loadLangColumnOrder();
    const known = new Set(canonical);
    const ordered = langColumnOrder.filter((lang) => known.has(lang));
    canonical.forEach((lang) => {
      if (!ordered.includes(lang)) ordered.push(lang);
    });
    return ordered;
  }

  function reorderLanguageColumn(dragLang, targetLang) {
    const current = getLanguageColumns().slice();
    const from = current.indexOf(dragLang);
    const to = current.indexOf(targetLang);
    if (from === -1 || to === -1 || from === to) return;
    current.splice(from, 1);
    current.splice(to, 0, dragLang);
    langColumnOrder = current;
    saveLangColumnOrder(current);
    renderEntries();
  }

  function blankTranslations(seed) {
    const translations = {};
    getLanguageColumns().forEach((lang) => {
      translations[lang] = seed?.[lang] || "";
    });
    return translations;
  }

  function cloneEntriesWithRowIds(entries) {
    return (Array.isArray(entries) ? entries : []).map((entry) => ({
      __rowId: nextRowId++,
      key: entry?.key || "",
      file: entry?.file || "",
      context: entry?.context || "",
      enabled: entry?.enabled !== false,
      note: entry?.note || "",
      translations: blankTranslations(entry?.translations),
    }));
  }

  function entriesForSave() {
    return workingEntries.map(({ __rowId, __officialBaseline, ...rest }) => rest);
  }

  function snapshotBaseline(officialItem) {
    return {
      file: officialItem?.file || "",
      context: officialItem?.context || "",
      translations: { ...(officialItem?.translations || {}) },
    };
  }

  function matchesBaseline(entry, baseline) {
    if (!baseline) return false;
    if ((entry.file || "") !== (baseline.file || "")) return false;
    if ((entry.context || "") !== (baseline.context || "")) return false;
    return getLanguageColumns().every(
      (lang) => (entry.translations?.[lang] || "") === (baseline.translations?.[lang] || "")
    );
  }

  function langLabel(lang) {
    return String(lang || "").charAt(0).toUpperCase() + String(lang || "").slice(1);
  }

  function findWorkingEntryByKey(key) {
    return workingEntries.find((e) => e.key === key);
  }

  function findOrCreateWorkingEntry(key, seed) {
    let entry = findWorkingEntryByKey(key);
    if (entry) return entry;
    entry = {
      __rowId: nextRowId++,
      __officialBaseline: seed ? snapshotBaseline(seed) : null,
      key,
      file: seed?.file || "",
      context: seed?.context || "",
      enabled: true,
      note: "",
      translations: blankTranslations(seed?.translations),
    };
    workingEntries.push(entry);
    return entry;
  }

  // 匯入時讓使用者勾選要套用的語言欄（沿用 confirm.js/prompt.js 同款 .app-mask overlay 寫法，
  // 只有匯入功能用得到，不做成 App 全域工具）。回傳已勾選的語言陣列，取消則回傳 null。
  function showImportLanguagePicker(availableLangs) {
    return new Promise((resolve) => {
      const mask = document.createElement("div");
      mask.className = "app-mask";
      mask.setAttribute("aria-hidden", "false");
      const itemsHtml = availableLangs
        .map(
          (lang) =>
            `<label class="loc-col-toggle__item"><input type="checkbox" data-import-lang="${escapeHTML(lang)}" checked /> ${escapeHTML(langLabel(lang))}</label>`
        )
        .join("");
      mask.innerHTML = `
        <div class="app-mask__panel" role="dialog" aria-modal="true">
          <div style="display:flex;flex-direction:column;gap:12px;min-width:280px;max-width:360px">
            <h3 style="margin:0;font-size:1.05rem;font-weight:600">${escapeHTML(t("modal.localization.importLangPickerTitle", "選擇要匯入的語言"))}</h3>
            <div style="font-size:0.85rem;color:var(--c-text-sec)">${escapeHTML(t("modal.localization.importLangPickerDesc", "未勾選的語言欄將維持原值，不會被匯入檔案覆寫。"))}</div>
            <div style="display:flex;flex-direction:column;gap:6px;max-height:14rem;overflow-y:auto">${itemsHtml}</div>
            <div class="app-mask__actions">
              <button type="button" class="btn btn--ghost" data-act="cancel">${escapeHTML(t("common.cancel", "取消"))}</button>
              <button type="button" class="btn btn--primary" data-act="confirm">${escapeHTML(t("modal.localization.profileImport", "匯入"))}</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(mask);

      const close = (langs) => {
        document.removeEventListener("keydown", onKey);
        mask.remove();
        resolve(langs);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(null);
      };
      mask.addEventListener("click", (e) => {
        if (e.target === mask) return close(null);
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        if (btn.dataset.act === "cancel") return close(null);
        const selected = Array.from(mask.querySelectorAll("input[data-import-lang]:checked")).map(
          (el) => el.dataset.importLang
        );
        close(selected);
      });
      document.addEventListener("keydown", onKey);
    });
  }

  async function importFromFile(file) {
    const text = await file.text();
    const result = await App.api.localization.import({ text });
    if (!result?.ok) throw new Error(result?.message || "匯入失敗");
    const { headers = [], items = [] } = result.data || {};

    const availableLangs = getLanguageColumns().filter((lang) => headers.includes(lang));
    if (!availableLangs.length) {
      setFeedback(t("modal.localization.importNoLangColumns", "此檔案沒有可辨識的語言欄"), "warn");
      return;
    }

    const selectedLangs = await showImportLanguagePicker(availableLangs);
    if (!selectedLangs || !selectedLangs.length) return;

    const confirmMsg = t(
      "confirm.importLocalizationFile",
      "匯入會覆寫所選語言中、同 Key 的現有編輯內容，確定要匯入嗎？"
    );
    const confirmed = await (App.confirm
      ? App.confirm(confirmMsg, {
          title: t("modal.localization.profileImport", "匯入"),
          continueText: t("common.confirm", "繼續"),
          cancelText: t("common.cancel", "取消"),
        })
      : Promise.resolve(window.confirm(confirmMsg)));
    if (!confirmed) return;

    let diffCount = 0;
    items.forEach((item) => {
      const entry = findOrCreateWorkingEntry(item.key, item.officialItem);
      selectedLangs.forEach((lang) => {
        entry.translations[lang] = item.translations?.[lang] ?? entry.translations[lang];
      });
      if (item.file) entry.file = item.file;
      if (item.context) entry.context = item.context;
      if (item.officialItem && !entry.__officialBaseline) {
        entry.__officialBaseline = snapshotBaseline(item.officialItem);
      }
      if (entry.__officialBaseline && matchesBaseline(entry, entry.__officialBaseline)) {
        workingEntries = workingEntries.filter((e) => e !== entry);
      } else {
        diffCount++;
      }
    });

    renderEntries();
    setFeedback(
      t("modal.localization.importSuccess", "已匯入 {count} 筆，其中 {diff} 筆與官方不同", {
        count: items.length,
        diff: diffCount,
      }),
      "ok"
    );
  }

  function bindImportButton() {
    const importBtn = $id("locProfileImportBtn");
    const fileInput = $id("locImportFileInput");
    if (!importBtn || !fileInput || importBtn.__locBound) return;
    importBtn.__locBound = true;

    importBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      try {
        await importFromFile(file);
      } catch (err) {
        setFeedback(err.message, "err");
      }
    });
  }

  async function ensureFragment() {
    const existing = $id("localizationModal");
    if (existing && existing.classList.contains("modal")) return existing;

    const host =
      $id("localizationModalHost") ||
      document.querySelector('[data-fragment="card-localization-modal"]');
    if (!host) throw new Error("找不到片段宿主節點");

    const res = await fetch("fragments/card-localization-modal.html", { cache: "no-cache" });
    if (!res.ok) throw new Error("載入片段失敗");
    host.innerHTML = await res.text();

    if (App.i18n?.updateDOM) App.i18n.updateDOM();

    const modal = $id("localizationModal");
    if (!modal || !modal.classList.contains("modal")) {
      throw new Error("片段載入後仍找不到 modal 節點");
    }
    return modal;
  }

  function show() {
    const modal = $id("localizationModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function hide() {
    const modal = $id("localizationModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function renderProfileBar() {
    const select = $id("locProfileSelect");
    const info = $id("locProfileInfo");
    if (!select || !info) return;

    const profiles = dataStore.profiles || [];
    const activeId = dataStore.activeProfileId || "";
    const deleteLocked = profiles.length <= 1;

    select.innerHTML = profiles
      .map((profile) => {
        const label = escapeHTML(profile.displayName || profile.name || profile.id || "");
        const selected = profile.id === activeId ? " selected" : "";
        return `<option value="${escapeHTML(profile.id)}"${selected}>${label}</option>`;
      })
      .join("");
    select.disabled = profiles.length === 0;

    const activeProfile = getActiveProfile();
    info.innerHTML = [
      {
        label: t("modal.localization.profileInfoSelected", "目前選取"),
        value: activeProfile?.displayName || activeProfile?.name || "-",
      },
      {
        label: t("modal.localization.profileInfoVersion", "版本"),
        value: dataStore.buildTag || dataStore.buildLabel || "-",
      },
      {
        label: t("modal.localization.profileInfoCount", "筆數"),
        value: String(workingEntries.length),
      },
    ]
      .map(
        (item) =>
          `<div class="loc-profile-info__item"><div class="loc-profile-info__label">${escapeHTML(
            item.label
          )}</div><div class="loc-profile-info__value">${escapeHTML(item.value)}</div></div>`
      )
      .join("");

    const renameBtn = $id("locProfileRenameBtn");
    if (renameBtn) renameBtn.disabled = !activeId;
    const deleteBtn = $id("locProfileDeleteBtn");
    if (deleteBtn) {
      deleteBtn.disabled = !activeId || deleteLocked;
      deleteBtn.title = deleteLocked
        ? t("modal.localization.profileDeleteDisabled", "至少保留一筆設定集，無法刪除最後一筆")
        : t("modal.localization.profileDelete", "刪除目前設定集");
    }
  }

  function matchesFilter(entry) {
    if (!searchTerm) return true;
    const needle = searchTerm.toLowerCase();
    if ((entry.key || "").toLowerCase().includes(needle)) return true;
    return Object.values(entry.translations || {}).some((value) =>
      String(value || "").toLowerCase().includes(needle)
    );
  }

  function renderEntryTableHead() {
    const headRow = $id("locEntryTableHeadRow");
    if (!headRow) return;
    const langHeaders = getLanguageColumns()
      .filter((lang) => isColumnVisible(lang))
      .map(
        (lang) =>
          `<th draggable="true" class="loc-th-draggable" data-lang-col="${escapeHTML(lang)}">${escapeHTML(langLabel(lang))}</th>`
      )
      .join("");
    const fileHeader = isColumnVisible("file")
      ? `<th class="loc-col-file" data-i18n="modal.localization.colFile">${escapeHTML(t("modal.localization.colFile", "File"))}</th>`
      : "";
    headRow.innerHTML = `
      <th class="loc-col-frozen loc-col-frozen--1" data-i18n="modal.localization.colKey">${escapeHTML(t("modal.localization.colKey", "Key"))}</th>
      ${fileHeader}
      ${langHeaders}
      <th></th>`;
    bindEntryTableHeadEvents();
  }

  function renderNewKeyRowHtml() {
    const langCells = getLanguageColumns()
      .filter((lang) => isColumnVisible(lang))
      .map((lang) => `<td><input type="text" data-new-lang="${escapeHTML(lang)}" /></td>`)
      .join("");
    const fileCell = isColumnVisible("file")
      ? `<td class="loc-col-file"><input type="text" data-new-field="file" /></td>`
      : "";
    return `
      <tr id="locNewKeyRow" class="loc-row-new">
        <td class="loc-col-frozen loc-col-frozen--1"><input type="text" id="locNewKeyInput" data-i18n-placeholder="modal.localization.newKeyPlaceholder" placeholder="${escapeHTML(t("modal.localization.newKeyPlaceholder", "輸入新的自訂 Key…"))}" /></td>
        ${fileCell}
        ${langCells}
        <td></td>
      </tr>`;
  }

  // 是否為「有覆寫」的列：只要這個 entry 來自 workingEntries（有 __rowId）就算，
  // 不分是自訂 Key 還是有對應官方 Key 的覆寫——統一用顏色高亮＋刪除/還原按鈕標示，
  // 不會因為有沒有覆寫而改變這一列在表格中的排列位置。
  function renderEntryRowHtml(entry) {
    const hasOverride = entry.__rowId != null;
    const langCells = getLanguageColumns()
      .filter((lang) => isColumnVisible(lang))
      .map((lang) => {
        const value = entry.translations?.[lang] || "";
        const emptyClass = value ? "" : " loc-lang-input--empty";
        return `<td><input type="text" class="loc-lang-input${emptyClass}" data-lang="${escapeHTML(lang)}" value="${escapeHTML(value)}" title="${escapeHTML(value)}" /></td>`;
      })
      .join("");
    const fileCell = isColumnVisible("file")
      ? `<td class="loc-col-file"><span class="loc-key-readonly" title="${escapeHTML(entry.file || "")}">${escapeHTML(entry.file || "")}</span></td>`
      : "";
    const rowAttr = hasOverride ? `data-row-id="${entry.__rowId}"` : `data-official-key="${escapeHTML(entry.key)}"`;
    const rowClass = hasOverride ? " loc-row--edited" : "";
    return `
      <tr ${rowAttr} class="loc-entry-row${rowClass}">
        <td class="loc-col-frozen loc-col-frozen--1"><span class="loc-key-readonly" title="${escapeHTML(entry.key)}">${escapeHTML(entry.key)}</span></td>
        ${fileCell}
        ${langCells}
        <td>${hasOverride ? '<button type="button" data-act="delete-entry">🗑️</button>' : ""}</td>
      </tr>`;
  }

  function pruneRevertedOverrides() {
    officialItems.forEach((item) => {
      const existing = findWorkingEntryByKey(item.key);
      if (!existing) return;
      if (!existing.__officialBaseline) existing.__officialBaseline = snapshotBaseline(item);
      if (matchesBaseline(existing, existing.__officialBaseline)) {
        workingEntries = workingEntries.filter((e) => e !== existing);
      }
    });
  }

  function updateEntryCount(visibleCount) {
    const countEl = $id("locEntryCount");
    if (!countEl) return;
    countEl.textContent = t(
      "modal.localization.entryCountValue",
      "已編輯 {edited} 筆（顯示 {visible} 筆）",
      { edited: workingEntries.length, visible: visibleCount }
    );
  }

  // 「全部／未編輯」模式：沿用官方分頁＋搜尋的瀏覽順序，只在渲染時決定要不要
  // 顯示覆寫列，不重新排序、不把覆寫搬到頂部，靠 .loc-row--edited 顏色高亮提示差異。
  function renderCatalogTable(tbody) {
    // 有對應官方 Key 的覆寫（entry.__officialBaseline 存在）不獨立列出，只在官方分頁
    // 捲到該 Key 時於原本位置顯示（見下方 officialHtml）。只有「官方完全沒有這個 Key」
    // 的自訂條目才需要獨立列出，因為它們本來就沒有可以對齊的官方位置。
    const customEntries = workingEntries.filter((e) => !e.__officialBaseline);
    const customVisible = statusFilter === "unedited" ? [] : customEntries.filter(matchesFilter);

    const newRowHtml = renderNewKeyRowHtml();
    const customHtml = customVisible.map((entry) => renderEntryRowHtml(entry)).join("");

    let pageOverrideCount = 0;
    const officialHtml = officialItems
      .filter((item) => statusFilter !== "unedited" || !findWorkingEntryByKey(item.key))
      .map((item) => {
        const override = findWorkingEntryByKey(item.key);
        if (override) pageOverrideCount++;
        const display = override || {
          key: item.key,
          file: item.file,
          translations: item.translations,
        };
        return renderEntryRowHtml(display);
      })
      .join("");

    tbody.innerHTML = newRowHtml + customHtml + officialHtml;
    updateEntryCount(customVisible.length + pageOverrideCount);
  }

  // 「已編輯」模式：覆寫散落在整個官方目錄各處，不可能對齊官方分頁，
  // 改成直接在已載入的 workingEntries 上做本地分頁，瀏覽所有與官方不同的條目。
  function renderEditedOnlyTable(tbody) {
    const editedVisible = workingEntries.filter(matchesFilter);
    editedPageInfo.total = editedVisible.length;
    editedPageInfo.totalPages = Math.max(1, Math.ceil(editedVisible.length / editedPageInfo.pageSize));
    editedPageInfo.page = Math.min(Math.max(0, editedPageInfo.page), editedPageInfo.totalPages - 1);

    const start = editedPageInfo.page * editedPageInfo.pageSize;
    const pageItems = editedVisible.slice(start, start + editedPageInfo.pageSize);

    const newRowHtml = renderNewKeyRowHtml();
    const rowsHtml = pageItems.map((entry) => renderEntryRowHtml(entry)).join("");
    tbody.innerHTML = newRowHtml + rowsHtml;
    updateEntryCount(pageItems.length);
  }

  function renderEntries() {
    const tbody = $id("locEntryTableBody");
    if (!tbody) return;

    renderEntryTableHead();
    pruneRevertedOverrides();

    if (statusFilter === "edited") {
      renderEditedOnlyTable(tbody);
    } else {
      renderCatalogTable(tbody);
    }

    renderProfileBar();
    renderOfficialPager();
  }

  function findEntry(rowId) {
    return workingEntries.find((e) => String(e.__rowId) === String(rowId));
  }

  function bindEntryTableHeadEvents() {
    const headRow = $id("locEntryTableHeadRow");
    if (!headRow || headRow.__locBound) return;
    headRow.__locBound = true;

    let dragLang = null;
    headRow.addEventListener("dragstart", (e) => {
      const th = e.target.closest("th[data-lang-col]");
      if (!th) return;
      dragLang = th.dataset.langCol;
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    headRow.addEventListener("dragover", (e) => {
      if (!dragLang) return;
      const th = e.target.closest("th[data-lang-col]");
      if (!th) return;
      e.preventDefault();
    });
    headRow.addEventListener("drop", (e) => {
      const th = e.target.closest("th[data-lang-col]");
      if (!th || !dragLang) return;
      e.preventDefault();
      reorderLanguageColumn(dragLang, th.dataset.langCol);
      dragLang = null;
    });
  }

  function commitNewKeyRow() {
    const newRow = $id("locNewKeyRow");
    const keyInput = $id("locNewKeyInput");
    if (!newRow || !keyInput) return;
    const key = keyInput.value.trim();
    if (!key) return;
    if (findWorkingEntryByKey(key)) {
      setFeedback(t("modal.localization.duplicateKeyError", "此 Key 已存在於清單中，請改用下方對應列編輯"), "err");
      return;
    }
    const seedTranslations = {};
    getLanguageColumns().forEach((lang) => {
      seedTranslations[lang] = newRow.querySelector(`[data-new-lang="${lang}"]`)?.value || "";
    });
    const fileValue = newRow.querySelector('[data-new-field="file"]')?.value || "";
    findOrCreateWorkingEntry(key, { file: fileValue, translations: seedTranslations });
    renderEntries();
  }

  function bindEntryTableEvents() {
    const tbody = $id("locEntryTableBody");
    if (!tbody || tbody.__locBound) return;
    tbody.__locBound = true;

    // 常駐「新增自訂 Key」列：輸入過程不重繪（避免每打一個字元就重建 DOM 導致失焦），
    // 只在 Key 欄位失焦（或按 Enter）時才提交，提交後才整表重新渲染。
    tbody.addEventListener("focusout", (e) => {
      if (e.target.id === "locNewKeyInput") commitNewKeyRow();
    });
    tbody.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.id === "locNewKeyInput") {
        e.preventDefault();
        e.target.blur();
      }
    });

    tbody.addEventListener("input", (e) => {
      if (e.target.closest("#locNewKeyRow")) return;

      // 已編輯 / 官方瀏覽列（key 一律唯讀，只有這兩種列才有 data-row-id / data-official-key）
      const row = e.target.closest("tr[data-row-id], tr[data-official-key]");
      if (!row) return;

      let entry;
      if (row.dataset.rowId) {
        entry = findEntry(row.dataset.rowId);
      } else {
        const officialItem = officialItems.find((item) => item.key === row.dataset.officialKey);
        entry = findOrCreateWorkingEntry(row.dataset.officialKey, officialItem);
        if (!row.classList.contains("loc-row--edited")) {
          row.classList.add("loc-row--edited");
        }
      }
      if (!entry) return;

      const lang = e.target.dataset.lang;
      if (!lang) return;
      entry.translations[lang] = e.target.value;
      e.target.classList.toggle("loc-lang-input--empty", !e.target.value);

      // 還原偵測：若編輯後的值與官方原文快照完全一致，視為已還原，
      // 移除此覆寫並立即清掉黃色標示（不整表重繪，避免輸入焦點被打斷）。
      if (entry.__officialBaseline && matchesBaseline(entry, entry.__officialBaseline)) {
        workingEntries = workingEntries.filter((e2) => e2 !== entry);
        row.classList.remove("loc-row--edited");
      } else if (!row.classList.contains("loc-row--edited")) {
        row.classList.add("loc-row--edited");
      }
    });

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-act="delete-entry"]');
      if (!btn) return;
      const row = btn.closest("tr[data-row-id]");
      if (!row) return;
      workingEntries = workingEntries.filter((entry) => String(entry.__rowId) !== row.dataset.rowId);
      renderEntries();
    });
  }

  async function loadOfficialPage(page) {
    try {
      const result = await App.api.localization.officialKeys({
        version: getSelectedVersion(),
        search: searchTerm,
        page: Number.isInteger(page) ? page : 0,
        pageSize: officialPageInfo.pageSize,
      });
      officialItems = result?.data?.items || [];
      officialPageInfo = {
        page: result?.data?.page ?? 0,
        pageSize: result?.data?.pageSize ?? officialPageInfo.pageSize,
        total: result?.data?.total ?? 0,
        totalPages: result?.data?.totalPages ?? 0,
      };
    } catch (_e) {
      officialItems = [];
      officialPageInfo = { page: 0, pageSize: officialPageInfo.pageSize, total: 0, totalPages: 0 };
    }
    renderEntries();
  }

  function renderOfficialPager() {
    const el = $id("locOfficialPager");
    if (!el) return;
    const { page, totalPages, total, pageSize } =
      statusFilter === "edited" ? editedPageInfo : officialPageInfo;
    if (!total) {
      el.innerHTML = "";
      return;
    }
    const start = page * pageSize + 1;
    const end = Math.min(start + pageSize - 1, total);
    el.innerHTML =
      `<span class="loc-import-pager__status">${escapeHTML(
        t("modal.localization.importPagerStatus", "{start}-{end} / {total} 筆", { start, end, total })
      )}</span>` +
      `<div class="loc-import-pager__controls">` +
      `<button type="button" class="btn btn--ghost loc-import-pager__btn" data-page-dir="prev" ${page <= 0 ? "disabled" : ""} title="${escapeHTML(t("modal.localization.pagerPrev", "上一頁"))}">‹</button>` +
      `<button type="button" class="btn btn--ghost loc-import-pager__btn" data-page-dir="next" ${page >= totalPages - 1 ? "disabled" : ""} title="${escapeHTML(t("modal.localization.pagerNext", "下一頁"))}">›</button>` +
      `</div>`;
  }

  function isDirty() {
    return JSON.stringify(entriesForSave()) !== savedSnapshot;
  }

  function applyDataStore(data) {
    dataStore = data || { profiles: [], activeProfileId: null, languageColumns: [] };
    const activeProfile = getActiveProfile();
    workingEntries = cloneEntriesWithRowIds(activeProfile?.entries);
    savedSnapshot = JSON.stringify(entriesForSave());
    editedPageInfo.page = 0;
    renderProfileBar();
    loadOfficialPage(0);
  }

  async function load() {
    try {
      const result = await App.api.localization.list(getSelectedVersion());
      if (!result?.ok) throw new Error(result?.message || "讀取語系設定集失敗");
      applyDataStore(result.data);
    } catch (err) {
      setFeedback(err.message, "err");
    }
  }

  function bindEntryToolbar() {
    const search = $id("locEntrySearch");
    if (search && !search.__locBound) {
      search.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          searchTerm = search.value || "";
          editedPageInfo.page = 0;
          if (statusFilter === "edited") {
            renderEntries();
          } else {
            loadOfficialPage(0);
          }
        }, 200);
      });
      search.__locBound = true;
    }

    bindColumnToggle();
    bindStatusFilter();
  }

  // 「狀態篩選」下拉：篩選出目前清單裡是否有修改過官方原文，不影響語言欄顯示順序。
  function bindStatusFilter() {
    const select = $id("locStatusFilter");
    if (!select || select.__locBound) return;
    select.__locBound = true;
    select.value = statusFilter;
    select.addEventListener("change", () => {
      statusFilter = select.value;
      editedPageInfo.page = 0;
      if (statusFilter === "edited") {
        renderEntries();
      } else {
        loadOfficialPage(0);
      }
    });
  }

  function renderColumnTogglePanel() {
    const panel = $id("locColTogglePanel");
    if (!panel) return;
    const items = [{ key: "file", label: t("modal.localization.colFile", "File") }].concat(
      getLanguageColumns().map((lang) => ({ key: lang, label: langLabel(lang) }))
    );
    panel.innerHTML = items
      .map(
        (item) =>
          `<label class="loc-col-toggle__item"><input type="checkbox" data-col-toggle="${escapeHTML(item.key)}" ${isColumnVisible(item.key) ? "checked" : ""} /> ${escapeHTML(item.label)}</label>`
      )
      .join("");
  }

  function bindColumnToggle() {
    const btn = $id("locColToggleBtn");
    const panel = $id("locColTogglePanel");
    if (!btn || !panel || btn.__locBound) return;
    btn.__locBound = true;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = panel.classList.contains("hidden");
      if (willOpen) renderColumnTogglePanel();
      panel.classList.toggle("hidden");
    });
    panel.addEventListener("change", (e) => {
      const key = e.target.dataset.colToggle;
      if (!key) return;
      toggleColumnVisibility(key);
    });
    document.addEventListener("click", (e) => {
      if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== btn) {
        panel.classList.add("hidden");
      }
    });
  }

  function bindOfficialPager() {
    const pager = $id("locOfficialPager");
    if (!pager || pager.__locBound) return;
    pager.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page-dir]");
      if (!btn || btn.disabled) return;
      const dir = btn.dataset.pageDir === "next" ? 1 : -1;
      if (statusFilter === "edited") {
        editedPageInfo.page += dir;
        renderEntries();
      } else {
        loadOfficialPage(officialPageInfo.page + dir);
      }
    });
    pager.__locBound = true;
  }

  function bindProfileBarEvents() {
    const select = $id("locProfileSelect");
    if (select && !select.__locBound) {
      select.addEventListener("change", async () => {
        try {
          const result = await App.api.localization.select({
            version: getSelectedVersion(),
            profileId: select.value,
          });
          if (!result?.ok) throw new Error(result?.message || "切換設定集失敗");
          applyDataStore(result.data);
        } catch (err) {
          setFeedback(err.message, "err");
        }
      });
      select.__locBound = true;
    }

    const createBtn = $id("locProfileCreateBtn");
    if (createBtn && !createBtn.__locBound) {
      createBtn.addEventListener("click", async () => {
        const name = await (App.prompt
          ? App.prompt(t("modal.localization.profileNamePrompt", "請輸入設定集名稱"), "", {
              title: t("modal.localization.profileCreate", "建立新設定集"),
            })
          : Promise.resolve(window.prompt(t("modal.localization.profileNamePrompt", "請輸入設定集名稱"), "")));
        if (name == null) return;
        try {
          const result = await App.api.localization.create({
            version: getSelectedVersion(),
            name,
          });
          if (!result?.ok) throw new Error(result?.message || "建立設定集失敗");
          applyDataStore(result.data);
          setFeedback(t("modal.localization.profileCreated", "已建立設定集"), "ok");
        } catch (err) {
          setFeedback(err.message, "err");
        }
      });
      createBtn.__locBound = true;
    }

    const copyFromBtn = $id("locProfileCopyFromBtn");
    if (copyFromBtn && !copyFromBtn.__locBound) {
      copyFromBtn.addEventListener("click", async () => {
        const sourceVersion = await (App.prompt
          ? App.prompt(
              t("modal.localization.profileCopyFromVersionPrompt", "請輸入要複製來源的遊戲版本"),
              ""
            )
          : Promise.resolve(window.prompt(t("modal.localization.profileCopyFromVersionPrompt", "請輸入要複製來源的遊戲版本"), "")));
        if (!sourceVersion) return;
        try {
          const sourceResult = await App.api.localization.list(sourceVersion);
          if (!sourceResult?.ok) throw new Error(sourceResult?.message || "讀取來源版本失敗");
          const sourceProfile = sourceResult.data?.activeProfile;
          if (!sourceProfile) throw new Error(t("modal.localization.profileCopyFromEmpty", "來源版本沒有可複製的設定集"));

          const name = await (App.prompt
            ? App.prompt(t("modal.localization.profileNamePrompt", "請輸入設定集名稱"), sourceProfile.name || "")
            : Promise.resolve(window.prompt(t("modal.localization.profileNamePrompt", "請輸入設定集名稱"), sourceProfile.name || "")));
          if (name == null) return;

          const result = await App.api.localization.create({
            version: getSelectedVersion(),
            name,
            sourceProfileId: sourceProfile.id,
            entries: sourceProfile.entries,
          });
          if (!result?.ok) throw new Error(result?.message || "建立設定集失敗");
          applyDataStore(result.data);
          setFeedback(t("modal.localization.profileCreated", "已建立設定集"), "ok");
        } catch (err) {
          setFeedback(err.message, "err");
        }
      });
      copyFromBtn.__locBound = true;
    }

    const renameBtn = $id("locProfileRenameBtn");
    if (renameBtn && !renameBtn.__locBound) {
      renameBtn.addEventListener("click", async () => {
        const activeProfile = getActiveProfile();
        if (!activeProfile) return;
        const name = await (App.prompt
          ? App.prompt(t("modal.localization.profileRenamePrompt", "請輸入新的設定集名稱"), activeProfile.name || "")
          : Promise.resolve(window.prompt(t("modal.localization.profileRenamePrompt", "請輸入新的設定集名稱"), activeProfile.name || "")));
        if (name == null) return;
        try {
          const result = await App.api.localization.rename({
            version: getSelectedVersion(),
            profileId: activeProfile.id,
            name,
          });
          if (!result?.ok) throw new Error(result?.message || "設定集改名失敗");
          applyDataStore(result.data);
        } catch (err) {
          setFeedback(err.message, "err");
        }
      });
      renameBtn.__locBound = true;
    }

    const deleteBtn = $id("locProfileDeleteBtn");
    if (deleteBtn && !deleteBtn.__locBound) {
      deleteBtn.addEventListener("click", async () => {
        const activeProfile = getActiveProfile();
        if (!activeProfile) return;
        const confirmed = await (App.confirm
          ? App.confirm(t("confirm.deleteLocalizationProfile", "是否確定刪除此語系設定集？"), {
              title: t("modal.localization.profileDelete", "刪除目前設定集"),
              continueText: t("common.confirm", "繼續"),
              cancelText: t("common.cancel", "取消"),
            })
          : Promise.resolve(window.confirm(t("confirm.deleteLocalizationProfile", "是否確定刪除此語系設定集？"))));
        if (!confirmed) return;
        try {
          const result = await App.api.localization.delete({
            version: getSelectedVersion(),
            profileId: activeProfile.id,
          });
          if (!result?.ok) throw new Error(result?.message || "刪除設定集失敗");
          applyDataStore(result.data);
        } catch (err) {
          setFeedback(err.message, "err");
        }
      });
      deleteBtn.__locBound = true;
    }
  }

  async function saveEntries() {
    const activeProfile = getActiveProfile();
    if (!activeProfile) throw new Error(t("modal.localization.noActiveProfile", "尚未選取設定集"));
    const result = await App.api.localization.save({
      version: getSelectedVersion(),
      profileId: activeProfile.id,
      entries: entriesForSave(),
    });
    if (!result?.ok) {
      const detail = Array.isArray(result?.errors) && result.errors.length
        ? ` (${result.errors.map((e) => `#${e.index + 1}: ${e.reason}`).join(", ")})`
        : "";
      throw new Error((result?.message || "儲存失敗") + detail);
    }
    applyDataStore(result.data);
    return result.data;
  }

  function bindFooterEvents() {
    const saveBtn = $id("locSaveBtn");
    if (saveBtn && !saveBtn.__locBound) {
      saveBtn.addEventListener("click", async () => {
        try {
          await saveEntries();
          setFeedback(t("modal.localization.saveSuccess", "已儲存翻譯清單"), "ok");
        } catch (err) {
          setFeedback(err.message, "err");
        }
      });
      saveBtn.__locBound = true;
    }

    const generateBtn = $id("locGenerateBtn");
    if (generateBtn && !generateBtn.__locBound) {
      generateBtn.addEventListener("click", async () => {
        const confirmed = await (App.confirm
          ? App.confirm(t("confirm.generateLocalizationMod", "生成後需重啟伺服器才會套用，確定要生成嗎？"), {
              title: t("modal.localization.generate", "生成並寫入 Mod"),
              continueText: t("common.confirm", "繼續"),
              cancelText: t("common.cancel", "取消"),
            })
          : Promise.resolve(window.confirm(t("confirm.generateLocalizationMod", "生成後需重啟伺服器才會套用，確定要生成嗎？"))));
        if (!confirmed) return;
        try {
          const saved = await saveEntries();
          const activeProfile = (saved.profiles || []).find((p) => p.id === saved.activeProfileId);
          const result = await App.api.localization.generate({
            version: getSelectedVersion(),
            profileId: activeProfile?.id,
          });
          if (!result?.ok) throw new Error(result?.message || "生成失敗");
          setFeedback(
            t("modal.localization.generateSuccess", "已生成 {count} 筆翻譯，請重啟伺服器套用", {
              count: result.data?.rowCount ?? 0,
            }),
            "ok"
          );
          await App.localization?.refresh?.();
        } catch (err) {
          setFeedback(err.message, "err");
        }
      });
      generateBtn.__locBound = true;
    }
  }

  async function attemptClose() {
    if (isDirty()) {
      const confirmed = await (App.confirm
        ? App.confirm(
            t("confirm.discardLocalizationChanges", "目前有未儲存的翻譯修改，確定要關閉並捨棄變更嗎？"),
            {
              title: t("modal.localization.title", "遊戲翻譯編輯器"),
              continueText: t("common.confirm", "繼續"),
              cancelText: t("common.cancel", "取消"),
            }
          )
        : Promise.resolve(
            window.confirm(
              t("confirm.discardLocalizationChanges", "目前有未儲存的翻譯修改，確定要關閉並捨棄變更嗎？")
            )
          ));
      if (!confirmed) return;
    }
    hide();
  }

  function wireModal() {
    const modal = $id("localizationModal");
    if (!modal || modal.__locWired) return;
    modal.__locWired = true;

    const closeBtn = $id("loc-modal-close-btn");
    closeBtn?.addEventListener("click", attemptClose);
    let mousedownOnBackdrop = false;
    modal.addEventListener("mousedown", (e) => {
      mousedownOnBackdrop = e.target === modal;
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal && mousedownOnBackdrop) attemptClose();
      mousedownOnBackdrop = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) attemptClose();
    });

    bindProfileBarEvents();
    bindImportButton();
    bindEntryToolbar();
    bindEntryTableEvents();
    bindOfficialPager();
    bindFooterEvents();
  }

  async function open() {
    await ensureFragment();
    wireModal();
    show();
    await load();
  }

  function bindTrigger() {
    App.localizationModal = { open, hide };
  }

  bindTrigger();
})(window);
