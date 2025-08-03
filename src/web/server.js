import express from "express";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Telnet = require("telnet-client").Telnet;

const fsPath = fs.existsSync("server.json") ? "server.json" : "server.sample.json";
const CONFIG = require(fsPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/view-saves", (_, res) => {
  fs.readdir(CONFIG.web.saves, (err, files) => {
    if (err) {
      console.error("讀取存檔目錄失敗:", err);
      return res.status(500).send(`❌ 讀取存檔失敗:\n${err}`);
    }
    const saves = files.filter((file) => file.endsWith(".zip"));
    res.send(saves.join("\n"));
  });
});

app.post("/api/backup", (_, res) => {
  const now = new Date();
  const timestamp = now
    .toLocaleString("sv-SE", { timeZone: "Asia/Taipei" })
    .replace(/[-: ]/g, "")
    .slice(0, 14); // YYYYMMDDhhmmss
  const zipName = `Saves-${timestamp}.zip`;

  const outputPath = path.join(CONFIG.web.saves, zipName);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const zipCmd = `"${CONFIG.web.zipTool}" a "${outputPath}" ${CONFIG.game_server.saves}`;

  exec(zipCmd, (err, _, stderr) => {
    if (err) return res.status(500).send(`❌ 備份失敗:\n${stderr}`);
    res.send(`✅ 備份完成: ${zipName}`);
  });
});

app.post("/api/start", (_, res) => {
  const startCmd = `cmd /c start "" "${CONFIG.game_server.startBat}"`;

  exec(startCmd, (err, stdout, stderr) => {
    if (err) return res.status(500).send(`❌ 啟動失敗:\n${stderr}`);
    res.send(`✅ 啟動已觸發，請稍候伺服器啟動...`);
  });
});

app.post("/api/stop", (_, res) => {
  const result = sendTelnetCommand("shutdown");
  result
    .then((output) => res.send(`✅ 關閉指令已發送:\n${output}`))
    .catch((err) => res.status(500).send("❌ 關閉失敗:\n" + err.message));
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

async function sendTelnetCommand(command) {
  const Telnet = require("telnet-client").Telnet;
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
