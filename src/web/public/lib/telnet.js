const TelnetPkg = require("telnet-client");

function getTelnetCtor(pkg) {
  if (typeof pkg === "function") return pkg;
  if (pkg && typeof pkg.Telnet === "function") return pkg.Telnet;
  if (pkg && typeof pkg.default === "function") return pkg.default;
  throw new Error("telnet-client export not recognized");
}

const TelnetCtor = getTelnetCtor(TelnetPkg);

async function sendTelnetCommand(config, command) {
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
    const result = await connection.send(command, { waitfor: ">" });
    await connection.end();
    return result.trim();
  } catch (err) {
    await connection.end().catch(() => {});
    throw new Error(
      `連線或指令執行失敗: ${err.message}\n執行的命令: ${command}`
    );
  }
}

module.exports = { sendTelnetCommand, TelnetCtor };
