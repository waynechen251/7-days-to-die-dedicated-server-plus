const { spawn } = require("child_process");
const path = require("path");
const killTree = require("tree-kill");

const gameServer = {
  child: null,
  isRunning: false,
  isTelnetConnected: false,

  /**
   * 啟動 7D2D 伺服器(保留相容: 由外部決定 args 與 cwd)
   * @param {string[]} args
   * @param {string} gameServerPath
   * @param {{exeName?:string,onExit?:(code:number,signal:string)=>void,onError?:(err:any)=>void}} options
   */
  start(args, gameServerPath, options = {}) {
    if (this.isRunning) throw new Error("遊戲伺服器已經在運行中");
    const { exeName = "7DaysToDieServer.exe", onExit, onError } = options;

    const exePath = path.join(gameServerPath, exeName);
    try {
      this.child = spawn(exePath, args, {
        cwd: gameServerPath,
        detached: true,
        stdio: "ignore",
      });
    } catch (err) {
      this.child = null;
      this.isRunning = false;
      if (typeof onError === "function") onError(err);
      throw err;
    }

    this.isRunning = true;

    this.child.on("error", (err) => {
      this.isRunning = false;
      this.isTelnetConnected = false;
      this.child = null;
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

  /**
   * 若 Telnet 關不了(或 Telnet 掛了)，可用 killTree 強制結束
   */
  killTree() {
    if (!this.child || this.child.killed) {
      this.child = null;
      this.isRunning = false;
      this.isTelnetConnected = false;
      return;
    }
    try {
      killTree(this.child.pid);
    } catch (_) {}
    this.child = null;
    this.isRunning = false;
    this.isTelnetConnected = false;
  },
};

module.exports = gameServer;
