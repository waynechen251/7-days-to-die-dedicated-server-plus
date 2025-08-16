(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON, fetchText } = App.api;
  const { decideType, escapeHTML } = App.utils;
  let D = App.dom;
  const S = App.state;

  function ensureDom() {
    if (!D.cfgBody || !D.cfgModal) {
      App.dom.refresh();
      D = App.dom;
    }
  }

  function bindButtons() {
    ensureDom();
    D.cfgCloseBtn?.addEventListener("click", closeCfgModal);
    D.cfgCancelBtn?.addEventListener("click", closeCfgModal);
    D.cfgSaveBtn?.addEventListener("click", () => saveConfigValues(false));
    D.cfgSaveStartBtn?.addEventListener("click", () => saveConfigValues(true));

    const loadBtn =
      D.cfgLoadAdminBtn || document.getElementById("cfgLoadAdminBtn");
    if (loadBtn && !loadBtn.__bound_loadAdmin) {
      loadBtn.addEventListener("click", loadAdminGameServerConfig);
      loadBtn.__bound_loadAdmin = true;
    }
  }

  if (w.__fragmentsReady) bindButtons();
  else w.addEventListener("fragments:ready", bindButtons, { once: true });

  function closeCfgModal() {
    D.cfgModal?.classList.add("hidden");
    D.cfgModal?.setAttribute("aria-hidden", "true");
  }

  async function openConfigModal() {
    ensureDom();
    D.cfgModal?.classList.remove("hidden");
    D.cfgModal?.setAttribute("aria-hidden", "false");
    if (D.cfgBody)
      D.cfgBody.innerHTML =
        "<div style='padding:8px;font-size:0.75rem;'>讀取中...</div>";

    try {
      const [procRes, cfgRes, savesRes] = await Promise.all([
        fetchJSON("/api/process-status").catch(() => null),
        fetchJSON("/api/serverconfig"),
        fetchJSON("/api/saves/list"),
      ]);
      ensureDom();
      if (!cfgRes.ok) throw new Error(cfgRes.message || "讀取設定失敗");

      if (procRes?.data?.gameServer) {
        const game = procRes.data.gameServer;
        const steam = procRes.data.steamCmd || {};
        setState({
          backendUp: true,
          steamRunning: !!steam.isRunning,
          gameRunning: !!game.isRunning,
          telnetOk: !!game.isTelnetConnected,
        });
      }

      const items = cfgRes.data?.items || [];
      S.cfg.worldList = (savesRes?.data?.saves || []).map((s) => ({
        world: s.world,
        name: s.name,
      }));
      S.cfg.original = new Map(items.map((x) => [x.name, x.value]));
      S.cfg.commentedOriginal = new Map(
        items.map((x) => [x.name, !!x.commented])
      );
      renderCfgEditor(items);

      S.cfg.locked = App.status.computeGameRunning();
      App.status.updateCfgLockUI();

      const loadBtn =
        D.cfgLoadAdminBtn || document.getElementById("cfgLoadAdminBtn");
      if (loadBtn) loadBtn.disabled = !!S.cfg.locked;
      if (S.cfg.locked) {
        D.cfgSaveBtn && (D.cfgSaveBtn.disabled = true);
        D.cfgSaveStartBtn && (D.cfgSaveStartBtn.disabled = true);
      }

      if (!S.cfg.locked) await runCfgChecks();
    } catch (e) {
      App.console.appendLog(
        "system",
        `❌ 讀取 serverconfig.xml 失敗: ${e.message}`,
        Date.now()
      );
    }
  }

  function renderCfgEditor(items) {
    ensureDom();
    const grid = document.createElement("div");
    grid.className = "cfg-grid";

    const worldValues = [...new Set(S.cfg.worldList.map((x) => x.world))];
    const nameMap = new Map();
    S.cfg.worldList.forEach((x) => {
      const arr = nameMap.get(x.world) || [];
      if (!arr.includes(x.name)) arr.push(x.name);
      nameMap.set(x.world, arr);
    });

    const byName = new Map(items.map((i) => [i.name, i.value]));
    const metaMap = new Map(
      items.map((i) => [i.name, i.comment || i.doc || ""])
    );

    items.forEach((item) => {
      const { name, value, commented } = item;
      const lab = document.createElement("label");
      lab.className = "cfg-label";

      const enable = document.createElement("input");
      enable.type = "checkbox";
      enable.className = "cfg-enable";
      enable.dataset.enableFor = name;
      enable.checked = !commented;
      lab.appendChild(enable);
      lab.appendChild(document.createTextNode(" " + name));

      const hint = document.createElement("span");
      hint.textContent = " [?]";
      hint.title = (item.comment || item.doc || "無說明").toString();
      hint.style.cursor = "help";
      hint.style.userSelect = "none";
      lab.appendChild(hint);

      let inputEl;

      if (name === "GameWorld") {
        const wrap = document.createElement("div");
        wrap.className = "cfg-combo";
        const sel = document.createElement("select");
        sel.innerHTML =
          `<option value="">(選擇現有)</option>` +
          worldValues
            .map(
              (w) =>
                `<option value="${escapeHTML(w)}"${
                  w === value ? " selected" : ""
                }>${escapeHTML(w)}</option>`
            )
            .join("");
        const txt = document.createElement("input");
        txt.type = "text";
        txt.value = value || "";
        txt.dataset.name = name;
        txt.dataset.type = "text";
        sel.addEventListener("change", () => {
          if (sel.value) txt.value = sel.value;
          rerunChecks();
        });
        txt.addEventListener("input", rerunChecks);
        wrap.appendChild(sel);
        wrap.appendChild(txt);
        inputEl = wrap;
      } else if (name === "GameName") {
        const wrap = document.createElement("div");
        wrap.className = "cfg-combo";
        const currentWorld =
          byName.get("GameWorld") ||
          (S.cfg.original && S.cfg.original.get("GameWorld")) ||
          "";
        const candidates = (currentWorld && nameMap.get(currentWorld)) || [
          ...new Set(S.cfg.worldList.map((x) => x.name)),
        ];
        const sel = document.createElement("select");
        sel.innerHTML =
          `<option value="">(選擇現有)</option>` +
          candidates
            .map(
              (n) =>
                `<option value="${escapeHTML(n)}"${
                  n === value ? " selected" : ""
                }>${escapeHTML(n)}</option>`
            )
            .join("");
        const txt = document.createElement("input");
        txt.type = "text";
        txt.value = value || "";
        txt.dataset.name = name;
        txt.dataset.type = "text";
        sel.addEventListener("change", () => {
          if (sel.value) txt.value = sel.value;
          rerunChecks();
        });
        txt.addEventListener("input", rerunChecks);
        wrap.appendChild(sel);
        wrap.appendChild(txt);
        inputEl = wrap;
      } else {
        const type = decideType(value);
        if (type === "boolean") {
          const sel = document.createElement("select");
          sel.dataset.name = name;
          sel.dataset.type = "boolean";
          sel.innerHTML = `
            <option value="true"${
              /^true$/i.test(value) ? " selected" : ""
            }>true</option>
            <option value="false"${
              /^false$/i.test(value) ? " selected" : ""
            }>false</option>
          `;
          sel.addEventListener("change", rerunChecks);
          inputEl = sel;
        } else if (type === "number") {
          const n = document.createElement("input");
          n.type = "number";
          n.step = "1";
          n.value = value;
          n.dataset.name = name;
          n.dataset.type = "number";
          n.addEventListener("input", rerunChecks);
          inputEl = n;
        } else {
          const t = document.createElement("input");
          t.type = "text";
          t.value = value;
          t.dataset.name = name;
          t.dataset.type = "text";
          t.addEventListener("input", rerunChecks);
          inputEl = t;
        }
      }

      if (commented) {
        if (inputEl.classList?.contains("cfg-combo")) {
          inputEl
            .querySelectorAll("input,select")
            .forEach((e) => (e.disabled = true));
        } else inputEl.disabled = true;
      }

      enable.addEventListener("change", () => {
        const enabled = enable.checked;
        if (inputEl.classList?.contains("cfg-combo")) {
          inputEl
            .querySelectorAll("input,select")
            .forEach((e) => (e.disabled = !enabled || S.cfg.locked));
        } else inputEl.disabled = !enabled || S.cfg.locked;
        rerunChecks();
      });

      grid.appendChild(lab);
      grid.appendChild(inputEl);
    });

    D.cfgBody.innerHTML = "";
    D.cfgBody.appendChild(grid);
    if (S.cfg.locked) App.status.disableCfgInputs(true);
  }

  const rerunChecks = App.utils.debounce(() => runCfgChecks(), 250);

  function readCfgValuesFromUI() {
    ensureDom();
    const values = {};
    D.cfgBody.querySelectorAll("[data-name]").forEach((el) => {
      const name = el.dataset.name;
      if (!name) return;
      values[name] = String(el.value || "").trim();
    });
    const enables = {};
    D.cfgBody.querySelectorAll(".cfg-enable").forEach((cb) => {
      const name = cb.dataset.enableFor;
      if (name) enables[name] = cb.checked;
    });
    return { values, enables };
  }

  function isTrue(v) {
    return /^(true)$/i.test(String(v || "").trim());
  }
  function num(v) {
    const n = parseInt(String(v || "").trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  async function runCfgChecks() {
    ensureDom();
    if (S.cfg.locked) return S.cfg.lastCheck;
    if (!D.cfgChecks) return { passAll: true, results: [] };
    const { values, enables } = readCfgValuesFromUI();
    const results = [];

    function needEnabled(name, failMsgIfDisabled, validateFn) {
      if (!enables[name]) {
        results.push({
          ok: failMsgIfDisabled ? false : true,
          text: `${name} 已停用(註解)`,
        });
        return;
      }
      validateFn();
    }

    needEnabled("ServerPort", false, () => {
      const sp = parseInt(values.ServerPort, 10);
      if (!Number.isFinite(sp) || sp <= 0 || sp > 65535) {
        results.push({ ok: false, text: "ServerPort 未設定或格式錯誤" });
      }
    });

    if (!enables.TelnetEnabled)
      results.push({
        ok: false,
        text: "TelnetEnabled 已停用 (啟動需要 Telnet)",
      });
    else if (!/^(true)$/i.test(values.TelnetEnabled))
      results.push({ ok: false, text: "TelnetEnabled 必須為 true" });
    else results.push({ ok: true, text: "TelnetEnabled 已啟用" });

    if (!enables.TelnetPort)
      results.push({ ok: false, text: "TelnetPort 已停用" });
    else {
      const tp = parseInt(values.TelnetPort, 10);
      if (!Number.isFinite(tp) || tp <= 0 || tp > 65535)
        results.push({ ok: false, text: "TelnetPort 未設定或格式錯誤" });
    }

    if (!enables.TelnetPassword)
      results.push({ ok: false, text: "TelnetPassword 已停用" });
    else if (!String(values.TelnetPassword).trim())
      results.push({ ok: false, text: "TelnetPassword 不可為空" });
    else results.push({ ok: true, text: "TelnetPassword 已設定" });

    if (!enables.EACEnabled)
      results.push({ ok: true, text: "EACEnabled 已停用(註解)" });
    else if (/^true$/i.test(values.EACEnabled))
      results.push({
        ok: "warn",
        text: "EACEnabled=true: 啟用 EAC 時無法使用模組",
      });
    else results.push({ ok: true, text: "EACEnabled=false" });

    const asyncChecks = [];
    if (enables.ServerPort) {
      const sp = parseInt(values.ServerPort, 10);
      if (Number.isFinite(sp) && sp > 0 && sp <= 65535) {
        asyncChecks.push(
          fetchJSON(`/api/check-port?port=${sp}`)
            .then((r) => {
              const inUse = !!r?.data?.inUse;
              results.push(
                inUse
                  ? { ok: false, text: `ServerPort ${sp} 已被佔用` }
                  : { ok: true, text: `ServerPort ${sp} 可用` }
              );
            })
            .catch(() =>
              results.push({ ok: false, text: "ServerPort 檢查失敗" })
            )
        );
      }
    }
    if (enables.TelnetPort) {
      const tp = parseInt(values.TelnetPort, 10);
      if (Number.isFinite(tp) && tp > 0 && tp <= 65535) {
        asyncChecks.push(
          fetchJSON(`/api/check-port?port=${tp}`)
            .then((r) => {
              const inUse = !!r?.data?.inUse;
              results.push(
                inUse
                  ? { ok: false, text: `TelnetPort ${tp} 已被佔用` }
                  : { ok: true, text: `TelnetPort ${tp} 可用` }
              );
            })
            .catch(() =>
              results.push({ ok: false, text: "TelnetPort 檢查失敗" })
            )
        );
      }
    }

    await Promise.all(asyncChecks);

    const passAll = results.every((x) => x.ok === true || x.ok === "warn");
    const icon = (ok) => (ok === true ? "✅" : ok === "warn" ? "⚠️" : "❌");
    D.cfgChecks.innerHTML =
      `<div style="margin-bottom:8px;font-weight:600">啟動前檢查</div>` +
      `<ul style="margin:0;padding-left:18px">${results
        .map((r) => `<li>${icon(r.ok)} ${r.text}</li>`)
        .join("")}</ul>`;

    App.utils.setDisabled(
      [D.cfgSaveStartBtn],
      S.cfg.locked || !passAll || S.versionNeedsInstall
    );
    App.utils.setDisabled([D.cfgSaveBtn], S.cfg.locked || !passAll);

    S.cfg.lastCheck = { passAll, results };
    return S.cfg.lastCheck;
  }

  function normalizeValueForWrite(name, newVal) {
    const oldVal = S.cfg.original?.get(name);
    if (oldVal == null) return newVal;
    const vTrim = String(newVal).trim();
    if (/^(true|false)$/i.test(vTrim)) return vTrim.toLowerCase();
    return vTrim;
  }

  async function saveConfigValues(startAfter) {
    ensureDom();
    if (S.cfg.locked) {
      closeCfgModal();
      return;
    }
    if (startAfter && S.versionNeedsInstall) {
      App.console.appendLog(
        "system",
        "❌ 目前選擇的版本尚未安裝，請先安裝。",
        Date.now()
      );
      return;
    }
    if (startAfter) {
      const checkNow = await runCfgChecks();
      if (!checkNow.passAll) {
        App.console.appendLog(
          "system",
          "❌ 無法啟動: 請先修正啟動前未通過項目。",
          Date.now()
        );
        return;
      }
    }

    const { values, enables } = readCfgValuesFromUI();
    const updates = {};
    const toggles = {};
    let changed = 0,
      toggleChanged = 0;

    Object.keys(values).forEach((name) => {
      if (!enables[name]) return;
      const newVal = normalizeValueForWrite(name, values[name]);
      const oldVal = S.cfg.original?.get(name) ?? "";
      if (String(newVal) !== String(oldVal)) {
        updates[name] = newVal;
        changed++;
      }
    });

    if (S.cfg.commentedOriginal) {
      Object.keys(enables).forEach((name) => {
        const oldCommented = S.cfg.commentedOriginal.get(name);
        const newCommented = !enables[name];
        if (oldCommented !== newCommented) {
          toggles[name] = enables[name];
          toggleChanged++;
        }
      });
    }

    try {
      if (changed > 0 || toggleChanged > 0) {
        const res = await fetchJSON("/api/serverconfig", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates, toggles }),
        });
        if (!res.ok) throw new Error(res.message || "寫入失敗");
      }
      closeCfgModal();
      if (startAfter) {
        App.console.switchTab("system");
        const msg = await fetchText("/api/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nographics: false }),
        });
        App.console.appendLog("system", msg, Date.now());
      }
    } catch (e) {
      App.console.appendLog(
        "system",
        `❌ 寫入 serverconfig.xml 失敗: ${e.message}`,
        Date.now()
      );
    }
  }

  App.configModal = App.configModal || {};
  App.configModal.openConfigModal = openConfigModal;
  App.openConfigModal = openConfigModal;

  function safeObserveCfgBody(observer, options) {
    if (!observer || typeof observer.observe !== "function") return;
    const el = D?.cfgBody || document.getElementById("cfgBody");
    if (el && el.nodeType === 1) {
      try {
        observer.observe(el, options);
      } catch (e) {
        console.warn("cfgBody observe 失敗:", e.message);
      }
    } else {
      console.warn("cfgBody 尚未就緒，跳過 observe");
    }
  }

  async function loadAdminGameServerConfig() {
    ensureDom();
    if (!D.cfgBody) return;
    if (S.cfg.locked) {
      App.console.appendLog(
        "system",
        "❌ 伺服器運行中，禁止載入上次保存設定",
        Date.now()
      );
      return;
    }
    try {
      const cfg = await fetchJSON("/api/get-config");
      const gs = cfg?.data?.game_server || {};
      if (!gs || typeof gs !== "object") throw new Error("缺少 game_server");
      applyGameServerValuesToEditor(gs);
      App.console.appendLog(
        "system",
        "✅ 已載入上次保存設定到編輯器 (尚未保存)",
        Date.now()
      );
    } catch (e) {
      App.console.appendLog(
        "system",
        `❌ 載入上次保存設定失敗: ${e.message}`,
        Date.now()
      );
    }
  }

  function applyGameServerValuesToEditor(gs) {
    ensureDom();
    if (!D.cfgBody) return;

    const inputsByName = new Map();
    D.cfgBody.querySelectorAll("[data-name]").forEach((el) => {
      const n = el.dataset.name;
      if (!n) return;
      const list = inputsByName.get(n) || [];
      list.push(el);
      inputsByName.set(n, list);
    });

    const enableMap = new Map();
    D.cfgBody
      .querySelectorAll(".cfg-enable")
      .forEach((cb) => enableMap.set(cb.dataset.enableFor, cb));

    let applied = 0;

    inputsByName.forEach((els, name) => {
      if (!Object.prototype.hasOwnProperty.call(gs, name)) return;
      const val = gs[name];
      els.forEach((el) => {
        if (el.dataset.type === "boolean") {
          el.value = /^(true|1)$/i.test(String(val)) ? "true" : "false";
        } else {
          el.value = String(val);
        }
        const combo = el.closest(".cfg-combo");
        if (combo) {
          combo.querySelectorAll("select[data-name]").forEach((sel) => {
            const hasOpt = Array.from(sel.options).some(
              (o) => o.value === String(val)
            );
            sel.value = hasOpt ? String(val) : "";
          });
          if (!S.cfg.locked) {
            combo
              .querySelectorAll("input,select")
              .forEach((c) => (c.disabled = false));
          }
        } else if (!S.cfg.locked) {
          el.disabled = false;
        }
      });

      const cb = enableMap.get(name);
      if (cb) {
        cb.checked = true;
      }
      applied++;
    });

    if (applied === 0) {
      App.console.appendLog(
        "system",
        "ℹ️ 載入後台設定: 無可套用的屬性 (server.json 中的 game_server 可能尚未保存或屬性名稱不相符)",
        Date.now()
      );
    } else {
      App.console.appendLog(
        "system",
        `✅ 已套用後台設定 (${applied} 項) (尚未保存)`,
        Date.now()
      );
    }

    rerunChecks();
  }
})(window);
