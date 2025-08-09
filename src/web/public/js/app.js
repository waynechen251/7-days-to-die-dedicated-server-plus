// ========== DOM ==========
const installServerBtn = document.getElementById("installServerBtn");
const viewConfigBtn = document.getElementById("viewConfigBtn");
const startServerBtn = document.getElementById("startServerBtn");
const stopServerBtn = document.getElementById("stopServerBtn");
const killServerBtn = document.getElementById("killServerBtn");
const versionSelect = document.getElementById("versionSelect");
const abortInstallBtn = document.getElementById("abortInstallBtn");
const telnetInput = document.getElementById("telnetInput");
const telnetSendBtn = document.getElementById("telnetSendBtn");
const telnetBtns = Array.from(
  document.querySelectorAll('button[data-role="telnet"]')
);

// 存檔管理 DOM
const gwSelect = document.getElementById("gwSelect");
const gnSelect = document.getElementById("gnSelect");
const exportOneBtn = document.getElementById("exportOneBtn");
const refreshSavesBtn = document.getElementById("refreshSavesBtn");
const viewBackupsBtn = document.getElementById("viewBackupsBtn");
const backupSelect = document.getElementById("backupSelect");
const importBackupBtn = document.getElementById("importBackupBtn");
const importUploadFile = document.getElementById("importUploadFile");
const importUploadBtn = document.getElementById("importUploadBtn");
const stBackend = document.getElementById("st-backend");
const stSteam = document.getElementById("st-steam");
const stGame = document.getElementById("st-game");
const stTelnet = document.getElementById("st-telnet");
const backupFullBtn = document.getElementById("backupFullBtn");

// serverconfig.xml 浮窗 DOM
const editConfigBtn = document.getElementById("editConfigBtn");
const cfgModal = document.getElementById("cfgModal");
const cfgBody = document.getElementById("cfgBody");
const cfgChecks = document.getElementById("cfgChecks");
const cfgCloseBtn = document.getElementById("cfgCloseBtn");
const cfgCancelBtn = document.getElementById("cfgCancelBtn");
const cfgSaveBtn = document.getElementById("cfgSaveBtn");
const cfgSaveStartBtn = document.getElementById("cfgSaveStartBtn");
const cfgLockBanner = document.getElementById("cfgLockBanner");

// Console panes & tabs
const panes = {
  system: document.getElementById("console-system"),
  steamcmd: document.getElementById("console-steamcmd"),
  game: document.getElementById("console-game"),
  telnet: document.getElementById("console-telnet"),
  backup: document.getElementById("console-backup"),
};
const tabBtns = {};
let activeTab = "system";
document.querySelectorAll(".console-tabs button").forEach((btn) => {
  const tab = btn.dataset.tab;
  tabBtns[tab] = btn;
  btn.addEventListener("click", () => switchTab(tab));
});

// ========== 小工具 ==========
function switchTab(tab) {
  if (!panes[tab]) return;
  activeTab = tab;
  document
    .querySelectorAll(".console-tabs button")
    .forEach((b) => b.classList.remove("active"));
  tabBtns[tab].classList.add("active");
  tabBtns[tab].classList.remove("unread");
  document
    .querySelectorAll(".console")
    .forEach((p) => p.classList.remove("active"));
  panes[tab].classList.add("active");
  panes[tab].scrollTop = panes[tab].scrollHeight;

  lastRead[tab] = Date.now();
  persistLastRead();
  if (lastSeen[tab] && lastSeen[tab] > lastRead[tab]) {
    lastRead[tab] = lastSeen[tab];
    persistLastRead();
  }
}

function appendLog(topic, line, ts) {
  const p = panes[topic] || panes.system;
  const nearBottom = p.scrollTop + p.clientHeight >= p.scrollHeight - 5;

  p.textContent += line.endsWith("\n") ? line : line + "\n";

  if (topic === activeTab && nearBottom) {
    p.scrollTop = p.scrollHeight;
  }

  const t = Number(ts) || Date.now();
  lastSeen[topic] = Math.max(lastSeen[topic] || 0, t);
  persistLastSeen();

  if (topic !== activeTab && t > (lastRead[topic] || 0)) {
    tabBtns[topic]?.classList.add("unread");
  }
}

