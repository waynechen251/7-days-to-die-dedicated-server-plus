const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const { format, ts } = require("./public/lib/time");
const { log, error } = require("./public/lib/logger");
const http = require("./public/lib/http");
const { formatBytes } = require("./public/lib/bytes");
const { sendTelnetCommand } = require("./public/lib/telnet");
const processManager = require("./public/lib/processManager");
const zip = require("./public/lib/zip");
const eventBus = require("./public/lib/eventBus");
const { tailFile } = require("./public/lib/tailer");

const execAsync = promisify(exec);

if (process.platform === "win32") exec("chcp 65001 >NUL");

const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();

const serverJsonPath = fs.existsSync(path.join(baseDir, "server.json"))
  ? path.join(baseDir, "server.json")
  : path.join(baseDir, "server.sample.json");

let CONFIG = loadConfig();
const PUBLIC_DIR = path.join(baseDir, "public");
const BACKUP_SAVES_DIR = path.join(PUBLIC_DIR, "saves");

/** 在 baseDir 內以不分大小寫尋找子目錄名 */
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

/** 在 dir 內以不分大小寫尋找檔案 */
function resolveFileCaseInsensitive(dir, file) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hit = entries.find(
      (e) => e.isFile() && e.name.toLowerCase() === file.toLowerCase()
    );
    return hit ? path.join(dir, hit.name) : path.join(dir, file);
  } catch (_) {
    return path.join(dir, file);
  }
}

