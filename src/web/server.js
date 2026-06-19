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
const auth = require("./lib/auth");
const firewall = require("./lib/firewall");
const gameServerProfiles = require("./lib/gameServerProfiles");
const { loadConfigWithMigration } = require("./lib/configMigration");

const APP_VERSION = (() => {
  try {
    return require("./package.json").version;
  } catch {
    return "unknown";
  }
})();

if (process.platform === "win32") exec("chcp 65001 >NUL");

const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();

const serverJsonPath = path.join(baseDir, "server.json");
const serverSampleJsonPath = path.join(baseDir, "server.sample.json");
const configLoad = loadConfig();
let CONFIG = configLoad.config;
let CONFIG_META = configLoad.meta;
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
    CONFIG_META = {
      ...(CONFIG_META || {}),
      configSource: "server.json",
      configPath: serverJsonPath,
      configVersion: CONFIG?.configVersion || CONFIG_META?.configVersion || 1,
    };
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

auth.initAuth(baseDir);

function loadConfig() {
  try {
    const result = loadConfigWithMigration({
      baseDir,
      serverJsonPath,
      serverSamplePath: serverSampleJsonPath,
    });
    const config = result.config;
    const meta = result.meta;
    log(
      `✅ 成功讀取設定檔 ${meta.configPath}:\n${JSON.stringify(config, null, 2)}`
    );
    gameServerProfiles.ensureProfilesRoot(config);

    if (meta?.migration?.changed) {
      const fromLabel =
        meta.migration.fromVersion == null
          ? "legacy"
          : `v${meta.migration.fromVersion}`;
      const line = meta.migration.createdServerJson
        ? "ℹ️ 已依最新 schema 建立新的 server.json"
        : `ℹ️ 已自動升級管理後台設定: ${fromLabel} -> v${meta.migration.toVersion}`;
      log(line);
      eventBus.push("system", { text: line });
      if (meta.migration.backupPath) {
        const backupLine = `ℹ️ 已備份舊版 server.json: ${meta.migration.backupPath}`;
        log(backupLine);
        eventBus.push("system", { text: backupLine });
      }
      if (meta.migration.deprecatedRemoved.length > 0) {
        const removedLine =
          `ℹ️ 已移除棄用設定: ${meta.migration.deprecatedRemoved.join(", ")}`;
        log(removedLine);
        eventBus.push("system", { level: "warn", text: removedLine });
      }
      if (meta.migration.unknownRemoved.length > 0) {
        const unknownLine =
          `ℹ️ 已移除未知設定: ${meta.migration.unknownRemoved.join(", ")}`;
        log(unknownLine);
        eventBus.push("system", { level: "warn", text: unknownLine });
      }
    }

    return result;
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
  appVersion: APP_VERSION,
  firewall,
  gameServerProfiles,
};

// Auth 路由（公開，不需驗證）
require("./lib/routes/auth")(app, { ...routeContext, auth });

// 對 /api 套用認證 + 許可中間件（排除 SSE 端點）
app.use("/api", (req, res, next) => {
  // SSE 端點在內部自行處理認證
  if (req.path === "/stream") {
    return next();
  }
  auth.requireAuth(req, res, next);
});

app.use("/api", (req, res, next) => {
  // SSE 端點跳過權限檢查
  if (req.path === "/stream") {
    return next();
  }
  auth.checkPermission(req, res, next);
});

// 應用資訊 API (版本資訊等)
app.get("/api/app-info", (req, res) => {
  http.respondJson(
    res,
    {
      ok: true,
      version: APP_VERSION,
      name: "7DTD-DS-P",
    },
    200
  );
});

// 進程管理路由（移至此處，確保受認證保護）
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

// 伺服器設定路由（移至此處，確保受認證保護）
serverConfigLib.registerRoutes(app, {
  http,
  processManager,
  eventBus,
  baseDir,
  GAME_DIR,
  getConfig: () => CONFIG,
  getConfigMeta: () => CONFIG_META,
  saveConfig,
  gameServerProfiles,
});

// Register route modules
require("./lib/routes/network")(app, routeContext);
require("./lib/routes/config")(app, routeContext);
require("./lib/routes/saves")(app, routeContext);
require("./lib/routes/game")(app, routeContext);
require("./lib/routes/gameServerProfiles")(app, routeContext);
require("./lib/routes/install")(app, routeContext);
require("./lib/routes/versions")(app, routeContext);
require("./lib/routes/updates")(app, routeContext);
require("./lib/routes/firewall")(app, routeContext);

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
