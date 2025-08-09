// DOM
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

Object.values(panes).forEach((p) => p && p.setAttribute("tabindex", "-1"));


const tabBtns = {};
let activeTab = "system";

document.querySelectorAll(".console-tabs button").forEach((btn) => {
  const tab = btn.dataset.tab;
  tabBtns[tab] = btn;
  btn.addEventListener("click", () => switchTab(tab));
});

switchTab("system");

function scrollToEnd(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

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
  scrollToEnd(panes[tab]);
}

function appendLog(topic, line) {
  const p = panes[topic] || panes.system;
  p.textContent += line.endsWith("\n") ? line : line + "\n";
  p.scrollTop = p.scrollHeight;
  if (topic === activeTab) {
    scrollToEnd(p);
  } else {
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

// 互斥規則（加嚴）
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

  // Game 狀態與 Telnet
  setBadge(stGame, gameRunning ? "ok" : "warn");
  setBadge(stTelnet, telnetOk ? "ok" : gameRunning ? "warn" : "err");

  // 安裝/版本: 僅在伺服器未運行時允許
  const canInstall = !gameRunning;
  setDisabled([installServerBtn, versionSelect], !canInstall);
  setDisabled(abortInstallBtn, true);

  // 啟動: 僅在伺服器未運行時允許
  const canStart = !gameRunning;
  setDisabled([startServerGUIBtn, startServerNOGUIBtn], !canStart);

  // 停止、Telnet: 僅在運行且 Telnet 正常時允許
  const canManage = gameRunning && telnetOk;
  setDisabled([stopServerBtn, telnetInput, telnetSendBtn], !canManage);

  // 強制關閉：只要偵測到遊戲在跑即可使用
  setDisabled(killServerBtn, !gameRunning);
}

// API helpers
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

// SSE
let es;
function connectSSE() {
  if (es) es.close();
  es = new EventSource(
    `/api/stream?topics=system,steamcmd,game,telnet,backup&replay=200`
  );
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    appendLog(e.topic, stamp(e.ts, e.text));
  };
  es.addEventListener("ping", () => {});
  es.onerror = () => setTimeout(connectSSE, 2000);
}
connectSSE();

// 狀態輪詢
async function refreshStatus() {
  try {
    const s = await fetchJSON("/api/process-status", { method: "GET" });
    const game = s.data?.gameServer || {};
    const steam = s.data?.steamCmd || {};
    applyUIState({
      backendUp: true,
      steamRunning: !!steam.isRunning,
      gameRunning: !!game.isRunning,
      telnetOk: !!game.isTelnetConnected,
    });
  } catch {
    applyUIState({
      backendUp: false,
      steamRunning: false,
      gameRunning: false,
      telnetOk: false,
    });
  } finally {
    setTimeout(refreshStatus, 3000);
  }
}
refreshStatus();

// 操作綁定(並切換對應頻道)
installServerBtn.addEventListener("click", () => {
  switchTab("steamcmd");
  const version = versionSelect?.value || "";
  const body = version ? JSON.stringify({ version }) : undefined;
  const headers = version ? { "Content-Type": "application/json" } : undefined;

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
          appendLog("steamcmd", decoder.decode(value));
          pump();
        });
      pump();
    })
    .catch((err) => appendLog("system", `❌ ${err.message}`));
});

abortInstallBtn.addEventListener("click", async () => {
  switchTab("steamcmd");
  try {
    appendLog(
      "steamcmd",
      await fetchText("/api/install-abort", { method: "POST" })
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`);
  }
});

viewSavesBtn.addEventListener("click", async () => {
  switchTab("backup");
  try {
    appendLog("backup", await fetchText("/api/view-saves", { method: "POST" }));
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`);
  }
});

backupBtn.addEventListener("click", async () => {
  switchTab("backup");
  try {
    appendLog("backup", await fetchText("/api/backup", { method: "POST" }));
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`);
  }
});

viewConfigBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog(
      "system",
      await fetchText("/api/view-config", { method: "POST" })
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`);
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
      })
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`);
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
      })
    );
  } catch (e) {
    appendLog("system", `❌ ${e.message}`);
  }
});

stopServerBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog("system", await fetchText("/api/stop", { method: "POST" }));
  } catch (e) {
    appendLog("system", `❌ ${e.message}`);
  }
});

killServerBtn.addEventListener("click", async () => {
  switchTab("system");
  try {
    appendLog("system", await fetchText("/api/kill", { method: "POST" }));
  } catch (e) {
    appendLog("system", `❌ ${e.message}`);
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
    .then((t) => appendLog("telnet", t))
    .catch((e) => appendLog("telnet", `❌ ${e.message}`));
}
telnetSendBtn.addEventListener("click", () => {
  const cmd = (telnetInput.value || "").trim();
  if (!cmd) return;
  telnetInput.value = "";
  sendTelnet(cmd);
});
window.sendTelnet = sendTelnet;