/** 儲存 server.json(維持現有格式) */
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
    return config;
  } catch (err) {
    error(`❌ 讀取設定檔失敗: ${serverJsonPath}\n${err.message}`);
    process.exit(1);
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/* SSE */
app.get("/api/stream", eventBus.sseHandler);

/* 讀取設定(JSON 格式，給前端初始化 UI 用) */
app.get("/api/get-config", (req, res) => {
  return http.respondJson(res, { ok: true, data: CONFIG }, 200);
});

/* 狀態 */
app.get("/api/process-status", async (req, res) => {
  try {
    await processManager.gameServer.checkTelnet(CONFIG.game_server);
    const status = {
      steamCmd: { isRunning: processManager.steamCmd.isRunning },
      gameServer: {
        isRunning: processManager.gameServer.isRunning,
        isTelnetConnected: processManager.gameServer.isTelnetConnected,
        pid: processManager.gameServer.getPid(),
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

/* 存檔清單 */
app.post("/api/view-saves", (req, res) => {
  ensureDir(BACKUP_SAVES_DIR);
  fs.readdir(BACKUP_SAVES_DIR, (err, files) => {
    if (err) return http.sendErr(req, res, `❌ 讀取存檔失敗:\n${err}`);
    const saves = files.filter((file) => file.endsWith(".zip"));
    if (saves.length === 0) return http.sendOk(req, res, "❌ 沒有找到任何存檔");

    const details = saves.map((file) => {
      const filePath = path.join(BACKUP_SAVES_DIR, file);
      const stats = fs.statSync(filePath);
      return `${file} (${formatBytes(stats.size)}, ${ts(stats.mtime)})`;
    });

    http.sendOk(req, res, `✅ 找到以下存檔:\n${details.join("\n")}`);
  });
});

/* 備份 */
app.post("/api/backup", async (req, res) => {
  try {
    const src = CONFIG?.game_server?.saves;
    if (!src || !fs.existsSync(src)) {
      const msg = `❌ 備份失敗: 找不到存檔資料夾(${src || "未設定"})`;
      error(msg);
      return http.sendErr(req, res, msg);
    }
    const timestamp = format(new Date(), "YYYYMMDDHHmmss");
    const zipName = `Saves-${timestamp}.zip`;
    const outPath = path.join(BACKUP_SAVES_DIR, zipName);

    ensureDir(BACKUP_SAVES_DIR);
    await zip.zipDirectory(src, outPath);

    const line = `✅ 備份完成: ${zipName}`;
    log(line);
    eventBus.push("backup", { text: line });
    http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 備份失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    http.sendErr(req, res, `${msg}`);
  }
});

/* 安裝/更新 */
app.post("/api/install", (req, res) => {
  try {
    const version = req.body?.version ?? "";
    CONFIG.web.lastInstallVersion = version;
    saveConfig();

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
    eventBus.push("steamcmd", {
      text: `start install/update (${version || "public"})`,
    });

    processManager.steamCmd.start(
      args,
      (data) => {
        http.writeStamped(res, `[stdout] ${data}`);
        eventBus.push("steamcmd", { level: "stdout", text: data });
      },
      (err) => {
        http.writeStamped(res, `[stderr] ${err}`);
        eventBus.push("steamcmd", { level: "stderr", text: err });
      },
      (code) => {
        const line = `✅ 安裝 / 更新結束，Exit Code: ${code}`;
        http.writeStamped(res, line);
        res.end();
        eventBus.push("steamcmd", { text: line });
      },
      { autoQuitOnPrompt: true, cwd: baseDir }
    );
  } catch (err) {
    const msg = `❌ 無法啟動 steamcmd: ${err.message}`;
    error(msg);
    http.writeStamped(res, msg);
    res.end();
    eventBus.push("steamcmd", { level: "error", text: msg });
  }
});

/* 中斷安裝 */
app.post("/api/install-abort", (req, res) => {
  try {
    if (processManager?.steamCmd?.abort && processManager.steamCmd.isRunning) {
      processManager.steamCmd.abort();
      eventBus.push("steamcmd", { text: "中止安裝請求" });
      return http.sendOk(req, res, "✅ 已請求中止安裝");
    }
    return http.sendOk(req, res, "⚠️ 沒有正在執行的安裝任務");
  } catch (err) {
    return http.sendErr(req, res, `❌ 中止安裝失敗: ${err.message}`);
  }
});

/* 啟動伺服器 */
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
      const msg = `❌ 找不到執行檔: ${exePath}\n請先執行安裝 / 更新，或確認路徑為 {app}\\7daystodieserver\\7DaysToDieServer.exe`;
      error(msg);
      return http.sendErr(req, res, msg);
    }

    const logPrefix =
      exeName === "7DaysToDieServer.exe" ? "output_log_dedi" : "output_log";
    const logFileName = `${logPrefix}__${format(
      new Date(),
      "YYYY-MM-DD__HH-mm-ss"
    )}.txt`;
    const logsDir = path.join(GAME_DIR, "logs");
    const logFilePath = path.join(logsDir, logFileName);

    ensureDir(logsDir);
    try {
      if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, "");
    } catch (_) {}

    fs.writeFileSync(path.join(GAME_DIR, "steam_appid.txt"), "251570");
    process.env.SteamAppId = "251570";
    process.env.SteamGameId = "251570";

    const stripQuotes = (s) =>
      typeof s === "string" ? s.trim().replace(/^"(.*)"$/, "$1") : s;

    const cfgRaw = stripQuotes(CONFIG?.game_server?.serverConfig);
    const cfgCandidates = [];
    if (cfgRaw) {
      if (path.isAbsolute(cfgRaw)) {
        cfgCandidates.push(cfgRaw);
      } else {
        cfgCandidates.push(path.join(GAME_DIR, cfgRaw));
        cfgCandidates.push(path.join(baseDir, cfgRaw));
      }
    }
    cfgCandidates.push(
      resolveFileCaseInsensitive(GAME_DIR, "serverconfig.xml")
    );
    cfgCandidates.push(resolveFileCaseInsensitive(baseDir, "serverconfig.xml"));

    let configArg = null;
    for (const c of cfgCandidates) {
      if (c && fs.existsSync(c)) {
        configArg = c;
        break;
      }
    }
    if (!configArg) {
      eventBus.push("system", {
        text: "未找到 serverconfig.xml，將以預設設定啟動",
      });
    }

    const nographics = req.body?.nographics ?? true;
    const args = [
      "-logfile",
      logFilePath,
      "-batchmode",
      ...(nographics ? ["-nographics"] : []),
      ...(configArg ? [`-configfile=${configArg}`] : []),
      "-dedicated",
    ];

    processManager.gameServer.start(args, GAME_DIR, {
      exeName,
      onExit: (code, signal) => {
        eventBus.push("system", {
          text: `遊戲進程結束 (code=${code}, signal=${signal || "-"})`,
        });
      },
      onError: (err) => {
        eventBus.push("system", {
          level: "error",
          text: `遊戲進程錯誤: ${err?.message || err}`,
        });
      },
    });

    if (stopGameTail)
      try {
        stopGameTail();
      } catch (_) {}
    stopGameTail = tailFile(logFilePath, (line) => {
      eventBus.push("game", { level: "stdout", text: line });

      const m = line.match(/UserDataFolder:\s*(.+)$/i);
      if (m && m[1]) {
        const detected = m[1].trim().replace(/\//g, "\\");
        try {
          if (!CONFIG.game_server) CONFIG.game_server = {};
          if (CONFIG.game_server.saves !== detected) {
            CONFIG.game_server.saves = `${detected}\\Saves`;
            saveConfig();
            eventBus.push("system", {
              text: `CONFIG.game_server.saves: ${detected}`,
            });
          }
        } catch (_) {}
      }
    });

    const line = `✅ 伺服器已啟動，日誌: ${logFileName}`;
    log(line);
    eventBus.push("system", { text: line });
    return http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 伺服器啟動失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("system", { level: "error", text: msg });
    return http.sendErr(req, res, `❌ 啟動伺服器失敗:\n${err.message}`);
  }
});

/* 正常關閉 */
app.post("/api/stop", async (req, res) => {
  try {
    const result = await sendTelnetCommand(CONFIG.game_server, "shutdown");
    if (stopGameTail)
      try {
        stopGameTail();
      } catch (_) {}
    stopGameTail = null;
    const line = `✅ 關閉伺服器指令已發送`;
    log(`${line}: ${result}`);
    eventBus.push("system", { text: line });
    http.sendOk(req, res, `${line}:\n${result}`);
  } catch (err) {
    const msg = `❌ 關閉伺服器失敗: ${err.message}`;
    error(msg);
    eventBus.push("system", { level: "error", text: msg });
    http.sendErr(req, res, `${msg}`);
  }
});

/* 強制關閉（以 PID 為準） */
app.post("/api/kill", async (req, res) => {
  try {
    const pidFromBody = req.body?.pid;
    const targetPid = pidFromBody ?? processManager.gameServer.getPid();

    if (!targetPid) {
      const warn = "⚠️ 無可用 PID，可用狀態已重置";
      log(warn);
      eventBus.push("system", { text: warn });
      return http.sendOk(req, res, `✅ ${warn}`);
    }

    eventBus.push("system", { text: `🗡️ 送出強制結束請求 pid=${targetPid}` });
    const ok = await processManager.gameServer.killByPid(targetPid);

    if (stopGameTail)
      try {
        stopGameTail();
      } catch (_) {}
    stopGameTail = null;

    if (ok) {
      const line = `⚠️ 已強制結束遊戲進程 pid=${targetPid}`;
      log(line);
      eventBus.push("system", { text: line });
      return http.sendOk(req, res, `✅ ${line}`);
    } else {
      const line = `❌ 強制結束失敗 pid=${targetPid}（可能為權限不足或進程不存在）`;
      error(line);
      eventBus.push("system", { level: "error", text: line });
      return http.sendErr(req, res, line);
    }
  } catch (err) {
    const msg = `❌ 強制結束失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("system", { level: "error", text: msg });
    http.sendErr(req, res, msg);
  }
});

/* Telnet */
app.post("/api/telnet", async (req, res) => {
  const command = req.body?.command ?? "";
  if (!command)
    return http.respondText(res, "❌ 請提供 Telnet 指令", 400, true);

  try {
    const result = await sendTelnetCommand(CONFIG.game_server, command);
    eventBus.push("telnet", {
      level: "stdout",
      text: `> ${command}\n${result}`,
    });
    http.sendOk(req, res, `✅ 結果:\n${result}`);
  } catch (err) {
    const msg = `❌ Telnet 連線失敗: ${err.message}`;
    eventBus.push("telnet", { level: "stderr", text: msg });
    http.sendErr(req, res, `${msg}`);
  }
});

/* 配置檢視(文字版) */
app.post("/api/view-config", (req, res) => {
  try {
    const config = CONFIG;
    http.sendOk(
      req,
      res,
      `✅ 讀取管理後台設定成功:\n${JSON.stringify(config, null, 2)}`
    );
  } catch (err) {
    http.sendErr(req, res, `❌ 讀取管理後台設定失敗:\n${err.message}`);
  }
});

/* Telnet 探測 */
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
  eventBus.push("system", {
    text: `控制面板啟動於 http://localhost:${CONFIG.web.port}`,
  });
});
