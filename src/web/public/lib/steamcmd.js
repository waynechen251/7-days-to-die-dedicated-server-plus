const { spawn, execFile } = require("child_process");
const path = require("path");
const killTree = require("tree-kill");

const steamcmd = {
  child: null,
  isRunning: false,
  waitingForInput: false,
  lastPid: null,
  killing: false,

  start(args, onData, onError, onClose, options = {}) {
    if (this.isRunning) throw new Error("steamcmd 已經在執行中");
    if (this.killing) throw new Error("steamcmd 正在終止中，請稍候再試");
    const { autoQuitOnPrompt = true, cwd = process.cwd() } = options;

    const exe = path.join("steamcmd", "steamcmd.exe");
    this.child = spawn(exe, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      windowsHide: true,
    });
    this.isRunning = true;
    this.waitingForInput = false;
    this.lastPid = this.child.pid;

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

    const finalize = (code) => {
      if (!this.isRunning && !this.killing) return;
      this.isRunning = false;
      this.waitingForInput = false;
      this.child = null;
      this.killing = false;
      onClose && onClose(code ?? -1);
    };

    this.child.on("close", (code) => finalize(code));
    this.child.on("error", (err) => {
      onError && onError(err.message);
      finalize(-1);
    });
  },

  async killByPid(pid) {
    const target = pid || this.child?.pid || this.lastPid;
    if (!target) return false;
    if (this.killing) return false;
    this.killing = true;

    const done = (ok) => {
      this.child = null;
      this.isRunning = false;
      this.waitingForInput = false;
      this.killing = false;
      return ok;
    };

    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const cmd = process.env.ComSpec || "cmd.exe";
        const args = ["/c", "taskkill", "/PID", String(target), "/T", "/F"];
        execFile(cmd, args, { windowsHide: true }, () => resolve());
      });
      return done(true);
    } else {
      try {
        process.kill(target, "SIGKILL");
      } catch (_) {}
      return done(true);
    }
  },

  async stop() {
    if (!this.isRunning && !this.child) return;
    if (this.killing) return;
    this.killing = true;

    const pid = this.child?.pid || this.lastPid;
    await new Promise((resolve) => {
      if (!pid) return resolve();
      try {
        killTree(pid, () => resolve());
      } catch (_) {
        resolve();
      }
    });

    if (process.platform === "win32" && pid) {
      await new Promise((resolve) => {
        const cmd = process.env.ComSpec || "cmd.exe";
        const args = ["/c", "taskkill", "/PID", String(pid), "/T", "/F"];
        execFile(cmd, args, { windowsHide: true }, () => resolve());
      });
    }

    this.child = null;
    this.isRunning = false;
    this.waitingForInput = false;
    this.killing = false;
  },

  async abort() {
    await this.stop();
  },

  buildInstallArgs(version, gameDir) {
    const v = (version || "").trim() === "" ? "public" : version.trim();
    return [
      "+login",
      "anonymous",
      "+force_install_dir",
      gameDir,
      "+app_update",
      "294420",
      ...(v !== "public" ? ["-beta", v] : []),
      "validate",
      "+quit",
    ];
  },

  install(version, gameDir, { onData, onError, onClose } = {}, options = {}) {
    const args = this.buildInstallArgs(version, gameDir);
    this.start(
      args,
      onData,
      onError,
      (code) => {
        onClose && onClose(code, { version: version || "public" });
      },
      { autoQuitOnPrompt: true, cwd: options.cwd || process.cwd() }
    );
  },
};

module.exports = steamcmd;