function stamp(ts, text) {
  return `[${new Date(ts).toLocaleString()}] ${text}`;
}

function setBadge(el, status) {
  el.classList.remove("ok", "warn", "err");
  if (status === "ok") el.classList.add("ok");
  else if (status === "warn") el.classList.add("warn");
  else el.classList.add("err");
}

function setDisabled(nodes, disabled) {
  (Array.isArray(nodes) ? nodes : [nodes]).forEach(
    (el) => el && (el.disabled = !!disabled)
  );
}

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ========== 未讀時間紀錄(持久化) ==========
const LS_KEY_READ = "console.lastRead";
const LS_KEY_SEEN = "console.lastSeen";

let lastRead = loadLast(LS_KEY_READ, {
  system: 0,
  steamcmd: 0,
  game: 0,
  telnet: 0,
  backup: 0,
});
let lastSeen = loadLast(LS_KEY_SEEN, {
  system: 0,
  steamcmd: 0,
  game: 0,
  telnet: 0,
  backup: 0,
});

function loadLast(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const obj = JSON.parse(raw);
    return { ...fallback, ...obj };
  } catch (_) {
    return { ...fallback };
  }
}
function persistLastRead() {
  try {
    localStorage.setItem(LS_KEY_READ, JSON.stringify(lastRead));
  } catch (_) {}
}
function persistLastSeen() {
  try {
    localStorage.setItem(LS_KEY_SEEN, JSON.stringify(lastSeen));
  } catch (_) {}
}
function restoreUnreadBadges() {
  Object.keys(panes).forEach((topic) => {
    if (topic === activeTab) {
      tabBtns[topic]?.classList.remove("unread");
      return;
    }
    if ((lastSeen[topic] || 0) > (lastRead[topic] || 0)) {
      tabBtns[topic]?.classList.add("unread");
    } else {
      tabBtns[topic]?.classList.remove("unread");
    }
  });
}

// ========== 互斥規則與狀態展示 ==========
let backupInProgress = false;

function applyUIState({ backendUp, steamRunning, gameRunning, telnetOk }) {
  const all = [
    installServerBtn,
    abortInstallBtn,
    backupFullBtn,
    viewConfigBtn,
    startServerBtn,
    stopServerBtn,
    killServerBtn,
    versionSelect,
    telnetInput,
    telnetSendBtn,
    ...telnetBtns,
    gwSelect,
    gnSelect,
    exportOneBtn,
    refreshSavesBtn,
    viewBackupsBtn,
    backupSelect,
    importBackupBtn,
    importUploadFile,
    importUploadBtn,
    editConfigBtn,
  ];

  const backendStatus = backendUp ? "ok" : "err";
  const steamStatus = steamRunning ? "ok" : "err";
  let gameStatus = "err";
  if (gameRunning && telnetOk) gameStatus = "ok";
  else if (gameRunning && !telnetOk) gameStatus = "warn";
  const telnetStatus = telnetOk ? "ok" : "err";

  setBadge(stBackend, backendStatus);
  setBadge(stSteam, steamStatus);
  setBadge(stGame, gameStatus);
  setBadge(stTelnet, telnetStatus);
  setDisabled(all, false);

  if (!backendUp) {
    setDisabled(all, true);
    return;
  }

  if (steamRunning) {
    setDisabled(all, true);
    setDisabled([abortInstallBtn, viewConfigBtn], false);
    return;
  }

  const lockBecauseBackup = backupInProgress;

  const canInstall = !gameRunning && !lockBecauseBackup;
  setDisabled([installServerBtn, versionSelect], !canInstall);
  setDisabled(abortInstallBtn, true);

  const canStart = !gameRunning && !lockBecauseBackup;
  setDisabled([startServerBtn], !canStart);

  const canManage = gameRunning && telnetOk && !lockBecauseBackup;
  setDisabled(
    [stopServerBtn, telnetInput, telnetSendBtn, ...telnetBtns],
    !canManage
  );

  setDisabled(killServerBtn, !gameRunning);
  setDisabled(backupFullBtn, gameRunning || lockBecauseBackup);
  setDisabled(exportOneBtn, gameRunning || lockBecauseBackup);

  const canManageSaves = !gameRunning && !lockBecauseBackup;
  setDisabled(
    [
      gwSelect,
      gnSelect,
      refreshSavesBtn,
      viewBackupsBtn,
      backupSelect,
      importBackupBtn,
      importUploadFile,
      importUploadBtn,
    ],
    !canManageSaves
  );

  // 動態更新設定浮窗鎖定狀態
  syncConfigLockFromStatus();
}

