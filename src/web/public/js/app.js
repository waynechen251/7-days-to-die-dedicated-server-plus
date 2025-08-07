// Initialization
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

async function onBackupClick() {
  backupBtn.disabled = true;

  const timeoutMs = 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("/api/backup", {
      method: "POST",
      signal: controller.signal,
    });
    const text = await res.text();
    updateOutput(text);
  } catch (err) {
    if (err.name === "AbortError") {
      updateOutput("❌ 已超時，請稍後再試");
    } else {
      updateOutput("❌ 發生錯誤：" + err.message);
    }
  } finally {
    clearTimeout(timer);
    backupBtn.disabled = false;
  }
}

// 定義伺服器狀態更新函式
async function updateServerStatus() {
  try {
    const res = await fetch("/api/process-status");
    if (!res.ok) {
      throw new Error(`HTTP 錯誤: ${res.status} ${res.statusText}`);
    }

    const status = await res.json();
    const gameServerStatus = status.gameServer?.isRunning
      ? `運行中 (Telnet ${
          status.gameServer.isTelnetConnected ? "正常" : "異常"
        })`
      : "未運行";

    const steamCmdStatus = status.steamCmd?.isRunning
      ? "SteamCMD: 運行中"
      : "SteamCMD: 未運行";

    serverStatusElement.textContent = `遊戲伺服器狀態：${gameServerStatus} | ${steamCmdStatus}`;
  } catch (err) {
    serverStatusElement.textContent = "管理後台狀態: ❌ 無法獲取狀態";
    console.error("❌ 無法獲取管理後台狀態: ", err);
  } finally {
    setTimeout(updateServerStatus, 5000);
  }
}
updateServerStatus();

function updateOutput(message, append = true) {
  const output = document.getElementById("output");
  if (append) {
    output.value += message;
    output.scrollTop = output.scrollHeight;
  } else {
    output.value = message;
  }
}

// Apis
async function fetchApi(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
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
    body: JSON.stringify({ nographics: false }),
  });
}

function startServerNOGUI() {
  fetchApi("/api/start", {
    method: "POST",
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

// Listener
installServerBtn.addEventListener("click", () => {
  fetch("/api/install", { method: "POST" })
    .then((res) => res.body.getReader())
    .then((reader) => {
      const decoder = new TextDecoder();
      function read() {
        reader.read().then(({ done, value }) => {
          if (done) return;
          const text = decoder.decode(value);
          updateOutput(text);
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
    .then((text) => updateOutput(text))
    .catch((err) => updateOutput(`❌ 發生錯誤：${err.message}`));
});

backupBtn.addEventListener("click", onBackupClick);
viewSavesBtn.addEventListener("click", viewSaves);
startServerGUIBtn.addEventListener("click", startServerGUI);
startServerNOGUIBtn.addEventListener("click", startServerNOGUI);
stopServerBtn.addEventListener("click", stopServer);
viewConfigBtn.addEventListener("click", viewConfig);
