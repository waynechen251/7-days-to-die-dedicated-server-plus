const steamcmd = require("./steamcmd");
const gameServer = require("./gameServer");
const { log, error } = require("./logger");

const processManager = {
  steamCmd: {
    get isRunning() {
      return steamcmd.isRunning;
    },
    get waitingForInput() {
      return steamcmd.waitingForInput;
    },
    start(args, onData, onError, onClose) {
      steamcmd.start(args, onData, onError, onClose, {
        autoQuitOnPrompt: true,
      });
    },
    async abort() {
      await steamcmd.abort();
    },
    async stop() {
      await steamcmd.stop();
    },
    async killByPid(pid) {
      await steamcmd.killByPid(pid);
    },
  },
  gameServer: {
    gameVersion: null,
    onlinePlayers: null,
    get isRunning() {
      return gameServer.isRunning;
    },
    get isTelnetConnected() {
      return gameServer.isTelnetConnected;
    },
    start(args, baseDir, options) {
      gameServer.start(args, baseDir, options);
    },
    killTree() {
      gameServer.killTree();
    },
    async killByPid(pid) {
      return await gameServer.killByPid(pid);
    },
    getPid() {
      return gameServer.getPid();
    },
    async checkTelnet(config) {
      return await gameServer.checkTelnet(config);
    },
  },
};

const status = (function () {
  let cache = {
    status: {
      steamCmd: { isRunning: false },
      gameServer: {
        isRunning: false,
        isTelnetConnected: false,
        pid: null,
        gameVersion: null,
        onlinePlayers: "",
      },
    },
    lastUpdated: 0,
  };
  let updating = false;
  let intervalId = null;
  let getConfigFn = null;
  let sendTelnetFn = null;

  async function update() {
    if (updating) return;
    updating = true;
    try {
      await processManager.gameServer.checkTelnet(getConfigFn());

      cache = {
        status: {
          steamCmd: { isRunning: processManager.steamCmd.isRunning },
          gameServer: {
            isRunning: processManager.gameServer.isRunning,
            isTelnetConnected: processManager.gameServer.isTelnetConnected,
            pid: processManager.gameServer.getPid(),
            gameVersion: processManager.gameServer.gameVersion || "",
            onlinePlayers: processManager.gameServer.onlinePlayers || "",
          },
        },
        lastUpdated: Date.now(),
      };
    } finally {
      updating = false;
    }
  }

  return {
    init({ getConfig, sendTelnetCommand, interval = 2000 }) {
      getConfigFn = getConfig;
      sendTelnetFn = sendTelnetCommand;
      if (intervalId) clearInterval(intervalId);
      update().catch(() => {});
      intervalId = setInterval(() => update().catch(() => {}), interval);
    },
    get() {
      return { ...cache, updating };
    },
    async refresh() {
      await update();
      return this.get();
    },
    resetVersion() {
      processManager.gameServer.gameVersion = null;
      processManager.gameServer.onlinePlayers = null;
    },
  };
})();

processManager.status = status;
processManager.initStatus = (opts) => status.init(opts);

processManager.registerRoutes = function registerRoutes(
  app,
  { eventBus, http, getStopGameTail, clearStopGameTail } = {}
) {
  if (!app || !eventBus || !http) {
    throw new Error("registerRoutes 需要 app, eventBus, http");
  }

  app.get("/api/processManager/status", async (req, res) => {
    if (req.query?.refresh === "1") {
      processManager.status.refresh().catch(() => {});
    }
    const ps = processManager.status.get();
    return http.respondJson(
      res,
      {
        ok: true,
        data: ps.status,
        lastUpdated: ps.lastUpdated,
        updating: ps.updating,
      },
      200
    );
  });

  app.post("/api/processManager/game_server/kill", async (req, res) => {
    try {
      const pidFromBody = req.body?.pid;
      const targetPid = pidFromBody ?? processManager.gameServer.getPid();
      if (!targetPid) {
        const warn = "⚠️ 無可用 PID，可用狀態已重置";
        log(warn);
        eventBus.push("system", { text: warn });
        return http.sendOk(req, res, `✅ ${warn}`);
      }

      eventBus.push("system", {
        text: `🗡️ 送出強制結束請求 pid=${targetPid}`,
      });

      const ok = await processManager.gameServer.killByPid(targetPid);

      try {
        if (getStopGameTail && clearStopGameTail) {
          const tail = getStopGameTail();
          if (tail) {
            try {
              tail();
            } catch (_) {}
          }
          clearStopGameTail();
        }
      } catch (_) {}

      if (ok) {
        processManager.status.resetVersion();
        const line = `⚠️ 已強制結束遊戲進程 pid=${targetPid}`;
        log(line);
        eventBus.push("system", { text: line });
        return http.sendOk(req, res, `✅ ${line}`);
      } else {
        const line = `❌ 強制結束失敗 pid=${targetPid}(可能為權限不足或進程不存在)`;
        error(line);
        eventBus.push("system", { level: "error", text: line });
        return http.sendErr(req, res, line);
      }
    } catch (err) {
      const msg = `❌ 強制結束失敗: ${err?.message || err}`;
      error(msg);
      eventBus.push("system", { level: "error", text: msg });
      return http.sendErr(req, res, msg);
    }
  });
};

module.exports = processManager;
