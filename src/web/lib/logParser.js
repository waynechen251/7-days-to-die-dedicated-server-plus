const reStatus =
  /Time:\s*(?<time>\d+(?:\.\d+)?)m\s+FPS:\s*(?<fps>\d+(?:\.\d+)?)[^\S\r\n]*Heap:\s*(?<heap>\d+(?:\.\d+)?)MB\s+Max:\s*(?<max>\d+(?:\.\d+)?)MB(?:[\s\S]*?Chunks:\s*(?<chunks>\d+))?(?:[\s\S]*?CGO:\s*(?<cgo>\d+))?(?:[\s\S]*?Ply:\s*(?<ply>\d+))?(?:[\s\S]*?Zom:\s*(?<zom>\d+))?(?:[\s\S]*?Ent:\s*(?<ent>\d+)(?:\s*\((?<entSub>\d+)\))?)?(?:[\s\S]*?Items:\s*(?<items>\d+))?(?:[\s\S]*?CO:\s*(?<co>\d+))?(?:[\s\S]*?RSS:\s*(?<rss>\d+(?:\.\d+)?))MB/i;

const reVersion =
  /Version:\s*(?<version>V\s*[\d.]+\s*\(.*?\))\s+Compatibility Version:\s*(?<compat>[^,]+),\s*Build:\s*(?<build>.+)$/;

const reTelnet = /Started Telnet on\s+(?<port>\d+)/;

const reUserData = /UserDataFolder:\s*(?<path>.+)$/i;

function parseServerStatus(line) {
  const m = line.match(reStatus);
  if (!m || !m.groups) return null;
  const time = parseFloat(m.groups.time);
  const fps = parseFloat(m.groups.fps);
  const heap = parseFloat(m.groups.heap);
  const max = parseFloat(m.groups.max);
  const chunks = m.groups.chunks ? parseInt(m.groups.chunks, 10) : null;
  const cgo = m.groups.cgo ? parseInt(m.groups.cgo, 10) : null;
  const ent = m.groups.ent ? parseInt(m.groups.ent, 10) : null;
  const entSub = m.groups.entSub ? parseInt(m.groups.entSub, 10) : null;
  const items = m.groups.items ? parseInt(m.groups.items, 10) : null;
  const co = m.groups.co ? parseInt(m.groups.co, 10) : null;
  const ply = m.groups.ply ? parseInt(m.groups.ply, 10) : null;
  const zom = m.groups.zom ? parseInt(m.groups.zom, 10) : null;
  const rss = m.groups.rss ? parseFloat(m.groups.rss) : null;

  return {
    time,
    fps,

    heap: Number.isFinite(heap) ? heap : undefined,
    max: Number.isFinite(max) ? max : undefined,
    rss: Number.isFinite(rss) ? rss : undefined,

    heapMB: Number.isFinite(heap) ? heap : undefined,
    maxMB: Number.isFinite(max) ? max : undefined,
    rssMB: Number.isFinite(rss) ? rss : undefined,

    chunks,
    cgo,
    ent,
    entSub,
    items,
    co,
    ply,
    zom,
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
