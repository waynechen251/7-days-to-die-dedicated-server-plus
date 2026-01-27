const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { format } = require("./lib/time");
const { log, error } = require("./lib/logger");
const http = require("./lib/http");
const processManager = require("./lib/processManager");
const archive = require("./lib/archive");
const eventBus = require("./lib/eventBus");
const { tailFile } = require("./lib/tailer");
const logParser = require("./lib/logParser");
const serverConfigLib = require("./lib/serverConfig");
const steamcmd = require("./lib/steamcmd");
const { sendTelnetCommand, telnetStart } = require("./lib/telnet");

if (process.platform === "win32") exec("chcp 65001 >NUL");

const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();

const serverJsonPath = fs.existsSync(path.join(baseDir, "server.json"))
  ? path.join(baseDir, "server.json")
  : path.join(baseDir, "server.sample.json");

let CONFIG = loadConfig();
const PUBLIC_DIR = path.join(baseDir, "public");
const BACKUP_SAVES_DIR = path.join(PUBLIC_DIR, "saves");
const UPLOADS_DIR = path.join(BACKUP_SAVES_DIR, "_uploads");

function getSavesRoot() {
  const gs = CONFIG?.game_server || {};
  let root = gs.UserDataFolder || gs.saves || "";
  if (!root) return "";
  try {
    const baseName = path.basename(root).toLowerCase();
    if (baseName !== "saves") {
      const candidate = path.join(root, "Saves");
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    }
  } catch (_) {}
  return root;
}

function logPathInfo(reason) {
  try {
    const configured =
      CONFIG?.game_server?.UserDataFolder ||
      CONFIG?.game_server?.saves ||
      "(未設定)";
    const effective = getSavesRoot() || "(未偵測)";
    log(
      `ℹ️ [${reason}] 遊戲存檔目錄(設定值 UserDataFolder/saves): ${configured}`
    );
    if (effective !== configured) {
      log(`ℹ️ [${reason}] 遊戲存檔目錄(實際使用 Saves 根目錄): ${effective}`);
    }
    log(`ℹ️ [${reason}] 備份存放目錄(Backups): ${BACKUP_SAVES_DIR}`);
    eventBus.push("system", {
      text: `[${reason}] Game Saves(Config): ${configured}`,
    });
    if (effective !== configured) {
      eventBus.push("system", {
        text: `[${reason}] Game Saves(Effective): ${effective}`,
      });
    }
    eventBus.push("system", {
      text: `[${reason}] Backups Dir: ${BACKUP_SAVES_DIR}`,
    });
  } catch (_) {}
}
logPathInfo("init");

function resolveDirCaseInsensitive(root, want) {
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const hit = entries.find(
      (e) => e.isDirectory() && e.name.toLowerCase() === want.toLowerCase()
    );
    return path.join(root, hit ? hit.name : want);
  } catch (_) {
    return path.join(root, want);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(serverJsonPath, JSON.stringify(CONFIG, null, 2), "utf-8");
    return true;
  } catch (e) {
    error(`❌ 寫入設定檔失敗: ${e.message}`);
    return false;
  }
}

const GAME_DIR = resolveDirCaseInsensitive(baseDir, "7DaysToDieServer");
let stopGameTail = null;

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

processManager.initStatus({
  getConfig: () => CONFIG.game_server,
  sendTelnetCommand,
});

processManager.registerRoutes(app, {
  eventBus,
  http,
  getStopGameTail: () => stopGameTail,
  clearStopGameTail: () => {
    if (stopGameTail) {
      try {
        stopGameTail();
      } catch (_) {}
    }
    stopGameTail = null;
  },
});

serverConfigLib.registerRoutes(app, {
  http,
  processManager,
  eventBus,
  baseDir,
  GAME_DIR,
  getConfig: () => CONFIG,
  saveConfig,
});

function loadConfig() {
  try {
    const rawData = fs
      .readFileSync(serverJsonPath, "utf-8")
      .replace(/^\uFEFF/, "");
    const config = JSON.parse(rawData);
    log(
      `✅ 成功讀取設定檔 ${serverJsonPath}:\n${JSON.stringify(config, null, 2)}`
    );
    if (!config.web) config.web = {};

    if (
      Object.prototype.hasOwnProperty.call(config.web, "lastInstallVersion")
    ) {
      if (config.web.lastInstallVersion === "") {
        config.web.lastInstallVersion = "public";
        log("ℹ️ 遷移 lastInstallVersion 空字串為 'public'");
        try {
          fs.writeFileSync(
            serverJsonPath,
            JSON.stringify(config, null, 2),
            "utf-8"
          );
        } catch (_) {}
      }
    }

    try {
      if (config.game_server) {
        if (config.game_server.saves && !config.game_server.UserDataFolder) {
          config.game_server.UserDataFolder = config.game_server.saves;
          delete config.game_server.saves;
          log("ℹ️ 遷移 game_server.saves -> game_server.UserDataFolder");
          fs.writeFileSync(
            serverJsonPath,
            JSON.stringify(config, null, 2),
            "utf-8"
          );
        }
      }
    } catch (_) {}
    return config;
  } catch (err) {
    error(`❌ 讀取設定檔失敗: ${serverJsonPath}\n${err.message}`);
    process.exit(1);
  }
}

// Route context shared by all route modules
const routeContext = {
  http,
  eventBus,
  archive,
  processManager,
  serverConfigLib,
  steamcmd,
  logParser,
  tailFile,
  sendTelnetCommand,
  telnetStart,
  getSavesRoot,
  logPathInfo,
  getConfig: () => CONFIG,
  saveConfig,
  baseDir,
  GAME_DIR,
  BACKUP_SAVES_DIR,
  UPLOADS_DIR,
  log,
  error,
  getStopGameTail: () => stopGameTail,
  setStopGameTail: (fn) => {
    stopGameTail = fn;
  },
  closeDummyGamePort: null, // Will be set by network routes
};

// Register route modules
require("./lib/routes/network")(app, routeContext);
require("./lib/routes/config")(app, routeContext);
require("./lib/routes/saves")(app, routeContext);
require("./lib/routes/game")(app, routeContext);
require("./lib/routes/install")(app, routeContext);

// SSE endpoint
app.get("/api/stream", eventBus.sseHandler);

// Start server
app.listen(CONFIG.web.port, () => {
  log(`✅ 控制面板已啟動於 http://127.0.0.1:${CONFIG.web.port}`);
  eventBus.push("system", {
    text: `控制面板啟動於 http://127.0.0.1:${CONFIG.web.port}`,
  });
  logPathInfo("listen");
});
