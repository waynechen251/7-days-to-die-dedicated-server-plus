// ========== DOM ==========
const installServerBtn = document.getElementById("installServerBtn");
const backupBtn = document.getElementById("backupBtn");
const viewConfigBtn = document.getElementById("viewConfigBtn");
const viewSavesBtn = document.getElementById("viewSavesBtn");
const startServerGUIBtn = document.getElementById("startServerGUIBtn");
const startServerNOGUIBtn = document.getElementById("startServerNOGUIBtn");
const stopServerBtn = document.getElementById("stopServerBtn");
const killServerBtn = document.getElementById("killServerBtn");
const versionSelect = document.getElementById("versionSelect");
const abortInstallBtn = document.getElementById("abortInstallBtn");
const telnetInput = document.getElementById("telnetInput");
const telnetSendBtn = document.getElementById("telnetSendBtn");
const telnetBtns = Array.from(
  document.querySelectorAll('button[data-role="telnet"]')
);

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
  // 標記已讀時間
  lastRead[tab] = Date.now();
  persistLastRead();
  // 既然切到該頻道，也同步把 lastSeen 補上（避免 race condition）
  if (lastSeen[tab] && lastSeen[tab] > lastRead[tab]) {
    lastRead[tab] = lastSeen[tab];
    persistLastRead();
  }
}

function appendLog(topic, line, ts) {
  const p = panes[topic] || panes.system;
  p.textContent += line.endsWith("\n") ? line : line + "\n";
  p.scrollTop = p.scrollHeight;

  // 更新最後看到的訊息時間（無論當前是否在該分頁）
  const t = Number(ts) || Date.now();
  lastSeen[topic] = Math.max(lastSeen[topic] || 0, t);
  persistLastSeen();

  // 未讀判斷：只在不是當前分頁，且訊息時間大於最後已讀時間時標示
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
  // 開頁就依據 lastSeen vs lastRead 恢復徽章，而不是等 SSE replay
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

// ========== 互斥規則 ==========
let backupInProgress = false;

function applyUIState({ backendUp, steamRunning, gameRunning, telnetOk }) {
  const all = [
    installServerBtn,
    abortInstallBtn,
    backupBtn,
    viewConfigBtn,
    viewSavesBtn,
    startServerGUIBtn,
    startServerNOGUIBtn,
    stopServerBtn,
    killServerBtn,
    versionSelect,
    telnetInput,
    telnetSendBtn,
    ...telnetBtns,
  ];

  setDisabled(all, false);

  if (!backendUp) {
    setBadge(stBackend, "err");
    setBadge(stSteam, "err");
    setBadge(stGame, "err");
    setBadge(stTelnet, "err");
    setDisabled(all, true);
    return;
  }
  setBadge(stBackend, "ok");

  if (steamRunning) {
    setBadge(stSteam, "ok");
    setBadge(stGame, gameRunning ? "warn" : "warn");
    setBadge(stTelnet, "warn");
    setDisabled(all, true);
    setDisabled(abortInstallBtn, false);
    return;
  } else {
    setBadge(stSteam, "warn");
  }

  const lockBecauseBackup = backupInProgress;

  setBadge(stGame, gameRunning ? "ok" : "warn");
  setBadge(stTelnet, telnetOk ? "ok" : gameRunning ? "warn" : "err");

  const canInstall = !gameRunning && !lockBecauseBackup;
  setDisabled([installServerBtn, versionSelect], !canInstall);
  setDisabled(abortInstallBtn, true);

  const canStart = !gameRunning && !lockBecauseBackup;
  setDisabled([startServerGUIBtn, startServerNOGUIBtn], !canStart);

  const canManage = gameRunning && telnetOk && !lockBecauseBackup;
  setDisabled(
    [stopServerBtn, telnetInput, telnetSendBtn, ...telnetBtns],
    !canManage
  );

  setDisabled(killServerBtn, !gameRunning);
  setDisabled(backupBtn, gameRunning || lockBecauseBackup);
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
  // 初始就恢復徽章（避免 F5 後未讀消失）
  restoreUnreadBadges();
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
        gameRunning: false,
        telnetOk: false,
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

startServerGUIBtn.addEventListener("click", async () => {
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

startServerNOGUIBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog(
      "system",
      await fetchText("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nographics: true }),
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

// 覆寫 refreshStatus 的 apply，保持 currentState
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
