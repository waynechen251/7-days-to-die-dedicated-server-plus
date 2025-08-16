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
    clearInterval(S.__cfgCheckTimer);

    try {
      fetch("/api/close-dummy-port", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  async function openConfigModal() {
    ensureDom();
    D.cfgModal?.classList.remove("hidden");
    D.cfgModal?.setAttribute("aria-hidden", "false");
    if (D.cfgBody)
      D.cfgBody.innerHTML =
        "<div style='padding:8px;font-size:0.75rem;'>讀取中...</div>";

    try {
      const [procRes, cfgRes, savesRes, appCfgRes] = await Promise.all([
        fetchJSON("/api/processManager/status").catch(() => null),
        fetchJSON("/api/serverconfig"),
        fetchJSON("/api/saves/list"),
        fetchJSON("/api/get-config").catch(() => null),
      ]);
      ensureDom();
      if (!cfgRes.ok) throw new Error(cfgRes.message || "讀取設定失敗");

      const saves = savesRes?.data?.saves || [];
      S.cfg.worldList = Array.isArray(saves) ? saves.slice() : [];

      const tmplWorlds = cfgRes?.data?.worlds || [];
      tmplWorlds.forEach((w) => {
        if (!S.cfg.worldList.some((x) => x.world === w)) {
          S.cfg.worldList.push({ world: w, name: "" });
        }
      });

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

      const gsInit =
        appCfgRes?.data?.web && appCfgRes.data.web.game_serverInit === "true";
      if (gsInit && !S.cfg.locked) {
        try {
          const proceed = await (window.DangerConfirm
            ? window.DangerConfirm.showConfirm(
                "偵測到剛完成安裝。是否載入上次保存的 game_server 設定?\n(選擇『載入設定』將覆蓋目前編輯器中的值)",
                {
                  title: "載入上次保存設定",
                  continueText: "載入設定",
                  cancelText: "略過",
                }
              )
            : Promise.resolve(window.confirm("是否載入上次保存設定?")));
          fetch("/api/clear-game-server-init", { method: "POST" }).catch(
            () => {}
          );
          if (proceed) {
            if (typeof loadAdminGameServerConfig === "function") {
              await loadAdminGameServerConfig();
            } else if (loadBtn) {
              loadBtn.click();
            }
          } else {
            App.console.appendLog(
              "system",
              "ℹ️ 已略過載入上次保存設定",
              Date.now()
            );
          }
        } catch (e) {
          App.console.appendLog(
            "system",
            `⚠️ 初始載入提示失敗: ${e.message}`,
            Date.now()
          );
        }
      }

      if (!S.cfg.locked) {
        await runCfgChecks();
        clearInterval(S.__cfgCheckTimer);
        S.__cfgCheckTimer = setInterval(() => {
          runCfgChecks().catch(() => {});
        }, 5000);
      }
    } catch (e) {
      App.console.appendLog(
        "system",
        `❌ 讀取 serverconfig.xml 失敗: ${e.message}`,
        Date.now()
      );
    }
  }

  const ENUM_OPTIONS = {
    Region: {
      default: "NorthAmericaEast",
      options: [
        { value: "NorthAmericaEast", label: "北美東部" },
        { value: "NorthAmericaWest", label: "北美西部" },
        { value: "CentralAmerica", label: "中美洲" },
        { value: "SouthAmerica", label: "南美洲" },
        { value: "Europe", label: "歐洲" },
        { value: "Russia", label: "俄羅斯" },
        { value: "Asia", label: "亞洲" },
        { value: "MiddleEast", label: "中東" },
        { value: "Africa", label: "非洲" },
        { value: "Oceania", label: "大洋洲" },
      ],
    },
    ServerVisibility: {
      default: "2",
      options: [
        { value: "0", label: "0 - 隱藏伺服器" },
        { value: "1", label: "1 - 僅好友可見 (Steam 好友)" },
        { value: "2", label: "2 - 公開伺服器" },
      ],
    },
    ServerDisabledNetworkProtocols: {
      default: "SteamNetworking",
      options: [
        {
          value: "LiteNetLib",
          label: "LiteNetLib(已設定 NAT 或 Port-forward 建議使用)",
        },
        { value: "SteamNetworking", label: "SteamNetworking" },
      ],
    },
    WebDashboardEnabled: {
      default: "false",
      options: [
        { value: "true", label: "啟用 Web 控制台" },
        { value: "false", label: "停用 Web 控制台" },
      ],
    },
    EnableMapRendering: {
      default: "false",
      options: [
        { value: "true", label: "啟用 Web 地圖渲染" },
        { value: "false", label: "停用 Web 地圖渲染" },
      ],
    },
    TelnetEnabled: {
      default: "true",
      options: [
        { value: "true", label: "啟用 Telnet 遠端控制" },
        { value: "false", label: "停用 Telnet 遠端控制" },
      ],
    },
    TerminalWindowEnabled: {
      default: "false",
      options: [
        { value: "true", label: "顯示伺服器終端視窗" },
        { value: "false", label: "不顯示伺服器終端視窗" },
      ],
    },
    ServerAllowCrossplay: {
      default: "true",
      options: [
        { value: "true", label: "允許跨平台連線" },
        { value: "false", label: "不允許跨平台連線" },
      ],
    },
    EACEnabled: {
      default: "true",
      options: [
        { value: "true", label: "啟用 EAC 反作弊" },
        { value: "false", label: "停用 EAC 反作弊" },
      ],
    },
    IgnoreEOSSanctions: {
      default: "false",
      options: [
        { value: "true", label: "忽略 EOS 封禁 (允許被封玩家)" },
        { value: "false", label: "遵循 EOS 封禁 (建議)" },
      ],
    },
    PersistentPlayerProfiles: {
      default: "false",
      options: [
        { value: "true", label: "保留玩家角色設定" },
        { value: "false", label: "不保留玩家角色設定" },
      ],
    },
    GameDifficulty: {
      default: "1",
      options: [
        { value: "0", label: "0 - 採集者 (最簡單)" },
        { value: "1", label: "1 - 冒險者 (預設)" },
        { value: "2", label: "2 - 偵查者" },
        { value: "3", label: "3 - 生存者" },
        { value: "4", label: "4 - 求生專家" },
        { value: "5", label: "5 - 瘋狂 (最困難)" },
      ],
    },
    BuildCreate: {
      default: "false",
      options: [
        { value: "true", label: "啟用創造模式 (作弊)" },
        { value: "false", label: "停用創造模式" },
      ],
    },
    BiomeProgression: {
      default: "true",
      options: [
        { value: "true", label: "啟用生物群落進程" },
        { value: "false", label: "停用生物群落進程" },
      ],
    },
    DeathPenalty: {
      default: "1",
      options: [
        { value: "0", label: "0 - 無懲罰" },
        { value: "1", label: "1 - 經典 (失去經驗)" },
        { value: "2", label: "2 - 傷害懲罰" },
        { value: "3", label: "3 - 永久死亡 (硬核)" },
      ],
    },
    DropOnDeath: {
      default: "1",
      options: [
        { value: "0", label: "0 - 無掉落" },
        { value: "1", label: "1 - 掉落全部物品" },
        { value: "2", label: "2 - 僅掉落工具欄" },
        { value: "3", label: "3 - 僅掉落背包" },
        { value: "4", label: "4 - 物品直接刪除" },
      ],
    },
    DropOnQuit: {
      default: "0",
      options: [
        { value: "0", label: "0 - 無掉落" },
        { value: "1", label: "1 - 掉落全部物品" },
        { value: "2", label: "2 - 僅掉落工具欄" },
        { value: "3", label: "3 - 僅掉落背包" },
      ],
    },
    AllowSpawnNearFriend: {
      default: "2",
      options: [
        { value: "0", label: "0 - 禁止在好友附近重生" },
        { value: "1", label: "1 - 允許 (任何地點)" },
        { value: "2", label: "2 - 僅允許在森林生物群落" },
      ],
    },
    EnemySpawnMode: {
      default: "true",
      options: [
        { value: "true", label: "啟用殭屍生成" },
        { value: "false", label: "停用殭屍生成" },
      ],
    },
    EnemyDifficulty: {
      default: "0",
      options: [
        { value: "0", label: "0 - 普通" },
        { value: "1", label: "1 - 狂暴" },
      ],
    },
    ZombieMove: {
      default: "0",
      options: [
        { value: "0", label: "0 - 白天步行" },
        { value: "1", label: "1 - 白天慢跑" },
        { value: "2", label: "2 - 白天奔跑" },
        { value: "3", label: "3 - 白天衝刺" },
        { value: "4", label: "4 - 白天夢魘" },
      ],
    },
    ZombieMoveNight: {
      default: "3",
      options: [
        { value: "0", label: "0 - 夜晚步行" },
        { value: "1", label: "1 - 夜晚慢跑" },
        { value: "2", label: "2 - 夜晚奔跑" },
        { value: "3", label: "3 - 夜晚衝刺" },
        { value: "4", label: "4 - 夜晚夢魘" },
      ],
    },
    ZombieFeralMove: {
      default: "3",
      options: [
        { value: "0", label: "0 - 發狂步行" },
        { value: "1", label: "1 - 發狂慢跑" },
        { value: "2", label: "2 - 發狂奔跑" },
        { value: "3", label: "3 - 發狂衝刺" },
        { value: "4", label: "4 - 發狂夢魘" },
      ],
    },
    ZombieBMMove: {
      default: "3",
      options: [
        { value: "0", label: "0 - 血月步行" },
        { value: "1", label: "1 - 血月慢跑" },
        { value: "2", label: "2 - 血月奔跑" },
        { value: "3", label: "3 - 血月衝刺" },
        { value: "4", label: "4 - 血月夢魘" },
      ],
    },
    AirDropMarker: {
      default: "true",
      options: [
        { value: "true", label: "顯示空投標記" },
        { value: "false", label: "不顯示空投標記" },
      ],
    },
    PartyKillingMode: {
      default: "3",
      options: [
        { value: "0", label: "0 - 禁止 PvP" },
        { value: "1", label: "1 - 允許隊友互相攻擊" },
        { value: "2", label: "2 - 僅陌生人可互攻" },
        { value: "3", label: "3 - 全部玩家可互攻" },
      ],
    },
    LandClaimDecayMode: {
      default: "0",
      options: [
        { value: "0", label: "0 - 緩慢衰減" },
        { value: "1", label: "1 - 快速衰減" },
        { value: "2", label: "2 - 永久保護 (直到過期)" },
      ],
    },
    DynamicMeshEnabled: {
      default: "true",
      options: [
        { value: "true", label: "啟用動態網格" },
        { value: "false", label: "停用動態網格" },
      ],
    },
    DynamicMeshLandClaimOnly: {
      default: "false",
      options: [
        { value: "true", label: "僅在領地範圍啟用" },
        { value: "false", label: "所有區域啟用" },
      ],
    },
    TwitchBloodMoonAllowed: {
      default: "false",
      options: [
        { value: "true", label: "允許 Twitch 血月事件" },
        { value: "false", label: "不允許 Twitch 血月事件" },
      ],
    },
  };

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
      } else if (ENUM_OPTIONS[name]) {
        const enumDef = ENUM_OPTIONS[name];
        const enumList = Array.isArray(enumDef) ? enumDef : enumDef.options;
        const defVal = Array.isArray(enumDef)
          ? undefined
          : enumDef.default || undefined;
        const currentRaw = String(value ?? "");
        const current =
          currentRaw === "" && defVal !== undefined ? defVal : currentRaw;

        const sel = document.createElement("select");
        sel.dataset.name = name;
        sel.dataset.type = "text";

        const hasCurrent = enumList.some((o) => o.value === current);

        sel.innerHTML =
          `<option value="">(未設定 / 預設${
            defVal ? `=${escapeHTML(defVal)}` : ""
          })</option>` +
          enumList
            .map(
              (o) =>
                `<option value="${escapeHTML(o.value)}"${
                  o.value === current ? " selected" : ""
                }>${escapeHTML(o.label)}</option>`
            )
            .join("") +
          (!hasCurrent && current
            ? `<option value="${escapeHTML(
                current
              )}" selected>(自訂) ${escapeHTML(current)}</option>`
            : "");

        sel.addEventListener("change", rerunChecks);
        inputEl = sel;
      } else {
        const t = document.createElement("input");
        t.type = "text";
        t.value = value;
        t.dataset.name = name;
        t.dataset.type = "text";
        t.addEventListener("input", rerunChecks);
        inputEl = t;
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
          (async () => {
            try {
              try {
                const localRes = await fetchJSON(`/api/check-port?port=${sp}`);
                if (localRes?.ok) {
                  if (localRes.data?.inUse) {
                    results.push({
                      ok: false,
                      text: `ServerPort 本機 ${sp} 已被佔用`,
                    });
                  } else {
                    results.push({
                      ok: true,
                      text: `ServerPort 本機 ${sp} 未被佔用`,
                    });
                  }
                } else {
                  results.push({
                    ok: "warn",
                    text: `ServerPort 本機檢查失敗: ${
                      localRes?.message || "未知錯誤"
                    }`,
                  });
                }
              } catch (e) {
                results.push({
                  ok: "warn",
                  text: `ServerPort 本機檢查例外: ${e.message}`,
                });
              }

              const ipRes = await fetchJSON("/api/public-ip");
              const pubIp = ipRes?.data?.ip;
              if (!pubIp) {
                results.push({
                  ok: "warn",
                  text: "ServerPort 檢查異常: 無法取得公網 IP",
                });
                return;
              }
              const pfRes = await fetchJSON(
                `/api/check-port-forward?ip=${encodeURIComponent(
                  pubIp
                )}&port=${sp}`
              );
              if (pfRes.ok) {
                const svcErr = !!pfRes.data?.error;
                if (pfRes.data?.open === true) {
                  results.push({
                    ok: true,
                    text: `ServerPort 轉發正常：${pubIp}:${sp} 可從公網連線`,
                  });
                } else if (svcErr) {
                  results.push({
                    ok: "warn",
                    text: `ServerPort 轉發檢查服務失敗：${pfRes.data.error}`,
                  });
                } else {
                  results.push({
                    ok: "warn",
                    text: `ServerPort 轉發測試未通：${pubIp}:${sp}（請稍後再試或確認 NAT/防火牆）`,
                  });
                }
              } else {
                results.push({
                  ok: "warn",
                  text: `ServerPort 轉發檢查錯誤: ${
                    pfRes.message || "未知錯誤"
                  }`,
                });
              }
            } catch (e) {
              results.push({
                ok: "warn",
                text: `ServerPort 檢查異常: ${e.message}`,
              });
            }
          })()
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

    (function crossplayCheck() {
      const condsMissing = [];
      const allowEnabled =
        enables.ServerAllowCrossplay &&
        /^(true)$/i.test(values.ServerAllowCrossplay || "");
      if (!allowEnabled) condsMissing.push("ServerAllowCrossplay!=true");
      const maxPlayers = parseInt(values.ServerMaxPlayerCount, 10);
      if (!Number.isFinite(maxPlayers) || maxPlayers > 8)
        condsMissing.push("ServerMaxPlayerCount>8");
      const eacOk =
        enables.EACEnabled && /^(true)$/i.test(values.EACEnabled || "");
      if (!eacOk) condsMissing.push("EACEnabled!=true");
      const eosOk =
        enables.IgnoreEOSSanctions &&
        /^(false)$/i.test(values.IgnoreEOSSanctions || "");
      if (!eosOk) condsMissing.push("IgnoreEOSSanctions!=false");
      if (condsMissing.length === 0) {
        results.push({
          ok: true,
          text: "跨平台連線相容: (MaxPlayer≤8, AllowCrossplay=true, EAC=true, IgnoreEOSSanctions=false)",
        });
      } else {
        results.push({
          ok: "warn",
          text:
            "跨平台連線不相容: " +
            condsMissing.join(", ") +
            " (不會出現在跨平台搜尋)",
        });
      }
    })();

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

  function buildChangeSummary({ updates, toggles, enables }) {
    const lines = [];
    const originalVals = S.cfg.original || new Map();
    const commentedOrig = S.cfg.commentedOriginal || new Map();

    Object.entries(updates).forEach(([name, newVal]) => {
      const oldVal = originalVals.get(name);
      if (String(oldVal) !== String(newVal)) {
        const wasEnabled = !(commentedOrig.get(name) === true);
        const nowEnabled = !!enables[name];
        let tag = "";
        if (wasEnabled !== nowEnabled) {
          tag = nowEnabled ? " (啟用)" : " (停用)";
        }
        lines.push(
          `• ${name}${tag}: "${
            oldVal === undefined ? "(未設定)" : oldVal
          }"  =>  "${newVal}"`
        );
      }
    });

    Object.entries(toggles).forEach(([name, nowEnabled]) => {
      if (updates.hasOwnProperty(name)) return;
      const wasEnabled = !(commentedOrig.get(name) === true);
      if (wasEnabled !== nowEnabled) {
        lines.push(
          `• ${name}: ${wasEnabled ? "啟用" : "停用"}  =>  ${
            nowEnabled ? "啟用" : "停用"
          }`
        );
      }
    });

    if (!lines.length) return "無任何參數變更。";
    return lines.join("\n");
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
      const needPreview = changed > 0 || toggleChanged > 0 || startAfter;
      if (needPreview) {
        const summary = buildChangeSummary({
          updates,
          toggles,
          enables,
        });
        const actionLabel = startAfter ? "保存並啟動" : "保存";
        const proceed = await (window.DangerConfirm
          ? window.DangerConfirm.showConfirm(
              `${summary}\n\n是否確定${actionLabel}?`,
              {
                title: "即將寫入的設定變更",
                continueText: actionLabel,
                cancelText: "取消",
              }
            )
          : Promise.resolve(true));
        if (!proceed) {
          App.console.appendLog(
            "system",
            "ℹ️ 已取消保存 (使用者取消)",
            Date.now()
          );
          return;
        }
      }
    } catch (e) {
      App.console.appendLog(
        "system",
        `⚠️ 生成變更摘要失敗: ${e.message} (將直接保存)`,
        Date.now()
      );
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
      return;
    }
  }

  App.configModal = App.configModal || {};
  App.configModal.openConfigModal = openConfigModal;
  App.openConfigModal = openConfigModal;

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
