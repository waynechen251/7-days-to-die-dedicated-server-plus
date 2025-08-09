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

const editConfigBtn = document.getElementById("editConfigBtn");
const cfgModal = document.getElementById("cfgModal");
const cfgBody = document.getElementById("cfgBody");
const cfgChecks = document.getElementById("cfgChecks");
const cfgCloseBtn = document.getElementById("cfgCloseBtn");
const cfgCancelBtn = document.getElementById("cfgCancelBtn");
const cfgSaveBtn = document.getElementById("cfgSaveBtn");
const cfgSaveStartBtn = document.getElementById("cfgSaveStartBtn");
const cfgLockBanner = document.getElementById("cfgLockBanner");

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

  syncConfigLockFromStatus();
}

function refreshConfigLockState() {
  if (cfgModal?.classList.contains("hidden")) return;
  const shouldLock = !!currentState.gameRunning;
  if (shouldLock === cfgLocked) return;
  cfgLocked = shouldLock;
  cfgLockBanner?.classList.toggle("hidden", !cfgLocked);
  setDisabled([cfgSaveBtn, cfgSaveStartBtn], cfgLocked);
  disableCfgInputs(cfgLocked);
}

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

(async function initUI() {
  try {
    const cfg = await fetchJSON("/api/get-config");
    if (
      cfg?.data?.web &&
      Object.prototype.hasOwnProperty.call(cfg.data.web, "lastInstallVersion")
    ) {
      const last = cfg.data.web.lastInstallVersion;
      if (last && last !== "public") {
        const opt = Array.from(versionSelect.options).find(
          (o) => o.value === last
        );
        if (opt) versionSelect.value = last;
      } else {
        versionSelect.value = "";
      }
      setInstalledVersion(last);
    } else {
      setInstalledVersion(null);
    }
  } catch (_) {
    setInstalledVersion(null);
  }
  restoreUnreadBadges();
  loadSaves();
})();

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
            const finishedRaw = versionSelect?.value || "";
            const finished = canonicalVersion(finishedRaw);
            setInstalledVersion(finished);
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

startServerBtn.addEventListener("click", () => openConfigModal(true));
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

const _origSwitchTab = switchTab;
switchTab = function (tab) {
  _origSwitchTab(tab);
  scrollToEnd(panes[activeTab]);
};

const _origAppendLog = appendLog;
appendLog = function (topic, line, ts) {
  _origAppendLog(topic, line, ts);
  if (topic === activeTab) scrollToEnd(panes[topic]);
};

const splitResizer = document.getElementById("splitResizer");
const appSplit = document.querySelector(".app-split");
const paneMainEl = document.querySelector(".pane-main");
const SPLIT_KEY = "ui.split.ratio";
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

splitResizer?.addEventListener("dblclick", () => {
  document.documentElement.style.setProperty("--split-main-size", "50%");
  localStorage.setItem(SPLIT_KEY, "50");
});

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

let cfgOriginal = null;
let cfgLocked = false;
let cfgStartIntent = false;
let cfgWorldList = [];
let lastCheck = { passAll: false, results: [] };

cfgCloseBtn?.addEventListener("click", closeCfgModal);
cfgCancelBtn?.addEventListener("click", closeCfgModal);
cfgSaveBtn?.addEventListener("click", () => saveConfigValues(false));
cfgSaveStartBtn?.addEventListener("click", () => saveConfigValues(true));

function closeCfgModal() {
  cfgModal?.classList.add("hidden");
  cfgModal?.setAttribute("aria-hidden", "true");
  cfgStartIntent = false;
}

