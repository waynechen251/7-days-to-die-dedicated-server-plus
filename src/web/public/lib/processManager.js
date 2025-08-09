const path = require("path");
const { TelnetCtor } = require("./telnet");
const steamcmd = require("./steamcmd");
const gameServer = require("./gameServer");

async function checkTelnet(config, target = gameServer) {
  const connection = new TelnetCtor();
  const params = {
    host: "localhost",
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
  } catch (err) {
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
    start(args, onData, onError, onClose) {
      steamcmd.start(args, onData, onError, onClose, {
        autoQuitOnPrompt: true,
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
    async killByPid(pid) {
      return await gameServer.killByPid(pid);
    },
    getPid() {
      return gameServer.getPid();
    },
    async checkTelnet(config) {
      await checkTelnet(config, gameServer);
    },
  },
};

module.exports = processManager;
