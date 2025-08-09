const { TelnetCtor } = require("./telnet");
const steamcmd = require("./steamcmd");
const gameServer = require("./gameServer");

async function checkTelnet(config, target = gameServer) {
  const connection = new TelnetCtor();
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
    target.isTelnetConnected = true;
  } catch (_) {
    target.isTelnetConnected = false;
  } finally {
    await connection.end().catch(() => {});
  }
}

const processManager = {
  steamCmd: {
    get isRunning() {
      return steamcmd.isRunning;
    },
    get waitingForInput() {
      return steamcmd.waitingForInput;
    },
    start(args, onData, onError, onClose, options) {
      steamcmd.start(args, onData, onError, onClose, {
        autoQuitOnPrompt: true,
        ...options,
      });
    },
    abort() {
      steamcmd.abort();
    },
    stop() {
      steamcmd.stop();
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
    async checkTelnet(config) {
      await checkTelnet(config, gameServer);
    },
  },
};

module.exports = processManager;