// 於前面宣告區之後加入(若已存在同名函式請替換)
function refreshConfigLockState() {
  if (cfgModal?.classList.contains("hidden")) return;
  const shouldLock = !!currentState.gameRunning; // 只依據目前前端狀態
  if (shouldLock === cfgLocked) return;
  cfgLocked = shouldLock;
  cfgLockBanner?.classList.toggle("hidden", !cfgLocked);
  setDisabled([cfgSaveBtn, cfgSaveStartBtn], cfgLocked);
  disableCfgInputs(cfgLocked);
}

// ========== API ==========
async function fetchText(url, options = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
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
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// ========== 存檔管理(前端) ==========
let worldMap = new Map();

function fillWorldAndName() {
  const prevWorld = gwSelect.value;
  const prevName = gnSelect.value;

  gwSelect.innerHTML = "";
  const worlds = Array.from(worldMap.keys()).sort();
  worlds.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = w;
    gwSelect.appendChild(opt);
  });
  if (worlds.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(無)";
    gwSelect.appendChild(opt);
  }
  if (worlds.includes(prevWorld)) gwSelect.value = prevWorld;

  fillNamesFor(gwSelect.value || worlds[0] || "");
  if (
    prevName &&
    Array.from(gnSelect.options).some((o) => o.value === prevName)
  ) {
    gnSelect.value = prevName;
  }
}

function fillNamesFor(world) {
  gnSelect.innerHTML = "";
  const names = (worldMap.get(world) || []).slice().sort();
  names.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    gnSelect.appendChild(opt);
  });
  if (names.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(無)";
    gnSelect.appendChild(opt);
  }
}

gwSelect?.addEventListener("change", () => fillNamesFor(gwSelect.value));

async function loadSaves() {
  try {
    const resp = await fetchJSON("/api/saves/list", { method: "GET" });
    const saves = resp?.data?.saves || [];
    const backups = resp?.data?.backups || [];

    worldMap = new Map();
    saves.forEach((s) => {
      const arr = worldMap.get(s.world) || [];
      if (!arr.includes(s.name)) arr.push(s.name);
      worldMap.set(s.world, arr);
    });
    fillWorldAndName();

    backupSelect.innerHTML = "";
    if (backups.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(沒有備份)";
      backupSelect.appendChild(opt);
    } else {
      backups.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = b.file;
        const dt = new Date(b.mtime).toLocaleString();
        opt.textContent = `${b.file} (${dt})`;
        backupSelect.appendChild(opt);
      });
    }
  } catch (e) {
    appendLog("backup", `❌ 讀取存檔清單失敗: ${e.message}`, Date.now());
  }
}

// ========== 初始化 ==========
(async function initUI() {
  try {
    const cfg = await fetchJSON("/api/get-config");
    const last = cfg?.data?.web?.lastInstallVersion || "";
    if (last) {
      const opt = Array.from(versionSelect.options).find(
        (o) => o.value === last
      );
      if (opt) versionSelect.value = last;
    }
  } catch (_) {}
  restoreUnreadBadges();
  loadSaves();
})();

// ========== SSE ==========
let es;
function connectSSE() {
  if (es) es.close();
  es = new EventSource(
    `/api/stream?topics=system,steamcmd,game,telnet,backup&replay=200`
  );
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    appendLog(e.topic, stamp(e.ts, e.text), e.ts);
  };
  es.addEventListener("ping", () => {});
  es.onerror = () => setTimeout(connectSSE, 2000);
}
connectSSE();

