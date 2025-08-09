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
function isNearBottom(el, threshold = 40) {
  // 距離底部 <= threshold 視為釘在底部
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}
function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}

// 每個頻道是否釘住底部（使用者沒往上翻）
const pinToBottom = {
  system: true,
  steamcmd: true,
  game: true,
  telnet: true,
  backup: true,
};
// 監聽每個 console 的捲動，使用者往上看就解除釘住
Object.entries(panes).forEach(([topic, el]) => {
  el.addEventListener("scroll", () => {
    pinToBottom[topic] = isNearBottom(el);
  });
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

  // 點擊頻道：先捲到最底並釘住
  scrollToBottom(panes[tab]);
  pinToBottom[tab] = true;

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

  // 追加內容
  p.textContent += line.endsWith("\n") ? line : line + "\n";

  // 僅在該 pane 為可見分頁 且 仍釘在底部時，才跟隨到底部
  if (topic === activeTab && pinToBottom[topic]) {
    scrollToBottom(p);
  }

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
  ];

  // 先算出四個徽章的狀態（只使用規格允許的值）
  // 1) 管理後台：ok / err
  const backendStatus = backendUp ? "ok" : "err";
  // 2) SteamCMD：ok / err
  const steamStatus = steamRunning ? "ok" : "err";
  // 3) 遊戲伺服器：ok(啟動+telnetOK) / warn(啟動+telnetFail) / err(未啟動)
  let gameStatus = "err";
  if (gameRunning && telnetOk) gameStatus = "ok";
  else if (gameRunning && !telnetOk) gameStatus = "warn";
  // 4) Dedicated Server Telnet：ok / err
  const telnetStatus = telnetOk ? "ok" : "err";

  // 套用徽章
  setBadge(stBackend, backendStatus);
  setBadge(stSteam, steamStatus);
  setBadge(stGame, gameStatus);
  setBadge(stTelnet, telnetStatus);
  setDisabled(all, false);

  if (!backendUp) {
    setDisabled(all, true);
    return;
  }

  const lockBecauseBackup = backupInProgress;

  // SteamCMD 執行中
  if (steamRunning) {
    setDisabled(all, true);
    // 允許：中止安裝、查看設定、查看存檔
    setDisabled([abortInstallBtn, viewConfigBtn, viewSavesBtn], false);
    return;
  }

  // 安裝：Game 不在跑、且沒有備份中
  const canInstall = !gameRunning && !lockBecauseBackup;
  setDisabled([installServerBtn, versionSelect], !canInstall);
  setDisabled(abortInstallBtn, true);

  // 啟動：Game 不在跑、且沒有備份中
  const canStart = !gameRunning && !lockBecauseBackup;
  setDisabled([startServerBtn], !canStart);

  // 管理（Telnet 指令/停服）：Game 在跑且 telnet OK，且沒有備份中
  const canManage = gameRunning && telnetOk && !lockBecauseBackup;
  setDisabled(
    [stopServerBtn, telnetInput, telnetSendBtn, ...telnetBtns],
    !canManage
  );

  // 強制結束：只要 Game 在跑就開
  setDisabled(killServerBtn, !gameRunning);

  // 備份：Game 必須關閉、且目前沒有備份中
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

// ========== 狀態輪詢（依規則更新徽章） ==========
async function refreshStatus() {
  try {
    const s = await fetchJSON("/api/process-status", { method: "GET" });
    const game = s.data?.gameServer || {};
    const steam = s.data?.steamCmd || {};
    setState({
      backendUp: true,
      steamRunning: !!steam.isRunning, // SteamCMD：ok(啟動)/err(未啟動)
      gameRunning: !!game.isRunning, // Game：ok/warn/err 由 applyUIState 判斷
      telnetOk: !!game.isTelnetConnected, // Telnet：ok(連得上)/err(連不上)
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
