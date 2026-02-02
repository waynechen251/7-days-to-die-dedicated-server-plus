const TelnetPkg = require("telnet-client");

function getTelnetCtor(pkg) {
  if (typeof pkg === "function") return pkg;
  if (pkg && typeof pkg.Telnet === "function") return pkg.Telnet;
  if (pkg && typeof pkg.default === "function") return pkg.default;
  throw new Error("telnet-client export not recognized");
}

const TelnetCtor = getTelnetCtor(TelnetPkg);

let telnetConfig = null;
let connection = null;
let isAlive = false;
let reconnectToken = -1;

async function telnetStart(config) {
  telnetConfig = config;
  const params = {
    host: "127.0.0.1",
    port: telnetConfig.TelnetPort,
    shellPrompt: "Logon successful",
    timeout: 0,
    negotiationMandatory: false,
    ors: "\r\n",
    irs: "\r\n",
    password: "" + telnetConfig.TelnetPassword,
    passwordPrompt: "Please enter password:",
  };
  if (connection != null) {
    connection.end();
  }
  connection = new TelnetCtor();
  connection.on("connect", () => {
    console.log("Telnet session connect!");
    isAlive = true;
    connection.socket.setKeepAlive(true, 5000);
  });
  connection.on("ready", () => {
    console.log("Telnet session ready!");
    isAlive = true;
  });

  connection.on("timeout", () => {
    console.log("Telnet timeout!");
    isAlive = false;
    _telnetReconnect();
  });

  connection.on("error", (err) => {
    console.log("Telnet error!", err);
    isAlive = false;
    _telnetReconnect();
  });

  connection.on("close", () => {
    console.log("Telnet connection closed!");
    isAlive = false;
  });
  try {
    clearTimeout(reconnectToken);
    reconnectToken = -1;
    await connection.connect(params);
  } catch (err) {
    console.error(`❌ Telnet 連線嘗試失敗: ${err.message}`);
    isAlive = false;
    if (connection != null) {
      connection.end().catch(() => {});
    }
  }
}

async function telnetEnd() {
  isAlive = false;
  clearTimeout(reconnectToken);
  reconnectToken = -1;
  if (connection != null) {
    await connection.end();
    connection = null;
  }
  console.log("telnet連線中斷");
}

async function sendTelnetCommand(command) {
  try {
    const result = await connection.send(command, { waitfor: ">" });
    return result.trim();
  } catch (err) {
    await connection.end().catch(() => {});
    throw new Error(
      `連線或指令執行失敗: ${err.message}\n執行的命令: ${command}`
    );
  }
}

function checkTelnetAlive() {
  return isAlive;
}

function _telnetReconnect() {
  console.log("telnet準備重新連線");
  if (connection != null) {
    connection.end();
  }
  connection = null;
  clearTimeout(reconnectToken);
  reconnectToken = setTimeout(() => {
    console.log("telnet開始重新連線");
    telnetStart(telnetConfig);
  }, 10000);
}

module.exports = {
  telnetStart,
  telnetEnd,
  checkTelnetAlive,
  sendTelnetCommand,
};
