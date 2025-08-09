// DOM
const installServerBtn = document.getElementById("installServerBtn");
const backupBtn = document.getElementById("backupBtn");
const viewConfigBtn = document.getElementById("viewConfigBtn");
const viewSavesBtn = document.getElementById("viewSavesBtn");
const startServerGUIBtn = document.getElementById("startServerGUIBtn");
const startServerNOGUIBtn = document.getElementById("startServerNOGUIBtn");
const stopServerBtn = document.getElementById("stopServerBtn");
const versionSelect = document.getElementById("versionSelect");
const abortInstallBtn = document.getElementById("abortInstallBtn");
const telnetInput = document.getElementById("telnetInput");
const telnetSendBtn = document.getElementById("telnetSendBtn");
const telnetQuickBtns = Array.from(
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
}

function appendLog(topic, line) {
  const p = panes[topic] || panes.system;
  p.textContent += line.endsWith("\n") ? line : line + "\n";
  p.scrollTop = p.scrollHeight;
  if (topic !== activeTab) tabBtns[topic]?.classList.add("unread");
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

let isBackingUp = false;
let lastStatusState = {
  backendUp: false,
  steamRunning: false,
  gameRunning: false,
  telnetOk: false,
};
function applyUIState({ backendUp, steamRunning, gameRunning, telnetOk }) {
  lastStatusState = { backendUp, steamRunning, gameRunning, telnetOk };
  const all = [
    installServerBtn,
    abortInstallBtn,
    backupBtn,
    viewSavesBtn,
    startServerGUIBtn,
    startServerNOGUIBtn,
    stopServerBtn,
    versionSelect,
    telnetInput,
    telnetSendBtn,
    ...telnetQuickBtns,
  ];
  setDisabled(all, false);
  setDisabled(viewConfigBtn, !backendUp);
  setDisabled(viewSavesBtn, !backendUp);

  if (!backendUp) {
    setBadge(stBackend, "err");
    setBadge(stSteam, "err");
    setBadge(stGame, "err");
    setBadge(stTelnet, "err");
    setDisabled(all, true);
    setDisabled(viewConfigBtn, true);
    setDisabled(viewSavesBtn, true);
    return;
  }
  setBadge(stBackend, "ok");

  // SteamCMD 與 Game 互斥: SteamCMD 執行時僅允許「中斷安裝」
  if (steamRunning) {
    setBadge(stSteam, "ok");
    setBadge(stGame, gameRunning ? "warn" : "warn");
    setBadge(stTelnet, "warn");
    setDisabled(all, true);
    setDisabled(abortInstallBtn, false);
    setDisabled(viewConfigBtn, false);
    setDisabled(viewSavesBtn, false);
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
  setDisabled(
    [stopServerBtn, telnetInput, telnetSendBtn, ...telnetQuickBtns],
    !canManage
  );

  // 進行備份時鎖定全部互動直到完成或逾時
  if (isBackingUp) {
    setDisabled(all, true);
    setDisabled(viewConfigBtn, false);
    setDisabled(viewSavesBtn, false);
  } else {
    setDisabled(viewConfigBtn, false);
    setDisabled(viewSavesBtn, false);
  }
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
    setTimeout(refreshStatus, 5000);
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
  if (isBackingUp) return;
  switchTab("backup");
  isBackingUp = true;
  applyUIState(lastStatusState);
  appendLog("backup", stamp(Date.now(), "⏳ 開始建立備份..."));
  const TIMEOUT_MS = 120000;
  const controller = new AbortController();
  const tId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/backup", {
      method: "POST",
      signal: controller.signal,
    });
    const text = await res.text();
    appendLog("backup", text);
  } catch (e) {
    if (e.name === "AbortError") {
      appendLog(
        "backup",
        stamp(Date.now(), "❌ 備份逾時 (已超過 120 秒) - 已解除鎖定")
      );
    } else {
      appendLog("backup", `❌ ${e.message}`);
    }
  } finally {
    clearTimeout(tId);
    isBackingUp = false;
    applyUIState(lastStatusState);
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
telnetQuickBtns.forEach((btn) => {
  const cmd = btn.dataset.command;
  btn.addEventListener("click", () => sendTelnet(cmd));
});
