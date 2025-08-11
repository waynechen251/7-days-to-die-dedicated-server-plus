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
  }

  if (w.__fragmentsReady) bindButtons();
  else w.addEventListener("fragments:ready", bindButtons, { once: true });

  function closeCfgModal() {
    D.cfgModal?.classList.add("hidden");
    D.cfgModal?.setAttribute("aria-hidden", "true");
    S.cfg.startIntent = false;
  }

  async function openConfigModal(startIntent) {
    ensureDom();
    if (startIntent && S.versionNeedsInstall) {
      App.console.appendLog(
        "system",
        "❌ 目前選擇的版本尚未安裝，請先安裝。",
        Date.now()
      );
      return;
    }
    S.cfg.startIntent = !!startIntent;
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
      renderCfgEditor(items);

      S.cfg.locked = App.status.computeGameRunning();
      App.status.updateCfgLockUI();

      if (!S.cfg.locked && S.cfg.startIntent)
        D.cfgSaveStartBtn?.classList.add("btn--primary");
      else D.cfgSaveStartBtn?.classList.remove("btn--primary");

      D.cfgModal?.classList.remove("hidden");
      D.cfgModal?.setAttribute("aria-hidden", "false");

      if (!S.cfg.startIntent && !S.cfg.locked) await runCfgChecks();
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
      const { name, value } = item;
      const lab = document.createElement("label");
      lab.className = "cfg-label";
      lab.textContent = name;

      const hint = document.createElement("span");
      hint.textContent = " [?]";
      hint.title = (metaMap.get(name) || "無說明").toString();
      hint.style.cursor = "help";
      hint.style.userSelect = "none";
      hint.setAttribute("aria-label", "說明");
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

      grid.appendChild(lab);
      grid.appendChild(inputEl);
    });

    ensureDom();
    D.cfgBody.innerHTML = "";
    D.cfgBody.appendChild(grid);
    if (S.cfg.locked) App.status.disableCfgInputs(true);
  }

  const rerunChecks = App.utils.debounce(() => runCfgChecks(), 250);

  function readCfgValuesFromUI() {
    ensureDom();
    const q = (n) => D.cfgBody.querySelector(`[data-name="${n}"]`);
    const val = (n) => (q(n) ? String(q(n).value || "").trim() : "");
    return {
      ServerPort: val("ServerPort"),
      TelnetEnabled: val("TelnetEnabled"),
      TelnetPort: val("TelnetPort"),
      TelnetPassword: val("TelnetPassword"),
      EACEnabled: val("EACEnabled"),
    };
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
    if (S.cfg.startIntent || S.cfg.locked) return S.cfg.lastCheck;
    if (!D.cfgChecks) return { passAll: true, results: [] };
    const v = readCfgValuesFromUI();
    const results = [];

    const sp = num(v.ServerPort);
    if (!Number.isFinite(sp) || sp <= 0 || sp > 65535) {
      results.push({ ok: false, text: "ServerPort 未設定或格式錯誤" });
    } else {
      try {
        const r = await fetchJSON(`/api/check-port?port=${sp}`);
        const inUse = !!r?.data?.inUse;
        results.push(
          inUse
            ? { ok: false, text: `ServerPort ${sp} 已被佔用` }
            : { ok: true, text: `ServerPort ${sp} 可用` }
        );
      } catch {
        results.push({ ok: false, text: "ServerPort 檢查失敗" });
      }
    }

    if (!isTrue(v.TelnetEnabled))
      results.push({ ok: false, text: "TelnetEnabled 必須為 true" });
    else results.push({ ok: true, text: "TelnetEnabled 已啟用" });

    const tp = num(v.TelnetPort);
    if (!Number.isFinite(tp) || tp <= 0 || tp > 65535) {
      results.push({ ok: false, text: "TelnetPort 未設定或格式錯誤" });
    } else {
      try {
        const r = await fetchJSON(`/api/check-port?port=${tp}`);
        const inUse = !!r?.data?.inUse;
        results.push(
          inUse
            ? { ok: false, text: `TelnetPort ${tp} 已被佔用` }
            : { ok: true, text: `TelnetPort ${tp} 可用` }
        );
      } catch {
        results.push({ ok: false, text: "TelnetPort 檢查失敗" });
      }
    }

    if (!String(v.TelnetPassword || "").trim())
      results.push({ ok: false, text: "TelnetPassword 不可為空" });
    else results.push({ ok: true, text: "TelnetPassword 已設定" });

    if (isTrue(v.EACEnabled))
      results.push({
        ok: "warn",
        text: "EACEnabled=true: 啟用 EAC 時無法使用模組",
      });
    else results.push({ ok: true, text: "EACEnabled 已停用" });

    const passAll = results.every((x) => x.ok === true || x.ok === "warn");
    const icon = (ok) => (ok === true ? "✅" : ok === "warn" ? "⚠️" : "❌");
    D.cfgChecks.innerHTML =
      `<div style="margin-bottom:8px;font-weight:600">啟動前檢查</div>` +
      `<ul style="margin:0;padding-left:18px">${results
        .map((r) => `<li>${icon(r.ok)} ${r.text}</li>`)
        .join("")}</ul>`;

    App.utils.setDisabled([D.cfgSaveStartBtn], S.cfg.locked || !passAll);

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
    if ((startAfter || S.cfg.startIntent) && S.versionNeedsInstall) {
      App.console.appendLog(
        "system",
        "❌ 目前選擇的版本尚未安裝，請先安裝。",
        Date.now()
      );
      return;
    }
    if (startAfter || S.cfg.startIntent) {
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

    const controls = Array.from(
      D.cfgBody.querySelectorAll("[data-name], .cfg-combo input[type='text']")
    );
    const updates = {};
    let changed = 0;

    controls.forEach((el) => {
      const name = el.dataset.name || el.getAttribute("data-name");
      if (!name) return;
      let val = el.value;
      if (el.dataset.type === "boolean")
        val = /^(true)$/i.test(val) ? "true" : "false";
      val = normalizeValueForWrite(name, val);
      const oldVal = S.cfg.original.get(name) ?? "";
      if (String(val) !== String(oldVal)) {
        updates[name] = val;
        changed++;
      }
    });

    try {
      if (changed > 0) {
        const res = await fetchJSON("/api/serverconfig", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) throw new Error(res.message || "寫入失敗");
      }
      closeCfgModal();

      if (startAfter || S.cfg.startIntent) {
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

  const stGameObserver = new MutationObserver(
    App.status.syncConfigLockFromStatus
  );
  stGameObserver.observe(App.dom.stGame, {
    attributes: true,
    attributeFilter: ["class"],
  });

  App.configModal = { openConfigModal, closeCfgModal };
})(window);