// ========== 狀態快取 ==========
let currentState = {
  backendUp: false,
  steamRunning: false,
  gameRunning: false,
  telnetOk: false,
};
function setState(s) {
  currentState = s;
  applyUIState(s);
}

// ========== 狀態輪詢 ==========
async function refreshStatus() {
  try {
    const s = await fetchJSON("/api/process-status", { method: "GET" });
    const game = s.data?.gameServer || {};
    const steam = s.data?.steamCmd || {};
    setState({
      backendUp: true,
      steamRunning: !!steam.isRunning,
      gameRunning: !!game.isRunning,
      telnetOk: !!game.isTelnetConnected,
    });
  } catch {
    setState({
      backendUp: false,
      steamRunning: false,
      gameRunning: false,
      telnetOk: false,
    });
  } finally {
    setTimeout(refreshStatus, 5000);
  }
}
refreshStatus();

// ========== 操作 ==========
installServerBtn.addEventListener("click", () => {
  switchTab("steamcmd");
  const version = versionSelect?.value || "";
  const body = JSON.stringify({ version });
  const headers = { "Content-Type": "application/json" };

  fetch("/api/install", { method: "POST", body, headers })
    .then((res) => {
      if (!res.body) throw new Error("串流初始化失敗");
      applyUIState({
        backendUp: true,
        steamRunning: true,
        gameRunning: currentState.gameRunning,
        telnetOk: currentState.telnetOk,
      });
      return res.body.getReader();
    })
    .then((reader) => {
      const decoder = new TextDecoder();
      const pump = () =>
        reader.read().then(({ done, value }) => {
          if (done) {
            setTimeout(refreshStatus, 500);
            return;
          }
          appendLog("steamcmd", decoder.decode(value), Date.now());
          pump();
        });
      pump();
    })
    .catch((err) => appendLog("system", `❌ ${err.message}`, Date.now()));
});

abortInstallBtn.addEventListener("click", async () => {
  switchTab("steamcmd");
  try {
    appendLog(
      "steamcmd",
      await fetchText("/api/install-abort", { method: "POST" }),
      Date.now()
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`, Date.now());
  }
});

viewConfigBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog(
      "system",
      await fetchText("/api/view-config", { method: "POST" }),
      Date.now()
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`, Date.now());
  }
});

// 啟動伺服器: 先開啟設定浮窗確認
startServerBtn.addEventListener("click", () => openConfigModal(true));
// 只檢視/編輯設定
editConfigBtn?.addEventListener("click", () => openConfigModal(false));

stopServerBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog(
      "system",
      await fetchText("/api/stop", { method: "POST" }),
      Date.now()
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`, Date.now());
  }
});

killServerBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog(
      "system",
      await fetchText("/api/kill", { method: "POST" }),
      Date.now()
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`, Date.now());
  }
});

function sendTelnet(cmd) {
  switchTab("telnet");
  fetch("/api/telnet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: cmd }),
  })
    .then((r) => r.text())
    .then((t) => appendLog("telnet", t, Date.now()))
    .catch((e) => appendLog("telnet", `❌ ${e.message}`, Date.now()));
}
telnetSendBtn.addEventListener("click", () => {
  const cmd = (telnetInput.value || "").trim();
  if (!cmd) return;
  telnetInput.value = "";
  sendTelnet(cmd);
});
window.sendTelnet = sendTelnet;

// 存檔管理: 事件
refreshSavesBtn.addEventListener("click", () => loadSaves());

viewBackupsBtn.addEventListener("click", async () => {
  switchTab("backup");
  try {
    const msg = await fetchText("/api/view-saves", { method: "POST" });
    appendLog("backup", msg, Date.now());
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`, Date.now());
  }
});

exportOneBtn.addEventListener("click", async () => {
  const world = gwSelect.value || "";
  const name = gnSelect.value || "";
  if (!world || !name) {
    appendLog("backup", "❌ 請選擇 GameWorld / GameName", Date.now());
    return;
  }
  switchTab("backup");
  backupInProgress = true;
  applyUIState(currentState);
  try {
    const msg = await fetchText("/api/saves/export-one", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ world, name }),
    });
    appendLog("backup", msg, Date.now());
    loadSaves();
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`, Date.now());
  } finally {
    backupInProgress = false;
    applyUIState(currentState);
  }
});

