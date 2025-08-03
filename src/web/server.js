import express from "express";
import { exec, execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Telnet } from "telnet-client";
import { promisify } from "util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 載入設定檔（server.json 或預設）
const configPath = fs.existsSync("server.json")
  ? "server.json"
  : "server.sample.json";
const CONFIG = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/view-saves", (_, res) => {
  fs.readdir(CONFIG.web.saves, (err, files) => {
    if (err) return res.status(500).send(`❌ 讀取存檔失敗:\n${err}`);
    const saves = files.filter((file) => file.endsWith(".zip"));
    res.send(saves.join("\n"));
  });
});

app.post("/api/backup", async (_, res) => {
  try {
    const now = new Date();
    const timestamp = now
      .toLocaleString("sv-SE", {
        timeZone: CONFIG.web.timeZone || "Asia/Taipei",
      })
      .replace(/[-: ]/g, "")
      .slice(0, 14);
    const zipName = `Saves-${timestamp}.zip`;
    const outputPath = path.join(CONFIG.web.saves, zipName);

    if (!fs.existsSync(CONFIG.web.saves)) {
      fs.mkdirSync(CONFIG.web.saves, { recursive: true });
    }

    const zipCmd = `"${CONFIG.web.zipTool}" a "${outputPath}" "${CONFIG.game_server.saves}"`;
    const { stdout } = await execAsync(zipCmd);
    res.send(`✅ 備份完成: ${zipName}\n${stdout}`);
  } catch (err) {
    res.status(500).send(`❌ 備份失敗:\n${err}`);
  }
});

app.post("/api/start", async (_, res) => {
  try {
    const cmd = `cmd /c start "" "${CONFIG.game_server.startBat}"`;
    await execAsync(cmd);
    res.send(`✅ 啟動已觸發，請稍候伺服器啟動...`);
  } catch (err) {
    res.status(500).send(`❌ 啟動失敗:\n${err}`);
  }
});

app.post("/api/stop", async (_, res) => {
  try {
    const result = await sendTelnetCommand("shutdown");
    res.send(`✅ 關閉指令已發送:\n${result}`);
  } catch (err) {
    res.status(500).send(`❌ 關閉失敗:\n${err.message}`);
  }
});

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

app.post("/api/install", async (req, res) => {
  const version = req.body.version || "";
  const batPath = path.join(__dirname, "scripts", "update-server.bat");

  try {
    const { stdout } = await execFileAsync(batPath, [
      CONFIG.web.steamcmd,
      CONFIG.game_server.path,
      version,
    ]);
    res.send(stdout || "✅ 安裝/更新完成");
  } catch (err) {
    res.status(500).send(`❌ 安裝/更新失敗:\n${err.message}`);
  }
});

app.post("/api/view-admin-settings", (_, res) => {
  try {
    const json = fs.readFileSync(path.join(CONFIG.web.path, "server.json"), "utf8");
    const parsedJson = JSON.parse(json);
    res.json(parsedJson);
  } catch (err) {
    res.status(500).send(`❌ 讀取管理後台設定失敗:\n${err.message}`);
  }
});

async function sendTelnetCommand(command) {
  const connection = new Telnet();

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

    // 輸入密碼後等提示符
    await connection.send(CONFIG.game_server.telnetPassword, { waitfor: ">" });

    // 發送指令並等候回傳
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
  console.log(`✅ 7 Days To Die Dedicated Server Plus 控制 API 與介面已啟動於 http://localhost:${CONFIG.web.port}`);
});
