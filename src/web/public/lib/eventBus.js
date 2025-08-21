const { EventEmitter } = require("events");

const TOPICS = ["system", "steamcmd", "game", "telnet", "backup"];
const MAX_PER_TOPIC = 1000;

const bus = new EventEmitter();
bus.setMaxListeners(64);

const buffers = Object.fromEntries(TOPICS.map((t) => [t, []]));

function push(topic, payload) {
  const t = TOPICS.includes(topic) ? topic : "system";
  const evt = {
    ts: new Date().toISOString(),
    topic: t,
    level: "info",
    ...payload,
  };
  const buf = buffers[t];
  buf.push(evt);
  if (buf.length > MAX_PER_TOPIC) buf.shift();
  bus.emit("evt", evt);
}

function getSince(sinceISO, topics = TOPICS) {
  const since = sinceISO ? Date.parse(sinceISO) : 0;
  const wanted = topics.filter((t) => TOPICS.includes(t));
  const events = [];
  for (const t of wanted) {
    for (const e of buffers[t]) {
      if (!since || Date.parse(e.ts) > since) events.push(e);
    }
  }
  events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return events;
}

function sseHandler(req, res) {
  const topics = (req.query.topics || "").split(",").filter(Boolean);
  const wanted = topics.length ? topics : TOPICS;
  const replay = Math.min(Number(req.query.replay || 200), 1000);
  const initial = getSince(null, wanted).slice(-replay);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  initial.forEach(send);

  const ping = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 20000);
  const onEvt = (e) => {
    if (wanted.includes(e.topic)) send(e);
  };

  bus.on("evt", onEvt);
  req.on("close", () => {
    clearInterval(ping);
    bus.off("evt", onEvt);
  });
}

function parseServerStatus(line) {
  const re =
    /Time:\s*(?<time>\d+(?:\.\d+)?)m\s+FPS:\s*(?<fps>\d+(?:\.\d+)?)\s+.*?\bPly:\s*(?<ply>\d+)\s+.*?RSS:\s*(?<rss>\d+(?:\.\d+)?)MB/;

  const m = line.match(re);
  if (!m || !m.groups) return null;

  return {
    time: parseFloat(m.groups.time),
    fps: parseFloat(m.groups.fps),
    ply: parseInt(m.groups.ply, 10),
    rss: parseFloat(m.groups.rss),
  };
}

function parseServerVersionInfo(line) {
  const re = /Version:\s*(?<version>V\s*[\d.]+\s*\(.*?\))\s+Compatibility Version:\s*(?<compat>[^,]+),\s*Build:\s*(?<build>.+)$/;
  const m = line.match(re);
  if (!m || !m.groups) return null;

  return {
    version: m.groups.version.trim(),      // 只取主 Version
    compatibility: m.groups.compat.trim(), // 可選: 相容版本
    build: m.groups.build.trim(),          // 可選: Build 資訊
  };
}

function isTelnetStarted(line) {
  return line.includes("Started Telnet on");
}

module.exports = { bus, push, getSince, sseHandler, TOPICS, parseServerStatus, parseServerVersionInfo, isTelnetStarted };