importBackupBtn.addEventListener("click", async () => {
  const file = backupSelect.value || "";
  if (!file) {
    appendLog("backup", "❌ 請選擇備份檔", Date.now());
    return;
  }
  switchTab("backup");
  try {
    const msg = await fetchText("/api/saves/import-backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file }),
    });
    appendLog("backup", msg, Date.now());
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`, Date.now());
  }
});

importUploadBtn.addEventListener("click", async () => {
  const f = importUploadFile.files?.[0];
  if (!f) {
    appendLog("backup", "❌ 請選擇要上傳的 ZIP 檔", Date.now());
    return;
  }
  switchTab("backup");
  try {
    const msg = await fetchText(
      `/api/saves/import-upload?filename=${encodeURIComponent(f.name)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: f,
      }
    );
    appendLog("backup", msg, Date.now());
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`, Date.now());
  } finally {
    importUploadFile.value = "";
  }
});

backupFullBtn.addEventListener("click", async () => {
  switchTab("backup");
  backupInProgress = true;
  applyUIState(currentState);
  try {
    const msg = await fetchText("/api/backup", { method: "POST" });
    appendLog("backup", msg, Date.now());
    loadSaves();
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`, Date.now());
  } finally {
    backupInProgress = false;
    applyUIState(currentState);
  }
});

function scrollToEnd(el) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

// 調整 switchTab: 不再呼叫 dock
const _origSwitchTab = switchTab;
switchTab = function (tab) {
  _origSwitchTab(tab);
  scrollToEnd(panes[activeTab]);
};

// 調整 appendLog: 取消 dock 判斷，直接對 active pane 捲底
const _origAppendLog = appendLog;
appendLog = function (topic, line, ts) {
  _origAppendLog(topic, line, ts);
  if (topic === activeTab) scrollToEnd(panes[topic]);
};

// ==== 上下分割拖曳(主卡片區 / Console 各半，可調整) ====
const splitResizer = document.getElementById("splitResizer");
const appSplit = document.querySelector(".app-split");
const paneMainEl = document.querySelector(".pane-main");
const SPLIT_KEY = "ui.split.ratio"; // 儲存主區百分比 (0-100)
(function restoreSplit() {
  const saved = localStorage.getItem(SPLIT_KEY);
  if (saved) {
    const pct = Number(saved);
    if (!isNaN(pct) && pct > 5 && pct < 95) {
      document.documentElement.style.setProperty(
        "--split-main-size",
        pct + "%"
      );
    }
  }
})();

let splitDragging = false;

function clampSplit(pct) {
  const min =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--split-main-min"
      )
    ) || 15;
  const max =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--split-main-max"
      )
    ) || 85;
  return Math.min(Math.max(pct, min), max);
}

function startSplitDrag(e) {
  e.preventDefault();
  splitDragging = true;
  appSplit.classList.add("resizing");
  document.body.style.userSelect = "none";
}

function onSplitDrag(e) {
  if (!splitDragging) return;
  const rect = appSplit.getBoundingClientRect();
  const y = e.clientY ?? (e.touches && e.touches[0].clientY);
  if (y == null) return;
  const rel = y - rect.top;
  const pct = clampSplit((rel / rect.height) * 100);
  document.documentElement.style.setProperty("--split-main-size", pct + "%");
  localStorage.setItem(SPLIT_KEY, pct.toFixed(2));
}

function endSplitDrag() {
  if (!splitDragging) return;
  splitDragging = false;
  appSplit.classList.remove("resizing");
  document.body.style.userSelect = "";
}

splitResizer?.addEventListener("mousedown", startSplitDrag);
splitResizer?.addEventListener("touchstart", startSplitDrag, {
  passive: false,
});
window.addEventListener("mousemove", onSplitDrag);
window.addEventListener("touchmove", onSplitDrag, { passive: false });
window.addEventListener("mouseup", endSplitDrag);
window.addEventListener("touchend", endSplitDrag);
window.addEventListener("touchcancel", endSplitDrag);

