const reStatus =
  /Time:\s*(?<time>\d+(?:\.\d+)?)m\s+FPS:\s*(?<fps>\d+(?:\.\d+)?)\s+.*?\bPly:\s*(?<ply>\d+)\s+.*?RSS:\s*(?<rss>\d+(?:\.\d+)?)MB/;

const reVersion =
  /Version:\s*(?<version>V\s*[\d.]+\s*\(.*?\))\s+Compatibility Version:\s*(?<compat>[^,]+),\s*Build:\s*(?<build>.+)$/;

const reTelnet = /Started Telnet on\s+(?<port>\d+)/;

const reUserData = /UserDataFolder:\s*(?<path>.+)$/i;

function parseServerStatus(line) {
  const m = line.match(reStatus);
  if (!m || !m.groups) return null;
  return {
    time: parseFloat(m.groups.time),
    fps: parseFloat(m.groups.fps),
    ply: parseInt(m.groups.ply, 10),
    rss: parseFloat(m.groups.rss),
  };
}

function parseVersionInfo(line) {
  let m = line.match(reVersion);
  if (!m || !m.groups) return null;
  return {
    version: m.groups.version.trim(),
    compatibility: m.groups.compat.trim(),
    build: m.groups.build.trim(),
  };
}

function parseTelnetStarted(line) {
  const m = line.match(reTelnet);
  if (!m || !m.groups) return null;
  return {
    port: parseInt(m.groups.port, 10),
  };
}

function parseUserDataFolder(line) {
  const m = line.match(reUserData);
  if (!m || !m.groups) return null;
  return {
    path: m.groups.path.trim(),
  };
}

function detectAndParse(line) {
  const s = parseServerStatus(line);
  if (s) return { kind: "status", data: s };

  const v = parseVersionInfo(line);
  if (v) return { kind: "version", data: v };

  const t = parseTelnetStarted(line);
  if (t) return { kind: "telnetStarted", data: t };

  const u = parseUserDataFolder(line);
  if (u) return { kind: "userDataFolder", data: u };

  return null;
}

module.exports = { detectAndParse };
