// ========== DOM ==========
const installServerBtn = document.getElementById("installServerBtn");
const backupBtn = document.getElementById("backupBtn");
const viewConfigBtn = document.getElementById("viewConfigBtn");
const viewSavesBtn = document.getElementById("viewSavesBtn");
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
const backupSelect = document.getElementById("backupSelect");
const importBackupBtn = document.getElementById("importBackupBtn");
const importUploadFile = document.getElementById("importUploadFile");
const importUploadBtn = document.getElementById("importUploadBtn");

const stBackend = document.getElementById("st-backend");
const stSteam = document.getElementById("st-steam");
const stGame = document.getElementById("st-game");
const stTelnet = document.getElementById("st-telnet");

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
  // 進入分頁時直接看最後一行
  panes[tab].scrollTop = panes[tab].scrollHeight;

  // 標記已讀
  lastRead[tab] = Date.now();
  persistLastRead();
  if (lastSeen[tab] && lastSeen[tab] > lastRead[tab]) {
    lastRead[tab] = lastSeen[tab];
    persistLastRead();
  }
}

function appendLog(topic, line, ts) {
  const p = panes[topic] || panes.system;

  // 使用者是否正在底部（只要在底部才自動捲動）
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

// ========== 未讀時間紀錄（持久化） ==========
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
    backupBtn,
    viewConfigBtn,
    viewSavesBtn,
    startServerBtn,
    stopServerBtn,
    killServerBtn,
    versionSelect,
    telnetInput,
    telnetSendBtn,
    ...telnetBtns,
    // 存檔管理
    gwSelect,
    gnSelect,
    exportOneBtn,
    refreshSavesBtn,
    backupSelect,
    importBackupBtn,
    importUploadFile,
    importUploadBtn,
  ];

  // 徽章
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
    setDisabled([abortInstallBtn, viewConfigBtn, viewSavesBtn], false);
    return;
  }

  const lockBecauseBackup = backupInProgress;

  // 安裝
  const canInstall = !gameRunning && !lockBecauseBackup;
  setDisabled([installServerBtn, versionSelect], !canInstall);
  setDisabled(abortInstallBtn, true);

  // 伺服器啟停
  const canStart = !gameRunning && !lockBecauseBackup;
  setDisabled([startServerBtn], !canStart);

  const canManage = gameRunning && telnetOk && !lockBecauseBackup;
  setDisabled(
    [stopServerBtn, telnetInput, telnetSendBtn, ...telnetBtns],
    !canManage
  );

  setDisabled(killServerBtn, !gameRunning);

  // 備份：伺服器需關閉
  setDisabled(backupBtn, gameRunning || lockBecauseBackup);

  // 存檔管理：統一要求伺服器關閉
  const canManageSaves = !gameRunning && !lockBecauseBackup;
  setDisabled(
    [
      gwSelect,
      gnSelect,
      exportOneBtn,
      refreshSavesBtn,
      backupSelect,
      importBackupBtn,
      importUploadFile,
      importUploadBtn,
    ],
    !canManageSaves
  );
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

// ========== 存檔管理（前端） ==========
let worldMap = new Map(); // world -> [name]

function fillWorldAndName() {
  // 保存當前選擇
  const prevWorld = gwSelect.value;
  const prevName = gnSelect.value;

  // world
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

  // 盡量還原選擇
  if (worlds.includes(prevWorld)) gwSelect.value = prevWorld;

  // name
  fillNamesFor(gwSelect.value || worlds[0] || "");

  // 還原 name
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

    // world map
    worldMap = new Map();
    saves.forEach((s) => {
      const arr = worldMap.get(s.world) || [];
      if (!arr.includes(s.name)) arr.push(s.name);
      worldMap.set(s.world, arr);
    });
    fillWorldAndName();

    // backups
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
    appendLog("backup", `❌ 讀取存檔清單失敗：${e.message}`, Date.now());
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

viewSavesBtn.addEventListener("click", async () => {
  switchTab("backup");
  try {
    appendLog(
      "backup",
      await fetchText("/api/view-saves", { method: "POST" }),
      Date.now()
    );
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`, Date.now());
  }
});

backupBtn.addEventListener("click", async () => {
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

startServerBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog(
      "system",
      await fetchText("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nographics: false }),
      }),
      Date.now()
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`, Date.now());
  }
});

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

// 存檔管理：事件
refreshSavesBtn.addEventListener("click", () => loadSaves());

exportOneBtn.addEventListener("click", async () => {
  const world = gwSelect.value || "";
  const name = gnSelect.value || "";
  if (!world || !name) {
    appendLog("backup", "❌ 請選擇 GameWorld / GameName", Date.now());
    return;
  }
  switchTab("backup");
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