async function openConfigModal(startIntent) {
  if (startIntent && versionNeedsInstall) {
    appendLog("system", "❌ 目前選擇的版本尚未安裝，請先安裝。", Date.now());
    return;
  }
  cfgStartIntent = !!startIntent;
  try {
    const [procRes, cfgRes, savesRes] = await Promise.all([
      fetchJSON("/api/process-status").catch(() => null),
      fetchJSON("/api/serverconfig"),
      fetchJSON("/api/saves/list"),
    ]);
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
    cfgWorldList = (savesRes?.data?.saves || []).map((s) => ({
      world: s.world,
      name: s.name,
    }));
    cfgOriginal = new Map(items.map((x) => [x.name, x.value]));
    renderCfgEditor(items);

    cfgLocked = computeGameRunning();
    updateCfgLockUI();

    if (!cfgLocked && cfgStartIntent)
      cfgSaveStartBtn?.classList.add("btn--primary");
    else cfgSaveStartBtn?.classList.remove("btn--primary");

    cfgModal?.classList.remove("hidden");
    cfgModal?.setAttribute("aria-hidden", "false");

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
  if (cfgLocked) disableCfgInputs(true);
}

const rerunChecks = debounce(() => runCfgChecks(), 250);

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

  if (!isTrue(v.TelnetEnabled)) {
    results.push({ ok: false, text: "TelnetEnabled 必須為 true" });
  } else {
    results.push({ ok: true, text: "TelnetEnabled 已啟用" });
  }

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

  if (!String(v.TelnetPassword || "").trim()) {
    results.push({ ok: false, text: "TelnetPassword 不可為空" });
  } else {
    results.push({ ok: true, text: "TelnetPassword 已設定" });
  }

  if (isTrue(v.EACEnabled)) {
    results.push({
      ok: "warn",
      text: "EACEnabled=true: 啟用 EAC 時無法使用模組",
    });
  } else {
    results.push({ ok: true, text: "EACEnabled 已停用" });
  }

  const passAll = results.every((x) => x.ok === true || x.ok === "warn");

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

function normalizeValueForWrite(name, newVal) {
  const oldVal = cfgOriginal?.get(name);
  if (oldVal == null) return newVal;
  const oldTrim = String(oldVal).trim();
  const vTrim = String(newVal).trim();

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

  if ((startAfter || cfgStartIntent) && versionNeedsInstall) {
    appendLog("system", "❌ 目前選擇的版本尚未安裝，請先安裝。", Date.now());
    return;
  }

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

function updateCfgLockUI() {
  cfgLockBanner?.classList.toggle("hidden", !cfgLocked);
  setDisabled([cfgSaveBtn, cfgSaveStartBtn], cfgLocked || !lastCheck.passAll);
  disableCfgInputs(cfgLocked);
}

function computeGameRunning() {
  if (typeof currentState?.gameRunning === "boolean")
    return !!currentState.gameRunning;
  return stGame.classList.contains("ok") || stGame.classList.contains("warn");
}

function syncConfigLockFromStatus() {
  if (cfgModal?.classList.contains("hidden")) return;
  const running = computeGameRunning();
  if (cfgLocked !== running) {
    cfgLocked = running;
    updateCfgLockUI();
  }
}

const stGameObserver = new MutationObserver(syncConfigLockFromStatus);
stGameObserver.observe(stGame, {
  attributes: true,
  attributeFilter: ["class"],
});

let installedVersion = "";
let hasInstalled = false;
let versionNeedsInstall = false;

function canonicalVersion(v) {
  const t = String(v || "").trim();
  return t === "" ? "public" : t.toLowerCase();
}

function setInstalledVersion(v) {
  if (v == null) {
    installedVersion = "";
    hasInstalled = false;
  } else {
    installedVersion = canonicalVersion(v);
    hasInstalled = true;
  }
  updateVersionLockUI();
}

function updateVersionLockUI() {
  if (!versionSelect || !startServerBtn) return;

  const selectedRaw = versionSelect.value || "";
  const selected = canonicalVersion(selectedRaw);

  if (!hasInstalled) {
    versionNeedsInstall = true;
  } else {
    versionNeedsInstall = selected !== installedVersion;
  }

  if (!currentState.steamRunning && !backupInProgress) {
    if (versionNeedsInstall) {
      startServerBtn.disabled = true;
      startServerBtn.title = "此版本尚未安裝，請先按『安裝/更新』";
      installServerBtn?.classList.add("btn--attention");
    } else {
      startServerBtn.title = "";
      installServerBtn?.classList.remove("btn--attention");
    }
  }
}

versionSelect?.addEventListener("change", () => {
  updateVersionLockUI();
});
