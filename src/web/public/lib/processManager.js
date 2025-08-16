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

module.exports = processManager;
