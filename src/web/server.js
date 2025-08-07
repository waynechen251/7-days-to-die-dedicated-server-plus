const express = require("express");
const { exec, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const TelnetClient = require("telnet-client");
const { promisify } = require("util");
const { spawn } = require("child_process");
const dayjs = require("dayjs");
// Custom utility functions
const processManager = require("./processManager");

const execAsync = promisify(exec);

// 設定 Windows console 編碼為 UTF-8
if (process.platform === "win32") {
  exec("chcp 65001 >NUL");
}

// 判斷是否為 pkg 打包後的 exe
const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg
  ? path.dirname(process.execPath)
  : path.dirname(require.main.filename);

// 設定檔路徑（優先 server.json，否則用 server.sample.json）
const serverJsonPath = fs.existsSync(path.join(baseDir, "server.json"))
  ? path.join(baseDir, "server.json")
  : path.join(baseDir, "server.sample.json");

const CONFIG = loadConfig();

const zipExePath = path.join(baseDir, "7-Zip", "7z.exe");
const backupSavesPath = path.join(baseDir, "public", "saves");

let steamCmdChild = null;
let sevenDaysToDieServerChild = false;

const app = express();
app.use(express.json());
app.use(express.static(path.join(baseDir, "public")));

function loadConfig() {
  try {
    const rawData = fs
      .readFileSync(serverJsonPath, "utf-8")
      .replace(/^\uFEFF/, "");
    const config = JSON.parse(rawData);
    console.log("✅ 成功讀取設定檔:", serverJsonPath);
    console.log("管理後台設定:", config);
    return config;
  } catch (err) {
    console.error(`❌ 讀取設定檔失敗: ${serverJsonPath}\n${err.message}`);
    return null;
  }
}

function getConfig() {
  return CONFIG;
}

// 查看存檔
app.post("/api/view-saves", (_, res) => {
  if (!fs.existsSync(backupSavesPath)) {
    fs.mkdirSync(backupSavesPath, { recursive: true });
  }

  fs.readdir(backupSavesPath, (err, files) => {
    if (err) return sendError(res, `❌ 讀取存檔失敗:\n${err}`);
    const saves = files.filter((file) => file.endsWith(".zip"));
    if (saves.length === 0) {
      return sendResponse(res, "❌ 沒有找到任何存檔");
    }
    // 取得詳細檔案資訊
    const details = saves.map((file) => {
      const filePath = path.join(backupSavesPath, file);
      const stats = fs.statSync(filePath);
      const size = stats.size;
      const date = formatDate(stats.mtime);
      const sizeStr = formatBytes(size);
      return `${file} (${sizeStr}, ${date})`;
    });
    sendResponse(res, `✅ 找到以下存檔:\n${details.join("\n")}`);
  });
});

// 備份存檔
app.post("/api/backup", async (_, res) => {
  try {
    const now = new Date();
    const timestamp = formatDate(now, "YYYYMMDDHHmmss");
    const zipName = `Saves-${timestamp}.zip`;
    const outputPath = path.join(backupSavesPath, zipName);

    if (!fs.existsSync(backupSavesPath)) {
      fs.mkdirSync(backupSavesPath, { recursive: true });
    }

    const zipCmd = `"${zipExePath}" a "${outputPath}" "${path.join(
      CONFIG.game_server.saves,
      "*"
    )}"`;
    const { stdout } = await execAsync(zipCmd);
    sendResponse(res, `✅ 備份完成: ${zipName}\n${stdout}`);
  } catch (err) {
    sendError(res, `❌ 備份失敗:\n${err}`);
  }
});

// 查詢進程狀態
app.get("/api/process-status", async (_, res) => {
  try {
    await processManager.gameServer.checkTelnet(CONFIG.game_server);
    const status = {
      steamCmd: {
        isRunning: processManager.steamCmd.isRunning,
      },
      gameServer: {
        isRunning: processManager.gameServer.isRunning,
        isTelnetConnected: processManager.gameServer.isTelnetConnected,
      },
    };
    res.status(200).json(status);
  } catch (err) {
    console.error("❌ 無法查詢進程狀態:", err);
    res.status(500).json({ error: "無法查詢進程狀態" });
  }
});

// 使用進程管理器啟動 steamcmd
app.post("/api/install", (req, res) => {
  try {
    const version = req.body?.version ?? "";
    const args = [
      "+login",
      "anonymous",
      "+force_install_dir",
      "..\\7DaysToDieServer",
      "+app_update",
      "294420",
      ...(version ? ["-beta", version] : []),
      "validate",
      "+quit",
    ];

    processManager.steamCmd.start(
      args,
      (data) => res.write(`[stdout] ${data}`),
      (err) => res.write(`[stderr] ${err}`),
      (code) => res.end(`\n✅ 安裝 / 更新結束，Exit Code: ${code}\n`)
    );
  } catch (err) {
    sendError(res, `❌ 無法啟動 steamcmd: ${err.message}`);
  }
});

// 使用進程管理器啟動遊戲伺服器
app.post("/api/start", (req, res) => {
  try {
    const args = [
      "-logfile",
      path.join(baseDir, "output_log.txt"),
      "-quit",
      "-batchmode",
      "-nographics",
      "-configfile=serverconfig.xml",
      "-dedicated",
    ];
    processManager.gameServer.start(args, baseDir);
    sendResponse(res, "✅ 遊戲伺服器已啟動");
  } catch (err) {
    sendError(res, `❌ 無法啟動遊戲伺服器: ${err.message}`);
  }
});

// 中止安裝 / 更新伺服器
app.post("/api/install-abort", (_, res) => {
  if (steamCmdChild) {
    steamCmdChild.kill("SIGTERM");
    steamCmdChild = null;
    sendResponse(res, "✅ 已請求中止安裝");
  } else {
    sendResponse(res, "⚠️ 沒有正在執行的安裝任務");
  }
});

// 啟動伺服器
app.post("/api/start", async (req, res) => {
  if (sevenDaysToDieServerChild) {
    return sendResponse(res, "❌ 伺服器已經在運行中，請先關閉伺服器再試。");
  }

  try {
    const exeName = fs.existsSync(path.join(baseDir, "7DaysToDieServer.exe"))
      ? "7DaysToDieServer.exe"
      : "7DaysToDie.exe";

    const logPrefix =
      exeName === "7DaysToDieServer.exe" ? "output_log_dedi" : "output_log";

    const timestamp = formatDate(new Date(), "YYYY-MM-DD__HH-mm-ss");
    const logFileName = `${logPrefix}__${timestamp}.txt`;
    const logFilePath = path.join(baseDir, logFileName);

    console.log(`📝 日誌將寫入: ${logFilePath}`);

    fs.writeFileSync(path.join(baseDir, "steam_appid.txt"), "251570");

    process.env.SteamAppId = "251570";
    process.env.SteamGameId = "251570";

    const exePath = path.join(baseDir, exeName);
    const args = [
      "-logfile",
      logFilePath,
      "-quit",
      "-batchmode",
      "-nographics",
      "-configfile=serverconfig.xml",
      "-dedicated",
    ];

    sevenDaysToDieServerChild = spawn(exePath, args, {
      cwd: baseDir,
      detached: true,
      stdio: "ignore",
    });

    sevenDaysToDieServerChild.unref();

    return sendResponse(res, `✅ 伺服器已啟動，日誌: ${logFileName}`);
  } catch (err) {
    console.error("❌ 伺服器啟動失敗:", err);
    return sendError(res, `❌ 啟動伺服器失敗:\n${err.message}`);
  }
});

// 關閉伺服器
app.post("/api/stop", async (_, res) => {
  try {
    const result = await sendTelnetCommand("shutdown");
    sendResponse(res, `✅ 關閉伺服器指令已發送:\n${result}`);
  } catch (err) {
    sendError(res, `❌ 關閉伺服器失敗:\n${err.message}`);
  }
});

// 發送 Telnet 指令
app.post("/api/telnet", async (req, res) => {
  const command = req.body?.command ?? "";
  if (!command) return res.status(400).send("❌ 請提供 Telnet 指令");

  try {
    const result = await sendTelnetCommand(command);
    sendResponse(res, `✅ 結果:\n${result}`);
  } catch (err) {
    sendError(res, `❌ Telnet 連線失敗:\n${err.message}`);
  }
});

// 查看管理設定
app.post("/api/view-config", (_, res) => {
  try {
    const config = getConfig();
    console.log("✅ 讀取管理後台設定:", config);
    sendResponse(
      res,
      `✅ 讀取管理後台設定成功:\n${JSON.stringify(config, null, 2)}`
    );
  } catch (err) {
    console.error(`❌ 讀取管理後台設定失敗:\n${err.message}`);
    sendError(res, `❌ 讀取管理後台設定失敗:\n${err.message}`);
  }
});

// 輪詢遊戲伺服器
app.post("/api/server-status", async (_, res) => {
  try {
    await sendTelnetCommand("version");
    res.json({ status: "online" });
    sevenDaysToDieServerChild = true;
  } catch (err) {
    res.json({ status: "telnet-fail" });
    sevenDaysToDieServerChild = false;
  }
});

// Telnet 指令發送
async function sendTelnetCommand(command) {
  const connection = new TelnetClient();
  const params = {
    host: CONFIG.game_server.ip,
    port: CONFIG.game_server.telnetPort,
    shellPrompt: ">",
    timeout: 2000,
    negotiationMandatory: false,
    ors: "\n",
    irs: "\n",
  };
  try {
    await connection.connect(params);
    await connection.send(CONFIG.game_server.telnetPassword, { waitfor: ">" });
    const result = await connection.send(command, { waitfor: ">" });
    await connection.end();
    return result.trim();
  } catch (err) {
    await connection.end().catch(() => {});
    throw new Error(
      `連線或指令執行失敗: ${err.message}\n執行的命令: ${command}`
    );
  }
}

function destroySteamCmdChild() {
  if (steamCmdChild) {
    steamCmdChild.kill("SIGTERM");
    steamCmdChild = null;
    console.log("✅ steamcmd 子進程已銷毀");
  }
}

function formatBytes(size) {
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  } else if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  } else if (size >= 1024) {
    return `${(size / 1024).toFixed(2)} KB`;
  } else {
    return `${size} B`;
  }
}

function formatDate(date, format = "YYYY-MM-DD HH:mm:ss") {
  return dayjs(date).format(format);
}

function sendResponse(res, message, status = 200) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(status).send(`${message}\n`);
}

function sendError(res, message, status = 500) {
  console.error(message);
  sendResponse(res, `${message}`, status);
  res.status(status).end();
}

app.listen(CONFIG.web.port, () => {
  console.log(`✅ 控制面板已啟動於 http://localhost:${CONFIG.web.port}`);
});
