const path = require("path");
const fs = require("fs");
const { format } = require("../time");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * 清理舊的遊戲日誌檔案
 * @param {string} logsDir - 日誌目錄路徑
 * @param {number} keepDays - 保留天數（預設 7 天）
 * @param {function} log - 日誌函數
 * @param {function} error - 錯誤日誌函數
 */
function cleanOldGameLogs(logsDir, keepDays, log, error) {
  try {
    const now = Date.now();
    const maxAge = keepDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(logsDir, { withFileTypes: true });

    for (const f of files) {
      if (!f.isFile()) continue;
      if (!/^output_log.*\.txt$/i.test(f.name)) continue;

      const filePath = path.join(logsDir, f.name);
      const stat = fs.statSync(filePath);

      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        log(`已刪除舊日誌: ${f.name}`);
      }
    }
  } catch (e) {
    error(`清理舊日誌失敗: ${e.message}`);
  }
}

module.exports = function registerGameRoutes(app, ctx) {
  const {
    http,
    eventBus,
    processManager,
    serverConfigLib,
    logParser,
    tailFile,
    sendTelnetCommand,
    telnetStart,
    closeDummyGamePort,
    getConfig,
    saveConfig,
    baseDir,
    GAME_DIR,
    log,
    error,
    getStopGameTail,
    setStopGameTail,
  } = ctx;

  app.post("/api/start", async (req, res) => {
    const CONFIG = getConfig();
    if (processManager.gameServer.isRunning) {
      return http.sendOk(req, res, "❌ 伺服器已經在運行中，請先關閉伺服器再試。");
    }
    closeDummyGamePort("game-start");
    try {
      processManager.status.resetVersion();
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

      // 清理超過保留天數的舊日誌
      const keepDays = CONFIG.log_keep_days ?? 7;
      cleanOldGameLogs(logsDir, keepDays, log, error);
      try {
        if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, "");
      } catch (_) {}

      fs.writeFileSync(path.join(GAME_DIR, "steam_appid.txt"), "251570");
      process.env.SteamAppId = "251570";
      process.env.SteamGameId = "251570";

      const { configPath: configArg } = serverConfigLib.loadAndSyncServerConfig({
        CONFIG,
        baseDir,
        GAME_DIR,
        eventBus,
        saveConfig,
      });

      const nographics = req.body?.nographics ?? true;
      const args = [
        "-logfile",
        logFilePath,
        "-batchmode",
        ...(nographics ? ["-nographics"] : []),
        ...(configArg ? [`-configfile=${configArg}`] : []),
        "-dedicated",
        CONFIG.game_server.TelnetPort,
        CONFIG.game_server.TelnetPassword,
      ];

      processManager.gameServer.start(args, GAME_DIR, {
        exeName,
        onExit: (code, signal) => {
          eventBus.push("system", {
            text: `遊戲進程結束 (code=${code}, signal=${signal || "-"})`,
          });
          processManager.status.resetVersion();
        },
        onError: (err) => {
          eventBus.push("system", {
            level: "error",
            text: `遊戲進程錯誤: ${err?.message || err}`,
          });
        },
      });

      const stopGameTail = getStopGameTail();
      if (stopGameTail) {
        try {
          stopGameTail();
        } catch (_) {}
      }
      const newStopGameTail = tailFile(logFilePath, (line) => {
        eventBus.push("game", { level: "stdout", text: line });
        const logData = logParser.detectAndParse(line);
        if (logData == null) return;
        switch (logData.kind) {
          case "status":
            processManager.gameServer.onlinePlayers = logData.data.ply;
            processManager.gameServer.fps = logData.data.fps;
            processManager.gameServer.heapMB = logData.data.heap;
            processManager.gameServer.maxMB = logData.data.max;
            processManager.gameServer.zom = logData.data.zom;
            processManager.gameServer.rssMB = logData.data.rss;
            try {
              processManager.status?.refresh?.().catch(() => {});
            } catch (_) {}
            break;
          case "version":
            processManager.gameServer.gameVersion = logData.data.version;
            break;
          case "telnetStarted":
            telnetStart({
              TelnetPort: CONFIG.game_server.TelnetPort,
              TelnetPassword: CONFIG.game_server.TelnetPassword,
            });
            break;
          case "userDataFolder": {
            const detected = logData.data.path.trim().replace(/\//g, "\\");
            try {
              if (!CONFIG.game_server) CONFIG.game_server = {};
              const newRoot = `${detected}`;
              const prev = ctx.getSavesRoot();
              if (prev !== newRoot) {
                CONFIG.game_server.UserDataFolder = newRoot;
                if (CONFIG.game_server.saves) delete CONFIG.game_server.saves;
                saveConfig();
                eventBus.push("system", {
                  text: `自動偵測七日殺伺服器存檔目錄: ${newRoot}`,
                });
                ctx.logPathInfo("detect");
              }
            } catch (_) {}
            break;
          }
        }
      });
      setStopGameTail(newStopGameTail);

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

  app.post("/api/stop", async (req, res) => {
    try {
      const result = await sendTelnetCommand("shutdown");
      const stopGameTail = getStopGameTail();
      if (stopGameTail)
        try {
          stopGameTail();
        } catch (_) {}
      setStopGameTail(null);
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

  app.post("/api/telnet", async (req, res) => {
    const command = req.body?.command ?? "";
    if (!command)
      return http.respondText(res, "❌ 請提供 Telnet 指令", 400, true);

    try {
      const result = await sendTelnetCommand(command);
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
};
