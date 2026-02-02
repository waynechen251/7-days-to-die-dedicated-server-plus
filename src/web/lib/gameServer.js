const { spawn, execFile } = require("child_process");
const path = require("path");
const killTree = require("tree-kill");
const { log, error } = require("./logger");
const { checkTelnetAlive } = require("./telnet");

const gameServer = {
  child: null,
  isRunning: false,
  isTelnetConnected: false,
  basePath: null,
  lastPid: null,
  start(args, gameServerPath, options = {}) {
    if (this.isRunning) throw new Error("遊戲伺服器已經在運行中");
    const { exeName = "7DaysToDieServer.exe", onExit, onError } = options;

    this.basePath = gameServerPath;
    const exePath = path.join(gameServerPath, exeName);

    log(
      `🚀 啟動遊戲伺服器: exe=${exePath}, cwd=${gameServerPath}, args=${JSON.stringify(
        args
      )}`
    );

    try {
      this.child = spawn(exePath, args, {
        cwd: gameServerPath,
        detached: true,
        stdio: "ignore",
      });
    } catch (err) {
      this.child = null;
      this.isRunning = false;
      this.basePath = null;
      error(`❌ 進程啟動失敗: ${err?.message || err}`);
      if (typeof onError === "function") onError(err);
      throw err;
    }

    this.isRunning = true;
    this.lastPid = this.child.pid;
    log(`✅ 遊戲伺服器進程啟動，pid=${this.child.pid}`);

    this.child.on("error", (err) => {
      this.isRunning = false;
      this.isTelnetConnected = false;
      this.child = null;
      this.basePath = null;
      error(`❌ 遊戲伺服器進程錯誤: ${err?.message || err}`);
      if (typeof onError === "function") {
        try {
          onError(err);
        } catch (_) {}
      }
    });

    let closed = false;
    const onClose = (code, signal) => {
      if (closed) return;
      closed = true;
      this.isRunning = false;
      this.isTelnetConnected = false;
      this.child = null;
      this.basePath = null;
      log(`🛑 遊戲伺服器進程結束 code=${code ?? -1}, signal=${signal || "-"}`);
      if (typeof onExit === "function") {
        try {
          onExit(code ?? -1, signal || null);
        } catch (_) {}
      }
    };

    this.child.on("exit", onClose);
    this.child.on("close", onClose);

    this.child.unref();
  },

  getPid() {
    return this.child?.pid ?? this.lastPid ?? null;
  },

  async killByPid(pid) {
    const targetPid = pid ?? this.getPid();
    if (!targetPid) {
      log("ℹ️ killByPid: 無可用 PID");
      return false;
    }

    if (process.platform === "win32") {
      const cmd = process.env.ComSpec || "cmd.exe";
      const args = ["/c", "taskkill", "/PID", String(targetPid), "/T", "/F"];

      log(`🗡️ killByPid: 執行 taskkill PID=${targetPid}`);
      const ok = await new Promise((resolve) => {
        execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
          if (stdout) log(`taskkill stdout: ${stdout.trim()}`);
          if (stderr) error(`taskkill stderr: ${stderr.trim()}`);
          if (err) {
            error(
              `❌ taskkill 失敗 pid=${targetPid}, code=${
                err.code ?? "-"
              }, msg=${err.message}`
            );
            return resolve(false);
          }
          log(`✅ taskkill 成功 pid=${targetPid}`);
          resolve(true);
        });
      });

      this.child = null;
      this.isRunning = false;
      this.isTelnetConnected = false;
      this.basePath = null;

      return ok;
    }

    try {
      process.kill(targetPid, "SIGKILL");
      log(`✅ process.kill 成功 pid=${targetPid}`);
    } catch (e) {
      error(`❌ process.kill 失敗 pid=${targetPid}: ${e?.message || e}`);
      return false;
    } finally {
      this.child = null;
      this.isRunning = false;
      this.isTelnetConnected = false;
      this.basePath = null;
    }
    return true;
  },

  killTree() {
    if (this.child && !this.child.killed) {
      log(`🗡️ killTree() 結束子進程 pid=${this.child.pid}`);
      try {
        killTree(this.child.pid);
      } catch (e) {
        error(`❌ killTree 發生錯誤: ${e?.message || e}`);
      }
    } else {
      log("ℹ️ killTree(): 無子進程可結束，僅重置狀態");
    }
    this.child = null;
    this.isRunning = false;
    this.isTelnetConnected = false;
    this.basePath = null;
    log("✅ 狀態已重置");
  },

  async checkTelnet() {
    this.isTelnetConnected = checkTelnetAlive();
  },

  /**
   * 檢查系統中是否存在指定名稱的進程
   * @param {string} exeName 進程名稱 (例如 7DaysToDieServer.exe)
   * @returns {Promise<boolean>}
   */
  async isProcessRunning(exeName) {
    if (process.platform !== "win32") return false;
    return new Promise((resolve) => {
      execFile("tasklist", ["/FI", `IMAGENAME eq ${exeName}`, "/NH"], { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(false);
        resolve(stdout.toLowerCase().includes(exeName.toLowerCase()));
      });
    });
  },
};

module.exports = gameServer;