// 雙擊分隔條: 重置 50/50
splitResizer?.addEventListener("dblclick", () => {
  document.documentElement.style.setProperty("--split-main-size", "50%");
  localStorage.setItem(SPLIT_KEY, "50");
});

// 視窗縮放時確保目前百分比仍在範圍內(避免極端高度造成 UI 崩壞)
window.addEventListener("resize", () => {
  const curVar = getComputedStyle(document.documentElement)
    .getPropertyValue("--split-main-size")
    .trim();
  if (curVar.endsWith("%")) {
    const pct = parseFloat(curVar);
    const clamped = clampSplit(pct);
    if (pct !== clamped) {
      document.documentElement.style.setProperty(
        "--split-main-size",
        clamped + "%"
      );
      localStorage.setItem(SPLIT_KEY, clamped.toFixed(2));
    }
  }
});

/* ===================== serverconfig.xml 浮窗編輯器 ===================== */
let cfgOriginal = null; // Map<name, value>
let cfgLocked = false;
let cfgStartIntent = false;
let cfgWorldList = []; // 由 /api/saves/list 提供
let lastCheck = { passAll: false, results: [] };

cfgCloseBtn?.addEventListener("click", closeCfgModal);
cfgCancelBtn?.addEventListener("click", closeCfgModal);
cfgSaveBtn?.addEventListener("click", () => saveConfigValues(false));
cfgSaveStartBtn?.addEventListener("click", () => saveConfigValues(true));

// 取代原本 block 內的 closeCfgModal: 直接全域定義，避免在 if 區塊內造成作用域問題
function closeCfgModal() {
  cfgModal?.classList.add("hidden");
  cfgModal?.setAttribute("aria-hidden", "true");
  cfgStartIntent = false;
}

// ====== 修改 openConfigModal: 修正 locked 判斷與浮窗鎖定顯示 ======
async function openConfigModal(startIntent) {
  cfgStartIntent = !!startIntent;
  try {
    // 追加即時狀態請求
    const [procRes, cfgRes, savesRes] = await Promise.all([
      fetchJSON("/api/process-status").catch(() => null),
      fetchJSON("/api/serverconfig"),
      fetchJSON("/api/saves/list"),
    ]);
    if (!cfgRes.ok) throw new Error(cfgRes.message || "讀取設定失敗");

    // 立即刷新 currentState(避免 5 秒輪詢延遲)
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
    cfgWorldList = (savesRes?.data?.saves || []).map((s) => ({
      world: s.world,
      name: s.name,
    }));
    cfgOriginal = new Map(items.map((x) => [x.name, x.value]));
    renderCfgEditor(items);

    // 依最新狀態決定鎖定
    cfgLocked = computeGameRunning();
    updateCfgLockUI();

    if (!cfgLocked && cfgStartIntent)
      cfgSaveStartBtn?.classList.add("btn--primary");
    else cfgSaveStartBtn?.classList.remove("btn--primary");

    cfgModal?.classList.remove("hidden");
    cfgModal?.setAttribute("aria-hidden", "false");

    // 初次執行檢查
    await runCfgChecks();
  } catch (e) {
    appendLog(
      "system",
      `❌ 讀取 serverconfig.xml 失敗: ${e.message}`,
      Date.now()
    );
  }
}

function disableCfgInputs(lock) {
  if (!cfgBody) return;
  const ctrls = cfgBody.querySelectorAll(
    "input, select, textarea, .cfg-combo select, .cfg-combo input"
  );
  ctrls.forEach((el) => {
    el.disabled = !!lock;
  });
}

