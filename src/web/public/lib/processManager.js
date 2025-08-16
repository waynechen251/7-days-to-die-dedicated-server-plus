const path = require("path");
const { TelnetCtor } = require("./telnet");
const steamcmd = require("./steamcmd");
const gameServer = require("./gameServer");

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
  let fetchedGameVersion = false;
  let lastGameVersion = null;

  async function update() {
    if (updating) return;
    updating = true;
    try {
      await processManager.gameServer.checkTelnet(getConfigFn());

      if (
        processManager.gameServer.isRunning &&
        processManager.gameServer.isTelnetConnected
      ) {
        if (!fetchedGameVersion) {
          try {
            const out = await sendTelnetFn(getConfigFn(), "version");
            const line = out
              .split(/\r?\n/)
              .map((l) => l.trim())
              .find((l) => /^Game version:/i.test(l));
            if (line) {
              let versionText = line.replace(/^Game version:\s*/i, "").trim();
              const m = line.match(
                /^Game version:\s*(.+?)\s+Compatibility Version:/i
              );
              if (m) versionText = m[1].trim();
              else
                versionText = versionText
                  .replace(/\s+Compatibility Version:.*/i, "")
                  .trim();
              lastGameVersion = versionText;
              fetchedGameVersion = true;
            }
          } catch (_) {}
        }
        try {
          const playersOut = await sendTelnetFn(getConfigFn(), "listplayers");
          const playerCount =
            playersOut.match(/Total of (\d+) in the game/)?.[1] || "0";
          processManager.gameServer.onlinePlayers = playerCount;
        } catch (_) {}
      }

      cache = {
        status: {
          steamCmd: { isRunning: processManager.steamCmd.isRunning },
          gameServer: {
            isRunning: processManager.gameServer.isRunning,
            isTelnetConnected: processManager.gameServer.isTelnetConnected,
            pid: processManager.gameServer.getPid(),
            gameVersion: lastGameVersion,
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
      fetchedGameVersion = false;
      lastGameVersion = null;
    },
  };
})();

processManager.status = status;
processManager.initStatus = (opts) => status.init(opts);

module.exports = processManager;
