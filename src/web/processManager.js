const { spawn } = require("child_process");
const path = require("path");
const TelnetClient = require("telnet-client");

const processManager = {
  steamCmd: {
    process: null,
    isRunning: false,
    start(args, onData, onError, onClose) {
      if (this.isRunning) {
        throw new Error("steamcmd 已經在執行中");
      }
      this.process = spawn(path.join("steamcmd", "steamcmd.exe"), args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.isRunning = true;

      this.process.stdout.on("data", (data) => {
        const text = data.toString();
        console.log(`[stdout-steamcmd] ${text}`);
        if (onData) onData(text);
      });

      this.process.stderr.on("data", (data) => {
        const text = data.toString();
        console.error(`[stderr-steamcmd] ${text}`);
        if (onError) onError(text);
      });

      this.process.on("close", (code) => {
        console.log(`steamcmd 結束，Exit Code: ${code}`);
        this.isRunning = false;
        this.process = null;
        if (onClose) onClose(code);
      });

      this.process.on("error", (err) => {
        console.error(`steamcmd 發生錯誤: ${err.message}`);
        this.isRunning = false;
        this.process = null;
        if (onError) onError(err.message);
      });
    },
    stop() {
      if (this.process) {
        this.process.kill("SIGTERM");
        this.isRunning = false;
        this.process = null;
        console.log("✅ steamcmd 已中止");
      }
    },
  },
  gameServer: {
    process: null,
    isRunning: false,
    isTelnetConnected: false,
    start(args, baseDir) {
      if (this.isRunning) {
        throw new Error("遊戲伺服器已經在運行中");
      }
      const exeName = "7DaysToDieServer.exe";
      const exePath = path.join(baseDir, exeName);

      this.process = spawn(exePath, args, {
        cwd: baseDir,
        detached: true,
        stdio: "ignore",
      });
      this.isRunning = true;
      this.process.unref();
      console.log("✅ 遊戲伺服器已啟動");
    },
    stop() {
      if (this.isRunning) {
        console.log("✅ 關閉伺服器指令已發送");
        this.isRunning = false;
      }
    },
    async checkTelnet(config) {
      const connection = new TelnetClient();
      const params = {
        host: config.ip,
        port: config.telnetPort,
        shellPrompt: ">",
        timeout: 2000,
        negotiationMandatory: false,
        ors: "\n",
        irs: "\n",
      };
      try {
        await connection.connect(params);
        await connection.send(config.telnetPassword, { waitfor: ">" });
        this.isTelnetConnected = true;
      } catch (err) {
        console.error("❌ Telnet 連線失敗:", err.message);
        this.isTelnetConnected = false;
      } finally {
        await connection.end().catch(() => {});
      }
    },
  },
};

module.exports = processManager;
