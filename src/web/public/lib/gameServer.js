const { spawn } = require("child_process");
const path = require("path");
const killTree = require("tree-kill");

const gameServer = {
  child: null,
  isRunning: false,
  isTelnetConnected: false,

  /**
   * 啟動 7D2D 伺服器（保留相容：由外部決定 args 與 cwd）
   * @param {string[]} args
   * @param {string} gameServerPath
   * @param {{exeName?:string}} options
   */
  start(args, gameServerPath, options = {}) {
    if (this.isRunning) throw new Error("遊戲伺服器已經在運行中");
    const { exeName = "7DaysToDieServer.exe" } = options;

    const exePath = path.join(gameServerPath, exeName);
    this.child = spawn(exePath, args, {
      cwd: gameServerPath,
      detached: true,
      stdio: "ignore",
    });
    this.child.unref();
    this.isRunning = true;
  },

  /**
   * 若 Telnet 關不了（或 Telnet 掛了），可用 killTree 強制結束
   */
  killTree() {
    if (!this.child || this.child.killed) {
      this.child = null;
      this.isRunning = false;
      return;
    }
    try {
      killTree(this.child.pid);
    } catch (_) {}
    this.child = null;
    this.isRunning = false;
  },
};

module.exports = gameServer;
