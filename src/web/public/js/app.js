// DOM refs
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

const stBackend = document.getElementById("st-backend");
const stSteam = document.getElementById("st-steam");
const stGame = document.getElementById("st-game");
const stTelnet = document.getElementById("st-telnet");

// Console panes
const panes = {
  system: document.getElementById("console-system"),
  steamcmd: document.getElementById("console-steamcmd"),
  game: document.getElementById("console-game"),
  telnet: document.getElementById("console-telnet"),
  backup: document.getElementById("console-backup"),
};
document.querySelectorAll(".console-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".console-tabs button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document
      .querySelectorAll(".console")
      .forEach((p) => p.classList.remove("active"));
    panes[tab].classList.add("active");
  });
});

function appendLog(topic, line) {
  const p = panes[topic] || panes.system;
  p.textContent += line.endsWith("\n") ? line : line + "\n";
  p.scrollTop = p.scrollHeight;
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

function applyUIState({ backendUp, steamRunning, gameRunning, telnetOk }) {
  [
    installServerBtn,
    abortInstallBtn,
    backupBtn,
    viewConfigBtn,
    viewSavesBtn,
    startServerGUIBtn,
    startServerNOGUIBtn,
    stopServerBtn,
    versionSelect,
  ].forEach((b) => (b.disabled = false));

  if (!backendUp) {
    setBadge(stBackend, "err");
    setBadge(stSteam, "err");
    setBadge(stGame, "err");
    setBadge(stTelnet, "err");
    setDisabled(
      [
        installServerBtn,
        abortInstallBtn,
        backupBtn,
        viewConfigBtn,
        viewSavesBtn,
        startServerGUIBtn,
        startServerNOGUIBtn,
        stopServerBtn,
        versionSelect,
      ],
      true
    );
    return;
  } else setBadge(stBackend, "ok");

  setBadge(stSteam, steamRunning ? "ok" : "warn");
  setBadge(stGame, gameRunning ? "ok" : "warn");
  setBadge(stTelnet, telnetOk ? "ok" : gameRunning ? "warn" : "err");

  if (steamRunning) {
    setDisabled([installServerBtn], true);
    setDisabled([abortInstallBtn], false);
    setDisabled([startServerGUIBtn, startServerNOGUIBtn, stopServerBtn], true);
    versionSelect.disabled = true;
    return;
  }

  const canStart = !gameRunning;
  setDisabled([startServerGUIBtn, startServerNOGUIBtn], !canStart);
  versionSelect.disabled = !canStart;
  setDisabled([installServerBtn], !canStart);
  setDisabled([abortInstallBtn], true);

  const canManage = gameRunning && telnetOk;
  setDisabled([stopServerBtn], !canManage);
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

// 初始與輪詢狀態
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

// 操作
installServerBtn.addEventListener("click", () => {
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
  try {
    appendLog("backup", await fetchText("/api/view-saves", { method: "POST" }));
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`);
  }
});

backupBtn.addEventListener("click", async () => {
  try {
    appendLog("backup", await fetchText("/api/backup", { method: "POST" }));
  } catch (e) {
    appendLog("backup", `❌ ${e.message}`);
  }
});

viewConfigBtn.addEventListener("click", async () => {
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
  try {
    appendLog("system", await fetchText("/api/stop", { method: "POST" }));
  } catch (e) {
    appendLog("system", `❌ ${e.message}`);
  }
});

function sendTelnet(cmd) {
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
