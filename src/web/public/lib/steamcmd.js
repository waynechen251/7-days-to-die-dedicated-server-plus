const { spawn } = require("child_process");
const path = require("path");
const killTree = require("tree-kill");

const steamcmd = {
  child: null,
  isRunning: false,
  waitingForInput: false,

  /**
   * 啟動 steamcmd
   * @param {string[]} args
   * @param {(data:string)=>void} onData
   * @param {(err:string)=>void} onError
   * @param {(code:number)=>void} onClose
   * @param {{autoQuitOnPrompt?:boolean,cwd?:string}} options
   */
  start(args, onData, onError, onClose, options = {}) {
    if (this.isRunning) throw new Error("steamcmd 已經在執行中");
    const { autoQuitOnPrompt = true, cwd = process.cwd() } = options;

    const exe = path.join("steamcmd", "steamcmd.exe");
    this.child = spawn(exe, args, { stdio: ["pipe", "pipe", "pipe"], cwd });
    this.isRunning = true;
    this.waitingForInput = false;

    const onOut = (buf) => {
      const text = buf.toString();
      onData && onData(text);

      if (
        /type\s+'?quit'?/i.test(text) ||
        /waiting for user input/i.test(text)
      ) {
        this.waitingForInput = true;
        if (autoQuitOnPrompt && this.child && !this.child.killed) {
          try {
            this.child.stdin.write("quit\n");
          } catch (_) {}
        }
      }
    };

    const onErr = (buf) => onError && onError(buf.toString());

    this.child.stdout.on("data", onOut);
    this.child.stderr.on("data", onErr);

    this.child.on("close", (code) => {
      this.isRunning = false;
      this.waitingForInput = false;
      this.child = null;
      onClose && onClose(code ?? -1);
    });

    this.child.on("error", (err) => {
      this.isRunning = false;
      this.waitingForInput = false;
      this.child = null;
      onError && onError(err.message);
      onClose && onClose(-1);
    });
  },

  abort() {
    this.stop();
  },

  stop() {
    if (!this.child || this.child.killed) return;
    try {
      killTree(this.child.pid);
    } catch (_) {}
    this.child = null;
    this.isRunning = false;
    this.waitingForInput = false;
  },
};

module.exports = steamcmd;