function renderCfgEditor(items) {
  const grid = document.createElement("div");
  grid.className = "cfg-grid";

  const worldValues = [...new Set(cfgWorldList.map((x) => x.world))];
  const nameMap = new Map();
  cfgWorldList.forEach((x) => {
    const arr = nameMap.get(x.world) || [];
    if (!arr.includes(x.name)) arr.push(x.name);
    nameMap.set(x.world, arr);
  });

  const byName = new Map(items.map((i) => [i.name, i.value]));
  const metaMap = new Map(items.map((i) => [i.name, i.comment || i.doc || ""]));

  items.forEach((item) => {
    const { name, value } = item;
    const lab = document.createElement("label");
    lab.className = "cfg-label";
    lab.textContent = name;

    // [?] hint
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
        (cfgOriginal && cfgOriginal.get("GameWorld")) ||
        "";
      const candidates = (currentWorld && nameMap.get(currentWorld)) || [
        ...new Set(cfgWorldList.map((x) => x.name)),
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
            /^(true|1)$/i.test(value) ? " selected" : ""
          }>true</option>
          <option value="false"${
            /^(false|0)$/i.test(value) ? " selected" : ""
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

  cfgBody.innerHTML = "";
  cfgBody.appendChild(grid);
  // 若已知鎖定，在此立即禁用
  if (cfgLocked) disableCfgInputs(true);
}

const rerunChecks = debounce(() => runCfgChecks(), 250);

// 讀取目前 UI 值(含未保存)
function readCfgValuesFromUI() {
  const q = (n) => cfgBody.querySelector(`[data-name="${n}"]`);
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
  return /^(true|1)$/i.test(String(v || "").trim());
}

function num(v) {
  const n = parseInt(String(v || "").trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

async function runCfgChecks() {
  if (!cfgChecks) return { passAll: true, results: [] };
  const v = readCfgValuesFromUI();
  const results = [];

  // ServerPort
  let serverPortOk = false;
  const sp = num(v.ServerPort);
  if (!Number.isFinite(sp) || sp <= 0 || sp > 65535) {
    results.push({ ok: false, text: "ServerPort 未設定或格式錯誤" });
  } else {
    try {
      const r = await fetchJSON(`/api/check-port?port=${sp}`);
      const inUse = !!r?.data?.inUse;
      if (inUse) {
        results.push({
          ok: false,
          text: `ServerPort ${sp} 已被佔用`,
        });
      } else {
        results.push({ ok: true, text: `ServerPort ${sp} 可用` });
        serverPortOk = true;
      }
    } catch {
      results.push({ ok: false, text: "ServerPort 檢查失敗" });
    }
  }

  // TelnetEnabled 必須為 true
  if (!isTrue(v.TelnetEnabled)) {
    results.push({ ok: false, text: "TelnetEnabled 必須為 true" });
  } else {
    results.push({ ok: true, text: "TelnetEnabled 已啟用" });
  }

  // TelnetPort
  let telnetPortOk = false;
  const tp = num(v.TelnetPort);
  if (!Number.isFinite(tp) || tp <= 0 || tp > 65535) {
    results.push({ ok: false, text: "TelnetPort 未設定或格式錯誤" });
  } else {
    try {
      const r = await fetchJSON(`/api/check-port?port=${tp}`);
      const inUse = !!r?.data?.inUse;
      if (inUse) {
        results.push({
          ok: false,
          text: `TelnetPort ${tp} 已被佔用`,
        });
      } else {
        results.push({ ok: true, text: `TelnetPort ${tp} 可用` });
        telnetPortOk = true;
      }
    } catch {
      results.push({ ok: false, text: "TelnetPort 檢查失敗" });
    }
  }

  // TelnetPassword 不可空
  if (!String(v.TelnetPassword || "").trim()) {
    results.push({ ok: false, text: "TelnetPassword 不可為空" });
  } else {
    results.push({ ok: true, text: "TelnetPassword 已設定" });
  }

  // EACEnabled 警告但可通過
  if (isTrue(v.EACEnabled)) {
    results.push({
      ok: "warn",
      text: "EACEnabled=true: 啟用 EAC 時無法使用模組",
    });
  } else {
    results.push({ ok: true, text: "EACEnabled 已停用" });
  }

  const passAll = results.every((x) => x.ok === true || x.ok === "warn");

  // render
  const icon = (ok) => (ok === true ? "✅" : ok === "warn" ? "⚠️" : "❌");
  cfgChecks.innerHTML =
    `<div style="margin-bottom:8px;font-weight:600">啟動前檢查</div>` +
    `<ul style="margin:0;padding-left:18px">${results
      .map((r) => `<li>${icon(r.ok)} ${r.text}</li>`)
      .join("")}</ul>`;

  setDisabled([cfgSaveStartBtn], cfgLocked || !passAll);

  lastCheck = { passAll, results };
  return lastCheck;
}

// 改善型別/格式保留: 維持原值是 0/1 就不轉成 true/false
function normalizeValueForWrite(name, newVal) {
  const oldVal = cfgOriginal?.get(name);
  if (oldVal == null) return newVal;
  const oldTrim = String(oldVal).trim();
  const vTrim = String(newVal).trim();

  // 布林格式保持
  const oldIsDigitBool = /^(0|1)$/.test(oldTrim);
  const oldIsWordBool = /^(true|false)$/i.test(oldTrim);
  const newIsBoolWord = /^(true|false)$/i.test(vTrim);
  const newIsBoolDigit = /^(0|1)$/.test(vTrim);

  if (oldIsDigitBool && newIsBoolWord) {
    return vTrim.toLowerCase() === "true" ? "1" : "0";
  }
  if (oldIsWordBool && newIsBoolDigit) {
    return vTrim === "1" ? "true" : "false";
  }
  return vTrim;
}

async function saveConfigValues(startAfter) {
  if (cfgLocked) {
    closeCfgModal();
    return;
  }

  // 若要啟動，先確保檢查通過(用目前 UI 值)
  if (startAfter || cfgStartIntent) {
    const checkNow = await runCfgChecks();
    if (!checkNow.passAll) {
      appendLog(
        "system",
        "❌ 無法啟動: 請先修正啟動前檢查未通過項目。",
        Date.now()
      );
      return;
    }
  }

  const controls = Array.from(
    cfgBody.querySelectorAll("[data-name], .cfg-combo input[type='text']")
  );
  const updates = {};
  let changed = 0;

  controls.forEach((el) => {
    const name = el.dataset.name || el.getAttribute("data-name");
    if (!name) return;
    let val = el.value;
    if (el.dataset.type === "boolean") {
      // 內部標準化 (只做邏輯判斷), 送出時再依舊格式還原
      val = /^(true|1)$/i.test(val) ? "true" : "false";
    }
    val = normalizeValueForWrite(name, val);
    const oldVal = cfgOriginal.get(name) ?? "";
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

    if (startAfter || cfgStartIntent) {
      switchTab("system");
      const msg = await fetchText("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nographics: false }),
      });
      appendLog("system", msg, Date.now());
    }
  } catch (e) {
    appendLog(
      "system",
      `❌ 寫入 serverconfig.xml 失敗: ${e.message}`,
      Date.now()
    );
  }
}

function decideType(raw) {
  const v = String(raw).trim();
  if (/^(true|false|0|1)$/i.test(v)) return "boolean";
  // 判斷純數字 (允許負號 / 小數)，避免像 "0123" 或 "1e5" 被不預期轉型可再調整
  if (/^-?\d+(\.\d+)?$/.test(v)) return "number";
  return "text";
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// === 取代舊 refreshConfigLockState，改成統一同步機制 ===
function updateCfgLockUI() {
  cfgLockBanner?.classList.toggle("hidden", !cfgLocked);
  setDisabled([cfgSaveBtn, cfgSaveStartBtn], cfgLocked || !lastCheck.passAll);
  disableCfgInputs(cfgLocked);
}

// 從前端 state 與頂列 badge 推導是否運行
function computeGameRunning() {
  // 以 currentState 為主；若尚未初始化再讀 badge
  if (typeof currentState?.gameRunning === "boolean")
    return !!currentState.gameRunning;
  return stGame.classList.contains("ok") || stGame.classList.contains("warn");
}

// 若浮窗開啟時狀態變化，自動同步鎖定
function syncConfigLockFromStatus() {
  if (cfgModal?.classList.contains("hidden")) return;
  const running = computeGameRunning();
  if (cfgLocked !== running) {
    cfgLocked = running;
    updateCfgLockUI();
  }
}

// 監聽頂列 badge class 變化(備援: poll 更新或 applyUIState 之外的變化)
const stGameObserver = new MutationObserver(syncConfigLockFromStatus);
stGameObserver.observe(stGame, {
  attributes: true,
  attributeFilter: ["class"],
});