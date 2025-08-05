const express = require("express");
const { exec, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const TelnetClient = require("telnet-client");
const { promisify } = require("util");

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
const startServerBatPath = path.join(baseDir, "scripts", "start-server.bat");
const updateServerBatPath = path.join(baseDir, "scripts", "update-server.bat");
const backupSavesPath = path.join(baseDir, "public", "saves");

const app = express();
app.use(express.json());
app.use(express.static(path.join(baseDir, "public")));

function loadConfig() {
  try {
    const rawData = fs.readFileSync(serverJsonPath, "utf-8").replace(/^\uFEFF/, "");
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
    if (err) return res.status(500).send(`❌ 讀取存檔失敗:\n${err}`);
    const saves = files.filter((file) => file.endsWith(".zip"));
    res.send(saves.join("\n"));
  });
});

// 備份存檔
app.post("/api/backup", async (_, res) => {
  try {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
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
    res.send(`✅ 備份完成: ${zipName}\n${stdout}`);
  } catch (err) {
    res.status(500).send(`❌ 備份失敗:\n${err}`);
  }
});

// 安裝 / 更新伺服器
app.post("/api/install", async (req, res) => {
  const version = req.body.version || "";
  try {
    const cmd = `cmd /c start "" "${updateServerBatPath}" ${version}`;
    await execAsync(cmd);
    res.send(`✅ 安裝 / 更新已觸發，請稍候伺服器更新...`);
  } catch (err) {
    res.status(500).send(`❌ 安裝 / 更新失敗:\n${err}`);
  }
});

// 啟動伺服器
app.post("/api/start", async (req, res) => {
  const { nographics } = req.body;
  try {
    const noguiFlag = nographics ? "-nographics" : "";
    const cmd = `cmd /c start "" "${startServerBatPath}" ${noguiFlag}`;
    await execAsync(cmd);
    res.send(`✅ 啟動已觸發，請稍候伺服器啟動...`);
  } catch (err) {
    res.status(500).send(`❌ 啟動失敗:\n${err}`);
  }
});

// 關閉伺服器
app.post("/api/stop", async (_, res) => {
  try {
    const result = await sendTelnetCommand("shutdown");
    res.send(`✅ 關閉指令已發送:\n${result}`);
  } catch (err) {
    res.status(500).send(`❌ 關閉失敗:\n${err.message}`);
  }
});

// 發送 Telnet 指令
app.post("/api/telnet", async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).send("❌ 請提供 Telnet 指令");

  try {
    const result = await sendTelnetCommand(command);
    res.send(`✅ 結果:\n${result}`);
  } catch (err) {
    res.status(500).send("❌ Telnet 連線失敗:\n" + err.message);
  }
});

// 查看管理設定
app.post("/api/view-config", (_, res) => {
  try {
    const config = getConfig();
    console.log("✅ 讀取管理後台設定:", config);
    res.json(config);
  } catch (err) {
    console.error(`❌ 讀取管理後台設定失敗:\n${err.message}`);
    res.status(500).send(`❌ 讀取管理後台設定失敗:\n${err.message}`);
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

app.listen(CONFIG.web.port, () => {
  console.log(`✅ 控制面板已啟動於 http://localhost:${CONFIG.web.port}`);
});
