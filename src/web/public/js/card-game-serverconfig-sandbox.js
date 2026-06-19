(function (w) {
  const App = (w.App = w.App || {});

  function createController(options) {
    const cfgState = options.cfgState;
    const api = options.api;
    const t = options.t;
    const escapeHTML = options.escapeHTML;
    const getLocked = options.getLocked;
    const rerunChecks = options.rerunChecks;
    const appendLog = options.appendLog;

    function getLocalizedCategory(categoryName) {
      const key = `modal.serverconfig.sandbox.categories.${categoryName}`;
      const translated = App.i18n?.t ? App.i18n.t(key) : key;
      return translated && translated !== key ? translated : categoryName;
    }

    function getLocalizedOptionLabel(option) {
      if (!option) return "";
      const fieldKey = `modal.serverconfig.fields.${option.id}.label`;
      const fieldLabel = App.i18n?.t ? App.i18n.t(fieldKey) : fieldKey;
      if (fieldLabel && fieldLabel !== fieldKey) {
        return fieldLabel;
      }
      const optionKey = `modal.serverconfig.sandbox.options.${option.id}`;
      const translated = App.i18n?.t ? App.i18n.t(optionKey) : optionKey;
      return translated && translated !== optionKey
        ? translated
        : option.label || option.id || "";
    }

    function ensureStore() {
      if (!cfgState.sandbox || typeof cfgState.sandbox !== "object") {
        cfgState.sandbox = {};
      }
      const sandbox = cfgState.sandbox;
      if (!sandbox.ui) sandbox.ui = {};
      if (!sandbox.selections) sandbox.selections = {};
      if (!Array.isArray(sandbox.optionList)) sandbox.optionList = [];
      if (!sandbox.optionMap) sandbox.optionMap = new Map();
      if (!sandbox.valueSetMap) sandbox.valueSetMap = new Map();
      if (!sandbox.categoryMap) sandbox.categoryMap = new Map();
      if (!sandbox.statusTone) sandbox.statusTone = "muted";
      if (!sandbox.statusText) sandbox.statusText = "";
      if (typeof sandbox.dirty !== "boolean") sandbox.dirty = false;
      return sandbox;
    }

    function resetStore() {
      cfgState.sandbox = {
        schema: null,
        ui: {},
        selections: {},
        optionList: [],
        optionMap: new Map(),
        valueSetMap: new Map(),
        categoryMap: new Map(),
        dirty: false,
        statusTone: "muted",
        statusText: "",
        lastLoadedCode: "",
        boundName: "SandboxCode",
      };
      return cfgState.sandbox;
    }

    function humanizeToken(token) {
      const raw = String(token || "").trim();
      if (!raw) return "";
      return raw
        .replace(/^go/, "")
        .replace(/^xuiOptionsVideo/, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .trim();
    }

    function formatValueLabel(valueSet, entry) {
      if (!entry) return "";
      const labels = [];
      const display = Array.isArray(valueSet?.displayValues)
        ? valueSet.displayValues[entry.index]
        : "";
      const alt = Array.isArray(valueSet?.alternateDisplayValues)
        ? valueSet.alternateDisplayValues[entry.index]
        : "";
      const numeric =
        entry.value == null || entry.value === ""
          ? String(entry.rawValue || "")
          : String(entry.value);

      if (display) labels.push(humanizeToken(display) || String(display));
      if (alt && !labels.includes(alt)) labels.push(alt);
      if (numeric && !labels.includes(numeric)) labels.push(numeric);

      return labels.filter(Boolean).join(" / ") || String(entry.rawValue || entry.code || "");
    }

    function buildDefaultSelections(schema) {
      const selections = {};
      const optionList = Array.isArray(schema?.options) ? schema.options : [];
      optionList.forEach((option) => {
        selections[option.id] = option.defaultIndex;
      });
      return selections;
    }

    function setStatus(message, tone) {
      const sandbox = ensureStore();
      sandbox.statusText = String(message || "");
      sandbox.statusTone = tone || "muted";
      const statusEl = sandbox.ui?.status;
      if (!statusEl) return;
      statusEl.className = `cfg-sandbox__status cfg-sandbox__status--${sandbox.statusTone}`;
      statusEl.textContent = sandbox.statusText;
    }

    function updateSummary() {
      const sandbox = ensureStore();
      const summaryEl = sandbox.ui?.summary;
      if (!summaryEl) return;

      const optionList = sandbox.optionList || [];
      const changedCount = optionList.filter(
        (option) => Number(sandbox.selections?.[option.id]) !== Number(option.defaultIndex)
      ).length;
      const rawCode = String(sandbox.ui?.boundInput?.value || "").trim();
      const codeLabel = rawCode
        ? t("modal.serverconfig.sandboxCodeLengthValue", "目前代碼長度 {count}", {
            count: rawCode.length,
          })
        : t("modal.serverconfig.sandboxCodeEmptyValue", "目前代碼為空");

      summaryEl.innerHTML = [
        `<span class="cfg-sandbox__pill">${escapeHTML(
          t("modal.serverconfig.sandboxOptionCountValue", "官方欄位 {count} 項", {
            count: optionList.length,
          })
        )}</span>`,
        `<span class="cfg-sandbox__pill">${escapeHTML(
          t("modal.serverconfig.sandboxChangedCountValue", "偏離預設 {count} 項", {
            count: changedCount,
          })
        )}</span>`,
        `<span class="cfg-sandbox__pill">${escapeHTML(codeLabel)}</span>`,
        `<span class="cfg-sandbox__pill">${escapeHTML(
          sandbox.dirty
            ? t("modal.serverconfig.sandboxPendingValue", "表單尚未回寫")
            : t("modal.serverconfig.sandboxSyncedValue", "表單與欄位已同步")
        )}</span>`,
      ].join("");
    }

    function setDirty(dirty) {
      const sandbox = ensureStore();
      sandbox.dirty = !!dirty;
      updateSummary();
    }

    function setControlsDisabled() {
      const sandbox = ensureStore();
      const enabled = sandbox.ui?.enableCheckbox
        ? !!sandbox.ui.enableCheckbox.checked
        : false;
      const disabled = !!getLocked() || !enabled || !sandbox.schema;
      (sandbox.ui?.selects || []).forEach((select) => {
        select.disabled = disabled;
      });
      (sandbox.ui?.buttons || []).forEach((button) => {
        button.disabled = disabled;
      });
    }

    function collectSelectionsFromUI() {
      const sandbox = ensureStore();
      const selections = {};
      (sandbox.optionList || []).forEach((option) => {
        const select = sandbox.ui?.selectMap?.get(option.id);
        const nextValue = parseInt(String(select?.value ?? option.defaultIndex), 10);
        selections[option.id] = Number.isFinite(nextValue)
          ? nextValue
          : option.defaultIndex;
      });
      sandbox.selections = selections;
      return selections;
    }

    function applySelectionsToUI(selections, uiOptions) {
      const sandbox = ensureStore();
      const nextSelections = {};
      const opts = uiOptions || {};

      (sandbox.optionList || []).forEach((option) => {
        const valueIndex = Number.isFinite(Number(selections?.[option.id]))
          ? Number(selections[option.id])
          : option.defaultIndex;
        nextSelections[option.id] = valueIndex;
        const select = sandbox.ui?.selectMap?.get(option.id);
        if (select) select.value = String(valueIndex);
      });

      sandbox.selections = nextSelections;
      sandbox.dirty = Object.prototype.hasOwnProperty.call(opts, "dirty")
        ? !!opts.dirty
        : false;
      if (typeof opts.lastLoadedCode === "string") {
        sandbox.lastLoadedCode = opts.lastLoadedCode;
      }
      updateSummary();
    }

    async function syncCodeFieldFromEditor() {
      const sandbox = ensureStore();
      if (!sandbox.schema || !sandbox.ui?.boundInput) {
        return { ok: true, skipped: true };
      }

      const result = await api.encode({
        selections: collectSelectionsFromUI(),
        includeDefaults: false,
      });
      if (!result?.ok || !result?.data?.valid) {
        const message =
          result?.message ||
          result?.data?.errors?.join(" | ") ||
          t("messages.sandboxEncodeFailed", "SandboxCode 編碼失敗");
        setStatus(message, "err");
        throw new Error(message);
      }

      sandbox.ui.boundInput.value = result.data.code || "";
      sandbox.lastLoadedCode = sandbox.ui.boundInput.value;
      sandbox.dirty = false;
      updateSummary();
      setStatus(
        t("messages.sandboxEncoded", "已將 SandboxCode 表單寫回欄位"),
        "ok"
      );
      return result;
    }

    async function restoreFromCode(code, restoreOptions) {
      const sandbox = ensureStore();
      const opts = restoreOptions || {};
      if (!sandbox.schema) {
        setStatus(
          t("messages.sandboxSchemaUnavailable", "SandboxCode schema 無法載入"),
          "err"
        );
        return { ok: false };
      }

      const rawCode = String(code || "").trim();
      if (!rawCode) {
        applySelectionsToUI(buildDefaultSelections(sandbox.schema), {
          dirty: false,
          lastLoadedCode: "",
        });
        setStatus(
          t("messages.sandboxLoadedDefaults", "SandboxCode 為空，已載入官方預設"),
          "warn"
        );
        return { ok: true, empty: true };
      }

      const result = await api.decode({
        code: rawCode,
        includeDefaults: true,
      });
      const state = result?.data?.state || {};
      const selections = {};
      Object.keys(state).forEach((optionId) => {
        const resolved = state[optionId];
        if (resolved && Number.isInteger(resolved.valueIndex)) {
          selections[optionId] = resolved.valueIndex;
        }
      });
      applySelectionsToUI(selections, {
        dirty: false,
        lastLoadedCode: rawCode,
      });

      if (!result?.ok || !result?.data?.valid) {
        const message =
          result?.message ||
          result?.data?.errors?.join(" | ") ||
          t("messages.sandboxDecodeFailed", "SandboxCode 解碼失敗");
        setStatus(message, "err");
        return { ok: false, result };
      }

      setStatus(
        opts.initial
          ? t("messages.sandboxDecodedInitial", "已根據目前 SandboxCode 還原表單")
          : t("messages.sandboxDecoded", "已從 SandboxCode 還原表單"),
        "ok"
      );
      return { ok: true, result };
    }

    function createPanel() {
      const sandbox = ensureStore();
      const panel = document.createElement("div");
      panel.className = "cfg-sandbox cfg-sandbox--embedded";

      const head = document.createElement("div");
      head.className = "cfg-sandbox__head";

      const copy = document.createElement("div");
      copy.className = "cfg-sandbox__copy";
      copy.innerHTML =
        `<div class="cfg-sandbox__title">${escapeHTML(
          t("modal.serverconfig.sandboxEditorTitle", "SandboxCode 轉換")
        )}</div>` +
        `<div class="cfg-sandbox__desc">${escapeHTML(
          t(
            "modal.serverconfig.sandboxEditorDesc",
            "這一區會把 SandboxCode 欄位還原成 150 項官方選項，並可再編碼回同一欄位。"
          )
        )}</div>`;

      const actions = document.createElement("div");
      actions.className = "cfg-sandbox__actions";

      const decodeBtn = document.createElement("button");
      decodeBtn.type = "button";
      decodeBtn.className = "btn";
      decodeBtn.textContent = t(
        "modal.serverconfig.sandboxDecodeBtn",
        "從 SandboxCode 還原"
      );

      const encodeBtn = document.createElement("button");
      encodeBtn.type = "button";
      encodeBtn.className = "btn";
      encodeBtn.textContent = t(
        "modal.serverconfig.sandboxEncodeBtn",
        "編碼回 SandboxCode"
      );

      const defaultsBtn = document.createElement("button");
      defaultsBtn.type = "button";
      defaultsBtn.className = "btn";
      defaultsBtn.textContent = t(
        "modal.serverconfig.sandboxResetBtn",
        "載入官方預設"
      );

      actions.appendChild(decodeBtn);
      actions.appendChild(encodeBtn);
      actions.appendChild(defaultsBtn);
      head.appendChild(copy);
      head.appendChild(actions);

      const summary = document.createElement("div");
      summary.className = "cfg-sandbox__summary";

      const status = document.createElement("div");
      status.className = "cfg-sandbox__status cfg-sandbox__status--muted";

      const categoriesWrap = document.createElement("div");
      categoriesWrap.className = "cfg-sandbox__categories";

      panel.appendChild(head);
      panel.appendChild(summary);
      panel.appendChild(status);
      panel.appendChild(categoriesWrap);

      sandbox.ui.summary = summary;
      sandbox.ui.status = status;
      sandbox.ui.buttons = [decodeBtn, encodeBtn, defaultsBtn];
      sandbox.ui.selectMap = new Map();
      sandbox.ui.selects = [];

      decodeBtn.addEventListener("click", async () => {
        try {
          await restoreFromCode(sandbox.ui?.boundInput?.value || "");
          await rerunChecks();
        } catch (err) {
          setStatus(err.message, "err");
        }
      });

      encodeBtn.addEventListener("click", async () => {
        try {
          await syncCodeFieldFromEditor();
          await rerunChecks();
        } catch (err) {
          appendLog(
            "system",
            `❌ ${t("messages.sandboxEncodeFailed", "SandboxCode 編碼失敗: {error}", {
              error: err.message,
            })}`,
            Date.now()
          );
        }
      });

      defaultsBtn.addEventListener("click", async () => {
        applySelectionsToUI(buildDefaultSelections(sandbox.schema), {
          dirty: true,
        });
        setStatus(
          t("messages.sandboxDefaultsApplied", "已套用 SandboxCode 官方預設，尚未回寫"),
          "warn"
        );
        await rerunChecks();
      });

      if (!sandbox.schema) {
        setStatus(
          t("messages.sandboxSchemaUnavailable", "SandboxCode schema 無法載入"),
          "err"
        );
        return panel;
      }

      sandbox.optionList = Array.isArray(sandbox.schema.options)
        ? sandbox.schema.options.slice()
        : [];
      sandbox.optionMap = new Map(sandbox.optionList.map((option) => [option.id, option]));
      sandbox.valueSetMap = new Map(
        (sandbox.schema.valueSets || []).map((valueSet) => [valueSet.id, valueSet])
      );
      sandbox.categoryMap = new Map();
      sandbox.optionList.forEach((option) => {
        const list = sandbox.categoryMap.get(option.category) || [];
        list.push(option);
        sandbox.categoryMap.set(option.category, list);
      });

      (sandbox.schema.categories || []).forEach((categoryName) => {
        const categoryOptions = sandbox.categoryMap.get(categoryName) || [];
        if (!categoryOptions.length) return;

        const section = document.createElement("section");
        section.className = "cfg-sandbox__category";

        const categoryHead = document.createElement("div");
        categoryHead.className = "cfg-sandbox__category-head";
        categoryHead.innerHTML =
          `<div class="cfg-sandbox__category-title">${escapeHTML(
            getLocalizedCategory(categoryName)
          )}</div>` +
          `<div class="cfg-sandbox__category-meta">${escapeHTML(
            t("modal.serverconfig.sandboxCategoryCount", "{count} 項", {
              count: categoryOptions.length,
            })
          )}</div>`;

        const grid = document.createElement("div");
        grid.className = "cfg-sandbox__grid";

        categoryOptions.forEach((option) => {
          const valueSet = sandbox.valueSetMap.get(option.valueSetId);
          const card = document.createElement("label");
          card.className = "cfg-sandbox__option";

          const title = document.createElement("span");
          title.className = "cfg-sandbox__option-title";
          title.textContent = getLocalizedOptionLabel(option);

          const meta = document.createElement("span");
          meta.className = "cfg-sandbox__option-meta";
          meta.textContent = `${option.id} / ${option.codeKey}`;

          const select = document.createElement("select");
          select.dataset.sandboxOptionId = option.id;
          (valueSet?.values || []).forEach((entry) => {
            const opt = document.createElement("option");
            opt.value = String(entry.index);
            const label = formatValueLabel(valueSet, entry);
            const defaultTag =
              entry.index === option.defaultIndex
                ? ` (${t("common.default", "預設")})`
                : "";
            opt.textContent = `${label}${defaultTag}`;
            select.appendChild(opt);
          });
          select.value = String(option.defaultIndex);
          select.addEventListener("change", () => {
            collectSelectionsFromUI();
            setDirty(true);
            setStatus(
              t(
                "messages.sandboxPendingEncode",
                "SandboxCode 表單已修改，請編碼回欄位或直接保存"
              ),
              "warn"
            );
            rerunChecks();
          });

          sandbox.ui.selectMap.set(option.id, select);
          sandbox.ui.selects.push(select);

          card.appendChild(title);
          card.appendChild(meta);
          card.appendChild(select);
          grid.appendChild(card);
        });

        section.appendChild(categoryHead);
        section.appendChild(grid);
        categoriesWrap.appendChild(section);
      });

      applySelectionsToUI(buildDefaultSelections(sandbox.schema), {
        dirty: false,
      });
      setControlsDisabled();
      return panel;
    }

    return {
      ensureStore,
      resetStore,
      attachSchema(schema) {
        const sandbox = ensureStore();
        sandbox.schema = schema || null;
      },
      attachBoundField(input, enableCheckbox) {
        const sandbox = ensureStore();
        sandbox.ui.boundInput = input;
        sandbox.ui.enableCheckbox = enableCheckbox;
      },
      handleCodeInputChanged() {
        setStatus(
          t(
            "messages.sandboxCodeChanged",
            "SandboxCode 欄位已修改，若要還原表單請按「從 SandboxCode 還原」"
          ),
          "warn"
        );
        updateSummary();
      },
      createPanel,
      restoreFromCode,
      syncCodeFieldFromEditor,
      setControlsDisabled,
      getDirty() {
        return !!ensureStore().dirty;
      },
      applySavedValues(values) {
        const sandbox = ensureStore();
        sandbox.dirty = false;
        sandbox.lastLoadedCode = String(values?.SandboxCode || "");
        updateSummary();
      },
    };
  }

  App.sandboxEditor = Object.assign(App.sandboxEditor || {}, {
    createController,
  });
})(window);
