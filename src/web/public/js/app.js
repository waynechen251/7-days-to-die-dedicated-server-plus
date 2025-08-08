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
const serverStatusElement = document.getElementById("serverStatus");
const telnetBtns = Array.from(
  document.querySelectorAll('button[data-role="telnet"]')
);

const allActionButtons = [
  installServerBtn,
  abortInstallBtn,
  backupBtn,
  viewConfigBtn,
  viewSavesBtn,
  startServerGUIBtn,
  startServerNOGUIBtn,
  stopServerBtn,
  ...telnetBtns,
];
const startButtons = [startServerGUIBtn, startServerNOGUIBtn];
const infoButtons = telnetBtns;

// utils
function setDisabled(nodes, disabled) {
  (Array.isArray(nodes) ? nodes : [nodes]).forEach((el) => {
    if (el) el.disabled = !!disabled;
  });
}

function updateOutput(message, append = true) {
  const output = document.getElementById("output");
  if (append) {
    output.value += message;
    output.scrollTop = output.scrollHeight;
  } else {
    output.value = message;
  }
}

async function fetchText(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return text;
  } finally {
    clearTimeout(id);
  }
}

async function fetchJSON(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// 互斥規則：單一來源統一控管
function applyUIState({ backendUp, steamRunning, gameRunning, telnetOk }) {
  setDisabled(allActionButtons, false);
  versionSelect.disabled = false;

  if (!backendUp) {
    // 後台不可用：全部禁用
    setDisabled(allActionButtons, true);
    versionSelect.disabled = true;
    return;
  }

  if (steamRunning) {
    // SteamCMD 執行中：僅允許中斷安裝
    setDisabled(allActionButtons, true);
    setDisabled(abortInstallBtn, false);
    versionSelect.disabled = true;
    return;
  }

  // SteamCMD 未執行：依遊戲伺服器狀態開放
  const canInstall = !gameRunning;
  setDisabled(installServerBtn, !canInstall);
  versionSelect.disabled = !canInstall;
  setDisabled(abortInstallBtn, true);

  const canStart = !gameRunning;
  setDisabled(startButtons, !canStart);

  const canManage = gameRunning && telnetOk; // 停止與 Telnet 僅在運行且 Telnet 正常時可用
  setDisabled(stopServerBtn, !canManage);
  setDisabled(infoButtons, !canManage);

  // 備份按鈕：僅在遊戲伺服器停止時可用
  setDisabled(backupBtn, gameRunning);
}

function renderServerStatus(data) {
  const payload = data?.data || data;
  const game = payload?.gameServer || {};
  const steam = payload?.steamCmd || {};

  const backendUp = true;
  const steamRunning = !!steam.isRunning;
  const gameRunning = !!game.isRunning;
  const telnetOk = !!game.isTelnetConnected;

  const gameText = gameRunning
    ? `✅ 遊戲伺服器運行中（Telnet ${telnetOk ? "正常" : "異常"}）`
    : "❌ 遊戲伺服器未運行";
  const steamText = steamRunning ? "🟢 SteamCMD 執行中" : "⚪ SteamCMD 未執行";

  serverStatusElement.textContent = `${gameText} ｜ ${steamText}`;
  applyUIState({ backendUp, steamRunning, gameRunning, telnetOk });
}

// 狀態輪詢
async function updateServerStatus() {
  try {
    const status = await fetchJSON("/api/process-status", { method: "GET" });
    renderServerStatus(status);
  } catch (err) {
    serverStatusElement.textContent = "❌ 管理後台無法連線";
    applyUIState({
      backendUp: false,
      steamRunning: false,
      gameRunning: false,
      telnetOk: false,
    });
    console.error("❌ 無法獲取管理後台狀態: ", err);
  } finally {
    setTimeout(updateServerStatus, 5000);
  }
}
updateServerStatus();

// API wrappers
async function fetchApi(url, options = {}) {
  try {
    const text = await fetchText(url, options);
    updateOutput(text);
  } catch (err) {
    updateOutput(`❌ 發生錯誤：${err.message}`);
  }
}

function viewSaves() {
  fetchApi("/api/view-saves", { method: "POST" });
}
function viewConfig() {
  fetchApi("/api/view-config", { method: "POST" });
}
function startServerGUI() {
  fetchApi("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nographics: false }),
  });
}
function startServerNOGUI() {
  fetchApi("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nographics: true }),
  });
}
function stopServer() {
  fetchApi("/api/stop", { method: "POST" });
}
function sendTelnet(cmd) {
  fetchApi("/api/telnet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: cmd }),
  });
}

// Events
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
      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            setTimeout(
              () =>
                applyUIState({
                  backendUp: true,
                  steamRunning: false,
                  gameRunning: false,
                  telnetOk: false,
                }),
              1000
            );
            return;
          }
          updateOutput(decoder.decode(value));
          read();
        });
      }
      read();
    })
    .catch((err) => updateOutput(`❌ 發生錯誤：${err.message}`));
});

abortInstallBtn.addEventListener("click", () => {
  fetch("/api/install-abort", { method: "POST" })
    .then((res) => res.text())
    .then((text) => {
      updateOutput(text);
      applyUIState({
        backendUp: true,
        steamRunning: false,
        gameRunning: false,
        telnetOk: false,
      });
    })
    .catch((err) => updateOutput(`❌ 發生錯誤：${err.message}`));
});

backupBtn.addEventListener("click", async () => {
  backupBtn.disabled = true;
  try {
    const text = await fetchText("/api/backup", { method: "POST" }, 30000);
    updateOutput(text);
  } catch (err) {
    updateOutput(
      err.name === "AbortError"
        ? "❌ 已超時，請稍後再試"
        : `❌ 發生錯誤：${err.message}`
    );
  } finally {
    backupBtn.disabled = false;
  }
});
viewSavesBtn.addEventListener("click", viewSaves);
startServerGUIBtn.addEventListener("click", startServerGUI);
startServerNOGUIBtn.addEventListener("click", startServerNOGUI);
stopServerBtn.addEventListener("click", stopServer);
viewConfigBtn.addEventListener("click", viewConfig);
