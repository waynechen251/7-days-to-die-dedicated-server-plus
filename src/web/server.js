const express = require("express");
const { exec, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const { spawn } = require("child_process");
const { format, ts } = require("./public/lib/time");
const { log, error } = require("./public/lib/logger");
const http = require("./public/lib/http");
const { formatBytes } = require("./public/lib/bytes");
const { sendTelnetCommand } = require("./public/lib/telnet");
const processManager = require("./public/lib/processManager");
const zip = require("./public/lib/zip");

const execAsync = promisify(exec);

if (process.platform === "win32") {
  exec("chcp 65001 >NUL");
}

const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();

const serverJsonPath = fs.existsSync(path.join(baseDir, "server.json"))
  ? path.join(baseDir, "server.json")
  : path.join(baseDir, "server.sample.json");

const CONFIG = loadConfig();
const PUBLIC_DIR = path.join(baseDir, "public");
const GAME_DIR = path.join(baseDir, "gameserver");
const GAME_SAVES_BACKUP_DIR = path.join(PUBLIC_DIR, "Saves");

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function loadConfig() {
  try {
    const rawData = fs
      .readFileSync(serverJsonPath, "utf-8")
      .replace(/^\uFEFF/, "");
    const config = JSON.parse(rawData);
    log(
      `✅ 成功讀取設定檔 ${serverJsonPath}:\n${JSON.stringify(config, null, 2)}`
    );
    return config;
  } catch (err) {
    error(`❌ 讀取設定檔失敗: ${serverJsonPath}\n${err.message}`);
    process.exit(1);
  }
}

function getConfig() {
  return CONFIG;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

app.post("/api/view-saves", (req, res) => {
  if (!fs.existsSync(GAME_SAVES_BACKUP_DIR))
    fs.mkdirSync(GAME_SAVES_BACKUP_DIR, { recursive: true });

  fs.readdir(GAME_SAVES_BACKUP_DIR, (err, files) => {
    if (err) return http.sendErr(req, res, `❌ 讀取存檔失敗:\n${err}`);
    const saves = files.filter((file) => file.endsWith(".zip"));
    if (saves.length === 0) return http.sendOk(req, res, "❌ 沒有找到任何存檔");

    const details = saves.map((file) => {
      const filePath = path.join(GAME_SAVES_BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      const sizeStr = formatBytes(stats.size);
      const date = ts(stats.mtime);
      return `${file} (${sizeStr}, ${date})`;
    });

    http.sendOk(req, res, `✅ 找到以下存檔:\n${details.join("\n")}`);
  });
});

app.post("/api/backup", async (req, res) => {
  try {
    const src = CONFIG?.game_server?.saves
    if (!src || !fs.existsSync(src)) {
      error(`❌ 找不到存檔資料夾: ${src || "未設定"}`);
      return http.sendErr(
        req,
        res,
        `❌ 備份失敗: 找不到存檔資料夾(${src || "未設定"})`
      );
    }
    const timestamp = format(new Date(), "YYYYMMDDHHmmss");
    const zipName = `Saves-${timestamp}.zip`;
    const outPath = path.join(GAME_SAVES_BACKUP_DIR, zipName);

    ensureDir(GAME_SAVES_BACKUP_DIR);
    await zip.zipDirectory(src, outPath);

    log(`✅ 成功備份存檔到: ${outPath}`);
    http.sendOk(req, res, `✅ 備份完成: ${zipName}`);
  } catch (err) {
    error(`❌ 備份失敗: ${err?.message || err}`);
    http.sendErr(req, res, `❌ 備份失敗:\n${err?.message || err}`);
  }
});

app.get("/api/process-status", async (req, res) => {
  try {
    await processManager.gameServer.checkTelnet(CONFIG.game_server);
    const status = {
      steamCmd: { isRunning: processManager.steamCmd.isRunning },
      gameServer: {
        isRunning: processManager.gameServer.isRunning,
        isTelnetConnected: processManager.gameServer.isTelnetConnected,
      },
    };
    return http.respondJson(res, { ok: true, data: status }, 200);
  } catch (err) {
    error(`❌ 無法查詢進程狀態: ${err?.message || err}`);
    return http.respondJson(
      res,
      { ok: false, message: "無法查詢進程狀態" },
      500
    );
  }
});

app.post("/api/install", (req, res) => {
  try {
    if (processManager.gameServer.isRunning) {
      return http.sendErr(
        req,
        res,
        "❌ 伺服器運行中，請先停止後再執行安裝/更新"
      );
    }
    const version = req.body?.version ?? "";
    const args = [
      "+login",
      "anonymous",
      "+force_install_dir",
      GAME_DIR,
      "+app_update",
      "294420",
      ...(version ? ["-beta", version] : []),
      "validate",
      "+quit",
    ];

    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    log(`🚀 啟動 steamcmd: ${args.join(" ")}`);
    processManager.steamCmd.start(
      args,
      (data) => http.writeStamped(res, `[stdout] ${data}`),
      (err) => http.writeStamped(res, `[stderr] ${err}`),
      (code) => {
        log(`✅ 安裝 / 更新結束，Exit Code: ${code}`);
        http.writeStamped(res, `✅ 安裝 / 更新結束，Exit Code: ${code}`);
        res.end();
      }
    );
  } catch (err) {
    error(`❌ 無法啟動 steamcmd: ${err.message}`);
    http.writeStamped(res, `❌ 無法啟動 steamcmd: ${err.message}`);
    res.end();
  }
});

app.post("/api/install-abort", (req, res) => {
  try {
    if (processManager.steamCmd.isRunning) {
      processManager.steamCmd.abort();
      log(`🚀 已請求中止安裝`);
      return http.sendOk(req, res, "✅ 已請求中止安裝");
    }
    log(`⚠️ 沒有正在執行的安裝任務`);
    return http.sendOk(req, res, "⚠️ 沒有正在執行的安裝任務");
  } catch (err) {
    error(`❌ 中止安裝失敗: ${err.message}`);
    return http.sendErr(req, res, `❌ 中止安裝失敗: ${err.message}`);
  }
});

app.post("/api/start", async (req, res) => {
  if (processManager.gameServer.isRunning) {
    return http.sendOk(req, res, "❌ 伺服器已經在運行中，請先關閉伺服器再試。");
  }
  try {
    const exeName = fs.existsSync(path.join(GAME_DIR, "7DaysToDieServer.exe"))
      ? "7DaysToDieServer.exe"
      : "7DaysToDie.exe";

    const exePath = path.join(GAME_DIR, exeName);
    if (!fs.existsSync(exePath)) {
      error(`❌ 找不到遊戲伺服器執行檔: ${exePath}`);
      return http.sendErr(
        req,
        res,
        `❌ 找不到執行檔: ${exePath}\n請先執行「安裝 / 更新」，或確認路徑為 {app}\\gameserver\\7DaysToDieServer.exe`
      );
    }

    const logPrefix =
      exeName === "7DaysToDieServer.exe" ? "output_log_dedi" : "output_log";
    const logFileName = `${logPrefix}__${format(
      new Date(),
      "YYYY-MM-DD__HH-mm-ss"
    )}.txt`;
    const logFilePath = path.join(GAME_DIR, "logs", logFileName);

    log(`📝 日誌將寫入: ${logFilePath}`);

    ensureDir(path.dirname(logFilePath));
    fs.writeFileSync(path.join(GAME_DIR, "steam_appid.txt"), "251570");
    process.env.SteamAppId = "251570";
    process.env.SteamGameId = "251570";

    const stripQuotes = (s) =>
      typeof s === "string" ? s.trim().replace(/^"(.*)"$/, "$1") : s;

    const configured = stripQuotes(CONFIG?.game_server?.serverConfig);
    const candidate =
      configured && fs.existsSync(configured)
        ? configured
        : path.join(GAME_DIR, "serverconfig.xml");
    const configPath = candidate.includes(" ") ? `"${candidate}"` : candidate;

    const nographics = req.body?.nographics ?? true;
    const args = [
      "-logfile",
      logFilePath,
      "-quit",
      "-batchmode",
      ...(nographics ? ["-nographics"] : []),
      `-configfile=${configPath}`,
      "-dedicated",
    ];

    log(`🚀 啟動伺服器: ${exePath} ${args.join(" ")}`);
    processManager.gameServer.start(args, GAME_DIR, { exeName });

    return http.sendOk(req, res, `✅ 伺服器已啟動，日誌: ${logFileName}`);
  } catch (err) {
    error(`❌ 伺服器啟動失敗: ${err?.message || err}`);
    return http.sendErr(req, res, `❌ 啟動伺服器失敗:\n${err.message}`);
  }
});

app.post("/api/stop", async (req, res) => {
  try {
    const result = await sendTelnetCommand(CONFIG.game_server, "shutdown");
    log(`✅ 成功發送關閉伺服器指令: ${result}`);
    http.sendOk(req, res, `✅ 關閉伺服器指令已發送:\n${result}`);
  } catch (err) {
    error(`❌ 關閉伺服器失敗: ${err.message}`);
    http.sendErr(req, res, `❌ 關閉伺服器失敗:\n${err.message}`);
  }
});

app.post("/api/telnet", async (req, res) => {
  const command = req.body?.command ?? "";
  if (!command)
    return http.respondText(res, "❌ 請提供 Telnet 指令", 400, true);

  try {
    const result = await sendTelnetCommand(CONFIG.game_server, command);
    log(`✅ Telnet 指令執行成功: ${command}`);
    http.sendOk(req, res, `✅ 結果:\n${result}`);
  } catch (err) {
    error(`❌ Telnet 連線失敗:\n${err.message}`);
    http.sendErr(req, res, `❌ Telnet 連線失敗:\n${err.message}`);
  }
});

app.post("/api/view-config", (req, res) => {
  try {
    const config = getConfig();
    log(`✅ 讀取管理後台設定:`, config);
    http.sendOk(
      req,
      res,
      `✅ 讀取管理後台設定成功:\n${JSON.stringify(config, null, 2)}`
    );
  } catch (err) {
    error(`❌ 讀取管理後台設定失敗:\n${err.message}`);
    http.sendErr(req, res, `❌ 讀取管理後台設定失敗:\n${err.message}`);
  }
});

app.post("/api/server-status", async (req, res) => {
  try {
    await sendTelnetCommand(CONFIG.game_server, "version");
    return http.respondJson(res, { ok: true, status: "online" }, 200);
  } catch (err) {
    return http.respondJson(
      res,
      { ok: false, status: "telnet-fail", message: err.message },
      200
    );
  }
});

app.listen(CONFIG.web.port, () => {
  log(`✅ 控制面板已啟動於 http://localhost:${CONFIG.web.port}`);
});
