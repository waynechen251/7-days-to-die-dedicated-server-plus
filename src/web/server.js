const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { format, ts } = require("./public/lib/time");
const { log, error } = require("./public/lib/logger");
const http = require("./public/lib/http");
const { formatBytes } = require("./public/lib/bytes");
const { sendTelnetCommand } = require("./public/lib/telnet");
const processManager = require("./public/lib/processManager");
const archive = require("./public/lib/archive");
const eventBus = require("./public/lib/eventBus");
const { tailFile } = require("./public/lib/tailer");
const logParser = require("./public/lib/logParser");
const serverConfigLib = require("./public/lib/serverConfig");
const steamcmd = require("./public/lib/steamcmd");
const { telnetStart } = require("./public/lib/telnet");

if (process.platform === "win32") exec("chcp 65001 >NUL");

const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();

const serverJsonPath = fs.existsSync(path.join(baseDir, "server.json"))
  ? path.join(baseDir, "server.json")
  : path.join(baseDir, "server.sample.json");

let CONFIG = loadConfig();
const PUBLIC_DIR = path.join(baseDir, "public");
const BACKUP_SAVES_DIR = path.join(PUBLIC_DIR, "saves");
const UPLOADS_DIR = path.join(BACKUP_SAVES_DIR, "_uploads");

function getSavesRoot() {
  const gs = CONFIG?.game_server || {};
  let root = gs.UserDataFolder || gs.saves || "";
  if (!root) return "";
  try {
    const baseName = path.basename(root).toLowerCase();
    if (baseName !== "saves") {
      const candidate = path.join(root, "Saves");
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    }
  } catch (_) {}
  return root;
}

function logPathInfo(reason) {
  try {
    const configured =
      CONFIG?.game_server?.UserDataFolder ||
      CONFIG?.game_server?.saves ||
      "(未設定)";
    const effective = getSavesRoot() || "(未偵測)";
    log(
      `ℹ️ [${reason}] 遊戲存檔目錄(設定值 UserDataFolder/saves): ${configured}`
    );
    if (effective !== configured) {
      log(`ℹ️ [${reason}] 遊戲存檔目錄(實際使用 Saves 根目錄): ${effective}`);
    }
    log(`ℹ️ [${reason}] 備份存放目錄(Backups): ${BACKUP_SAVES_DIR}`);
    eventBus.push("system", {
      text: `[${reason}] Game Saves(Config): ${configured}`,
    });
    if (effective !== configured) {
      eventBus.push("system", {
        text: `[${reason}] Game Saves(Effective): ${effective}`,
      });
    }
    eventBus.push("system", {
      text: `[${reason}] Backups Dir: ${BACKUP_SAVES_DIR}`,
    });
  } catch (_) {}
}
logPathInfo("init");

function resolveDirCaseInsensitive(root, want) {
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const hit = entries.find(
      (e) => e.isDirectory() && e.name.toLowerCase() === want.toLowerCase()
    );
    return path.join(root, hit ? hit.name : want);
  } catch (_) {
    return path.join(root, want);
  }
}

function resolveFileCaseInsensitive(dir, file) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hit = entries.find(
      (e) => e.isFile() && e.name.toLowerCase() === file.toLowerCase()
    );
    return hit ? path.join(dir, hit.name) : path.join(dir, file);
  } catch (_) {
    return path.join(dir, file);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(serverJsonPath, JSON.stringify(CONFIG, null, 2), "utf-8");
    return true;
  } catch (e) {
    error(`❌ 寫入設定檔失敗: ${e.message}`);
    return false;
  }
}

const GAME_DIR = resolveDirCaseInsensitive(baseDir, "7DaysToDieServer");
let stopGameTail = null;
const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
processManager.initStatus({
  getConfig: () => CONFIG.game_server,
  sendTelnetCommand,
});

processManager.registerRoutes(app, {
  eventBus,
  http,
  getStopGameTail: () => stopGameTail,
  clearStopGameTail: () => {
    if (stopGameTail) {
      try {
        stopGameTail();
      } catch (_) {}
    }
    stopGameTail = null;
  },
});
serverConfigLib.registerRoutes(app, {
  http,
  processManager,
  eventBus,
  baseDir,
  GAME_DIR,
  getConfig: () => CONFIG,
  saveConfig,
});

const rawUpload = express.raw({
  type: "application/octet-stream",
  limit: "4096mb",
});

function loadConfig() {
  try {
    const rawData = fs
      .readFileSync(serverJsonPath, "utf-8")
      .replace(/^\uFEFF/, "");
    const config = JSON.parse(rawData);
    log(
      `✅ 成功讀取設定檔 ${serverJsonPath}:\n${JSON.stringify(config, null, 2)}`
    );
    if (!config.web) config.web = {};

    if (
      Object.prototype.hasOwnProperty.call(config.web, "lastInstallVersion")
    ) {
      if (config.web.lastInstallVersion === "") {
        config.web.lastInstallVersion = "public";
        log("ℹ️ 遷移 lastInstallVersion 空字串為 'public'");
        try {
          fs.writeFileSync(
            serverJsonPath,
            JSON.stringify(config, null, 2),
            "utf-8"
          );
        } catch (_) {}
      }
    }

    try {
      if (config.game_server) {
        if (config.game_server.saves && !config.game_server.UserDataFolder) {
          config.game_server.UserDataFolder = config.game_server.saves;
          delete config.game_server.saves;
          log("ℹ️ 遷移 game_server.saves -> game_server.UserDataFolder");
          fs.writeFileSync(
            serverJsonPath,
            JSON.stringify(config, null, 2),
            "utf-8"
          );
        }
      }
    } catch (_) {}
    return config;
  } catch (err) {
    error(`❌ 讀取設定檔失敗: ${serverJsonPath}\n${err.message}`);
    process.exit(1);
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function safeJoin(root, p) {
  const abs = path.resolve(root, p || "");
  if (!abs.startsWith(path.resolve(root))) throw new Error("非法路徑");
  return abs;
}
function sanitizeName(s) {
  return String(s || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 180);
}
function listGameSaves(root) {
  const result = [];
  try {
    const worlds = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    for (const w of worlds) {
      const worldPath = path.join(root, w.name);
      const names = fs
        .readdirSync(worldPath, { withFileTypes: true })
        .filter((d) => d.isDirectory());
      for (const n of names) {
        result.push({
          world: w.name,
          name: n.name,
          path: path.join(worldPath, n.name),
        });
      }
    }
  } catch (_) {}
  return result;
}
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isSymbolicLink()) {
      try {
        const link = fs.readlinkSync(s);
        fs.symlinkSync(link, d);
      } catch {
        fs.copyFileSync(s, d);
      }
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
function detectBackupType(root) {
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((d) => d.name);
    const lower = dirs.map((d) => d.toLowerCase());
    if (lower.includes("saves")) {
      const savesReal = dirs[lower.indexOf("saves")];
      const savesDir = path.join(root, savesReal);
      return { type: "full", savesDir };
    }
    if (dirs.length === 1) {
      const world = dirs[0];
      const worldPath = path.join(root, world);
      try {
        const inner = fs
          .readdirSync(worldPath, { withFileTypes: true })
          .filter((d) => d.isDirectory());
        if (inner.length === 1) {
          return { type: "world", world, name: inner[0].name };
        }
      } catch (_) {}
    }
  } catch (_) {}
  return { type: "unknown" };
}
async function autoPreImportBackup(det) {
  try {
    const savesRoot = getSavesRoot();
    if (!savesRoot || !fs.existsSync(savesRoot))
      return { ok: true, skipped: true, reason: "savesRoot-missing" };
    ensureDir(BACKUP_SAVES_DIR);
    const tsStr = format(new Date(), "YYYYMMDDHHmmss");
    if (det.type === "world" && det.world && det.name) {
      const srcPath = path.join(savesRoot, det.world, det.name);
      if (!fs.existsSync(srcPath))
        return { ok: true, skipped: true, reason: "world-missing" };
      if (fs.readdirSync(srcPath).length === 0)
        return { ok: true, skipped: true, reason: "world-empty" };
      const zipName = `AutoSaves-${det.world}-${det.name}-${tsStr}.zip`;
      const outPath = path.join(BACKUP_SAVES_DIR, zipName);
      await archive.zipSingleWorldGame(savesRoot, det.world, det.name, outPath);
      eventBus.push("backup", { text: `📦 匯入前自動備份: ${zipName}` });
      return { ok: true, zipName };
    } else {
      const hasWorld = fs
        .readdirSync(savesRoot, { withFileTypes: true })
        .some(
          (d) =>
            d.isDirectory() &&
            fs.readdirSync(path.join(savesRoot, d.name)).length > 0
        );
      if (!hasWorld) return { ok: true, skipped: true, reason: "full-empty" };
      const zipName = `AutoSaves-${tsStr}.zip`;
      const outPath = path.join(BACKUP_SAVES_DIR, zipName);
      await archive.zipSavesRoot(savesRoot, outPath);
      eventBus.push("backup", { text: `📦 匯入前自動備份: ${zipName}` });
      return { ok: true, zipName };
    }
  } catch (e) {
    return { ok: false, message: e.message };
  }
}
async function importArchive(zipPath) {
  const savesRoot = getSavesRoot();
  if (!savesRoot || !fs.existsSync(savesRoot))
    return {
      ok: false,
      message: "找不到遊戲存檔根目錄(CONFIG.game_server.UserDataFolder)",
    };
  const det = await archive.inspectZip(zipPath);
  if (!det || det.type === "unknown")
    return {
      ok: false,
      message: "備份檔結構無法辨識 (需為 Saves/... 或 World/GameName)",
    };
  const backupResult = await autoPreImportBackup(det);
  if (!backupResult.ok)
    return { ok: false, message: `自動備份失敗: ${backupResult.message}` };
  try {
    if (det.type === "world") {
      const dstPath = path.join(savesRoot, det.world, det.name || "");
      if (fs.existsSync(dstPath))
        fs.rmSync(dstPath, { recursive: true, force: true });
      ensureDir(savesRoot);
      await archive.unzipArchive(zipPath, savesRoot);
    } else if (det.type === "full") {
      const parent = path.dirname(savesRoot);
      if (fs.existsSync(savesRoot))
        fs.rmSync(savesRoot, { recursive: true, force: true });
      ensureDir(parent);
      await archive.unzipArchive(zipPath, parent);
    }
  } catch (e) {
    return { ok: false, message: `還原失敗: ${e.message}` };
  }
  return {
    ok: true,
    type: det.type,
    world: det.world,
    name: det.name,
    backup: backupResult.zipName || null,
  };
}
app.get("/api/stream", eventBus.sseHandler);

app.get("/api/get-config", (req, res) => {
  return http.respondJson(res, { ok: true, data: CONFIG }, 200);
});

function tryBindOnce(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    let finished = false;
    const done = (inUse) => {
      if (finished) return;
      finished = true;
      try {
        srv.close();
      } catch (_) {}
      resolve({ host, inUse });
    };
    srv.once("error", (err) => {
      if (err && (err.code === "EADDRINUSE" || err.code === "EACCES")) {
        done(true);
      } else {
        done(false);
      }
    });
    srv.once("listening", () => {
      srv.close(() => done(false));
    });
    try {
      srv.listen({ port, host });
    } catch (_) {
      done(true);
    }
  });
}

async function checkPortInUse(port) {
  const hosts = ["127.0.0.1"];
  const results = await Promise.all(hosts.map((h) => tryBindOnce(port, h)));
  return results.some((r) => r.inUse);
}
let dummyGamePortServer = null;
let dummyGamePort = null;
async function ensureDummyGamePort(wantedPortOverride) {
  try {
    if (processManager.gameServer.isRunning) {
      if (dummyGamePortServer) closeDummyGamePort("game-running");
      return { listening: false, started: false };
    }

    let wantedPort = Number.isFinite(parseInt(wantedPortOverride, 10))
      ? parseInt(wantedPortOverride, 10)
      : NaN;

    if (!Number.isFinite(wantedPort)) {
      const pRaw =
        CONFIG?.game_server?.ServerPort ||
        CONFIG?.game_server?.serverPort ||
        CONFIG?.game_server?.serverport;
      wantedPort = parseInt(pRaw, 10);
    }

    if (!Number.isFinite(wantedPort) || wantedPort <= 0 || wantedPort > 65535) {
      if (dummyGamePortServer) closeDummyGamePort("invalid-port");
      return { listening: false, started: false };
    }

    if (dummyGamePortServer && dummyGamePort !== wantedPort) {
      closeDummyGamePort(`port-changed ${dummyGamePort}→${wantedPort}`);
    }

    if (dummyGamePortServer) {
      return { listening: true, started: false };
    }

    if (await checkPortInUse(wantedPort)) {
      return { listening: false, started: false };
    }

    await new Promise((resolve, reject) => {
      const srv = require("net").createServer((socket) => {
        socket.destroy();
      });
      srv.once("error", (e) => reject(e));
      srv.listen(wantedPort, "0.0.0.0", () => {
        dummyGamePortServer = srv;
        dummyGamePort = wantedPort;
        log(
          `ℹ️ 已啟動假的 ServerPort 監聽 (dummy) 於 ${wantedPort} (等待實際伺服器啟動)`
        );
        eventBus.push("system", {
          text: `啟動暫時 ServerPort 測試監聽 (dummy) 於 ${wantedPort}`,
        });
        resolve();
      });
    });

    return { listening: true, started: true };
  } catch (e) {
    error(`❌ 啟動/切換 dummy ServerPort 失敗: ${e.message}`);
    return { listening: false, started: false, error: e.message };
  }
}
function closeDummyGamePort(reason = "start") {
  if (dummyGamePortServer) {
    try {
      const p = dummyGamePort;
      dummyGamePortServer.close(() => {
        log(`ℹ️ 已關閉 dummy ServerPort 監聽 (${p}) 原因: ${reason}`);
      });
      eventBus.push("system", {
        text: `關閉暫時 ServerPort 測試監聽 (${dummyGamePort}) (${reason})`,
      });
    } catch (_) {}
    dummyGamePortServer = null;
    dummyGamePort = null;
  }
}
process.on("exit", () => closeDummyGamePort("process-exit"));
process.on("SIGINT", () => {
  closeDummyGamePort("sigint");
  process.exit(0);
});

app.get("/api/check-port", async (req, res) => {
  const p = parseInt(req.query?.port, 10);
  if (!Number.isFinite(p) || p <= 0 || p > 65535) {
    return http.respondJson(res, { ok: false, message: "port 無效" }, 400);
  }
  try {
    const inUse = await checkPortInUse(p);
    return http.respondJson(res, { ok: true, data: { inUse } }, 200);
  } catch (err) {
    return http.respondJson(
      res,
      { ok: false, message: err?.message || "檢查失敗" },
      500
    );
  }
});

app.post("/api/close-dummy-port", (req, res) => {
  try {
    if (dummyGamePortServer) {
      closeDummyGamePort("ui-close");
    }
    return http.respondJson(res, { ok: true }, 200);
  } catch (e) {
    return http.respondJson(
      res,
      { ok: false, message: e?.message || "關閉失敗" },
      500
    );
  }
});

app.get("/api/saves/list", (req, res) => {
  try {
    const savesRoot = getSavesRoot();
    const saves =
      savesRoot && fs.existsSync(savesRoot) ? listGameSaves(savesRoot) : [];
    ensureDir(BACKUP_SAVES_DIR);
    const files = fs
      .readdirSync(BACKUP_SAVES_DIR, { withFileTypes: true })
      .filter((f) => f.isFile() && /\.zip$/i.test(f.name))
      .map((f) => {
        const p = path.join(BACKUP_SAVES_DIR, f.name);
        const st = fs.statSync(p);
        return { file: f.name, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return http.respondJson(
      res,
      { ok: true, data: { saves, backups: files } },
      200
    );
  } catch (err) {
    return http.respondJson(res, { ok: false, message: err.message }, 500);
  }
});
app.post("/api/view-saves", (req, res) => {
  ensureDir(BACKUP_SAVES_DIR);
  fs.readdir(BACKUP_SAVES_DIR, (err, files) => {
    if (err) return http.sendErr(req, res, `❌ 讀取存檔失敗:\n${err}`);
    const saves = files.filter((file) => file.endsWith(".zip"));
    if (saves.length === 0)
      return http.sendErr(req, res, "❌ 沒有找到任何存檔");

    const details = saves.map((file) => {
      const filePath = path.join(BACKUP_SAVES_DIR, file);
      const stats = fs.statSync(filePath);
      return `${file} (${formatBytes(stats.size)}, ${ts(stats.mtime)})`;
    });

    http.sendOk(req, res, `✅ 找到以下存檔:\n${details.join("\n")}`);
  });
});
app.post("/api/saves/export-one", async (req, res) => {
  try {
    const savesRoot = getSavesRoot();
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.UserDataFolder)"
      );
    }
    const world = sanitizeName(req.body?.world);
    const name = sanitizeName(req.body?.name);
    if (!world || !name)
      return http.sendErr(req, res, "❌ 需提供 world 與 name");
    if (!fs.existsSync(path.join(savesRoot, world, name)))
      return http.sendErr(req, res, "❌ 指定世界/存檔不存在");
    ensureDir(BACKUP_SAVES_DIR);
    const tsStr = format(new Date(), "YYYYMMDDHHmmss");
    const zipName = `Saves-${world}-${name}-${tsStr}.zip`;
    const outPath = path.join(BACKUP_SAVES_DIR, zipName);
    await archive.zipSingleWorldGame(savesRoot, world, name, outPath);
    const line = `✅ 匯出完成: ${zipName}`;
    log(line);
    eventBus.push("backup", { text: line });
    return http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 匯出失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    return http.sendErr(req, res, msg);
  }
});
app.post("/api/saves/export-all", async (req, res) => {
  try {
    const savesRoot = getSavesRoot();
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.UserDataFolder)"
      );
    }
    ensureDir(BACKUP_SAVES_DIR);
    const tsStr = format(new Date(), "YYYYMMDDHHmmss");
    const zipName = `Saves-All-${tsStr}.zip`;
    const outPath = path.join(BACKUP_SAVES_DIR, zipName);
    await archive.zipSavesRoot(savesRoot, outPath);
    const line = `✅ 完整備份完成: ${zipName}`;
    log(line);
    eventBus.push("backup", { text: line });
    return http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 備份失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    return http.sendErr(req, res, `${msg}`);
  }
});
async function performPreImportBackup() {
  try {
    const src = getSavesRoot();
    if (!src || !fs.existsSync(src))
      return { ok: false, message: "找不到存檔資料夾" };
    ensureDir(BACKUP_SAVES_DIR);
    const timestamp = format(new Date(), "YYYYMMDDHHmmss");
    const zipName = `Saves-${timestamp}.zip`;
    const outPath = path.join(BACKUP_SAVES_DIR, zipName);
    await archive.zipSavesRoot(src, outPath);
    return { ok: true, zipName };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}
function isGameNameDir(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isDirectory()) return false;
    if (fs.existsSync(path.join(p, "gamestate.dat"))) return true;
    if (fs.existsSync(path.join(p, "GameState.dat"))) return true;
    if (fs.existsSync(path.join(p, "region"))) return true;
    return false;
  } catch (_) {
    return false;
  }
}
function collectStructure(root) {
  const map = new Map();
  const worlds = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const w of worlds) {
    const wPath = path.join(root, w);
    const names = fs
      .readdirSync(wPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => isGameNameDir(path.join(wPath, n)));
    if (names.length) map.set(w, names);
  }
  return map;
}
app.post("/api/saves/import-one", async (req, res) => {
  try {
    const savesRoot = getSavesRoot();
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.UserDataFolder)"
      );
    }
    const world = sanitizeName(req.body?.world);
    const name = sanitizeName(req.body?.name);
    if (!world || !name)
      return http.sendErr(req, res, "❌ 需提供 world 與 name");

    const src = path.join(savesRoot, world, name);
    if (!fs.existsSync(src))
      return http.sendErr(req, res, `❌ 存檔不存在: ${world}/${name}`);

    ensureDir(BACKUP_SAVES_DIR);
    const timestamp = format(new Date(), "YYYYMMDDHHmmss");
    const zipName = `Saves-${world}-${name}-${timestamp}.zip`;
    const outPath = path.join(BACKUP_SAVES_DIR, zipName);

    await archive.zipSingleWorldGame(savesRoot, world, name, outPath);

    const line = `✅ 匯出完成: ${zipName}`;
    log(line);
    eventBus.push("backup", { text: line });
    return http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 匯出失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    return http.sendErr(req, res, msg);
  }
});
app.post("/api/saves/import-backup", async (req, res) => {
  try {
    const file = req.body?.file;
    if (!file) return http.sendErr(req, res, "❌ 需提供 file");
    const zipPath = safeJoin(BACKUP_SAVES_DIR, file);
    if (!fs.existsSync(zipPath))
      return http.sendErr(req, res, "❌ 指定備份不存在");
    const result = await importArchive(zipPath);
    if (!result.ok) {
      const msg = `❌ 匯入失敗: ${result.message}`;
      error(msg);
      eventBus.push("backup", { level: "error", text: msg });
      return http.sendErr(req, res, msg);
    }
    const line = `✅ 匯入完成: ${path.basename(zipPath)} (type=${result.type}${
      result.type === "world"
        ? `, world=${result.world}, name=${result.name}`
        : ""
    }) 已建立備份 ${result.backup}`;
    log(line);
    eventBus.push("backup", { text: line });
    return http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 匯入失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    return http.sendErr(req, res, msg);
  }
});
app.post("/api/saves/import-upload", rawUpload, async (req, res) => {
  try {
    const buf = req.body;
    if (!buf || !buf.length) return http.sendErr(req, res, "❌ 未收到檔案");
    const savesRoot = getSavesRoot();
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.UserDataFolder)"
      );
    }
    ensureDir(UPLOADS_DIR);
    const filename =
      sanitizeName(req.query?.filename) ||
      `Upload-${format(new Date(), "YYYYMMDDHHmmss")}.zip`;
    const uploadPath = safeJoin(UPLOADS_DIR, filename);
    fs.writeFileSync(uploadPath, buf);
    const result = await importArchive(uploadPath);
    if (!result.ok) {
      const msg = `❌ 匯入失敗(上傳): ${result.message}`;
      error(msg);
      eventBus.push("backup", { level: "error", text: msg });
      return http.sendErr(req, res, msg);
    }
    const line = `✅ 匯入完成(上傳): ${path.basename(uploadPath)} (type=${
      result.type
    }${
      result.type === "world"
        ? `, world=${result.world}, name=${result.name}`
        : ""
    }) 已建立備份 ${result.backup}`;
    log(line);
    eventBus.push("backup", { text: line });
    return http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 匯入失敗(上傳): ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    return http.sendErr(req, res, msg);
  }
});
app.post("/api/backup", async (req, res) => {
  try {
    const savesRoot = getSavesRoot();
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      const msg = `❌ 備份失敗: 找不到存檔資料夾(${savesRoot || "未設定"})`;
      error(msg);
      return http.sendErr(req, res, msg);
    }
    ensureDir(BACKUP_SAVES_DIR);
    const tsStr = format(new Date(), "YYYYMMDDHHmmss");
    const zipName = `Saves-${tsStr}.zip`;
    const outPath = path.join(BACKUP_SAVES_DIR, zipName);
    await archive.zipSavesRoot(savesRoot, outPath);
    const line = `✅ 備份完成: ${zipName}`;
    log(line);
    eventBus.push("backup", { text: line });
    http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 備份失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    http.sendErr(req, res, `${msg}`);
  }
});
app.post("/api/install", (req, res) => {
  try {
    const rawVersion = (req.body?.version ?? "").trim();
    const version = rawVersion === "" ? "public" : rawVersion;
    CONFIG.web.lastInstallVersion = version;
    saveConfig();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    eventBus.push("steamcmd", {
      text: `start install/update (${version})`,
    });

    const baseDirLocal = baseDir;
    const gameDirLocal = GAME_DIR;
    steamcmd.install(
      version,
      gameDirLocal,
      {
        onData: (data) => {
          http.writeStamped(res, `[stdout] ${data}`);
          eventBus.push("steamcmd", { level: "stdout", text: data });
        },
        onError: (err) => {
          http.writeStamped(res, `[stderr] ${err}`);
          eventBus.push("steamcmd", { level: "stderr", text: err });
        },
        onClose: (code) => {
          const line = `✅ 安裝 / 更新結束，Exit Code: ${code}`;
          try {
            if (!CONFIG.web) CONFIG.web = {};
            CONFIG.web.game_serverInit = "true";
            saveConfig();
            eventBus.push("system", {
              text: "已設定 game_serverInit=true (首次開啟編輯器時提示載入保存設定)",
            });
          } catch (e) {
            eventBus.push("system", {
              level: "warn",
              text: `設定 game_serverInit 失敗: ${e.message}`,
            });
          }
          http.writeStamped(res, line);
          res.end();
          eventBus.push("steamcmd", { text: line });
        },
      },
      { cwd: baseDirLocal }
    );
  } catch (err) {
    const msg = `❌ 無法啟動 steamcmd: ${err.message}`;
    error(msg);
    http.writeStamped(res, msg);
    res.end();
    eventBus.push("steamcmd", { level: "error", text: msg });
  }
});

app.post("/api/install-abort", async (req, res) => {
  try {
    if (!processManager.steamCmd.isRunning) {
      return http.respondJson(
        res,
        { ok: true, message: "steamcmd 未在執行" },
        200
      );
    }
    await processManager.steamCmd.abort();
    return http.respondJson(res, { ok: true, message: "steamcmd 已中斷" }, 200);
  } catch (e) {
    return http.respondJson(
      res,
      { ok: false, message: e.message || "中斷失敗" },
      500
    );
  }
});

app.post("/api/start", async (req, res) => {
  if (processManager.gameServer.isRunning) {
    return http.sendOk(req, res, "❌ 伺服器已經在運行中，請先關閉伺服器再試。");
  }
  closeDummyGamePort("game-start");
  try {
    processManager.status.resetVersion();
    const exeName = fs.existsSync(path.join(GAME_DIR, "7DaysToDieServer.exe"))
      ? "7DaysToDieServer.exe"
      : "7DaysToDie.exe";

    const exePath = path.join(GAME_DIR, exeName);
    if (!fs.existsSync(exePath)) {
      const msg = `❌ 找不到執行檔: ${exePath}\n請先執行安裝 / 更新，或確認路徑為 {app}\\7daystodieserver\\7DaysToDieServer.exe`;
      error(msg);
      return http.sendErr(req, res, msg);
    }

    const logPrefix =
      exeName === "7DaysToDieServer.exe" ? "output_log_dedi" : "output_log";
    const logFileName = `${logPrefix}__${format(
      new Date(),
      "YYYY-MM-DD__HH-mm-ss"
    )}.txt`;
    const logsDir = path.join(GAME_DIR, "logs");
    const logFilePath = path.join(logsDir, logFileName);

    ensureDir(logsDir);
    try {
      if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, "");
    } catch (_) {}

    fs.writeFileSync(path.join(GAME_DIR, "steam_appid.txt"), "251570");
    process.env.SteamAppId = "251570";
    process.env.SteamGameId = "251570";

    const { configPath: configArg } = serverConfigLib.loadAndSyncServerConfig({
      CONFIG,
      baseDir,
      GAME_DIR,
      eventBus,
      saveConfig,
    });

    const nographics = req.body?.nographics ?? true;
    const args = [
      "-logfile",
      logFilePath,
      "-batchmode",
      ...(nographics ? ["-nographics"] : []),
      ...(configArg ? [`-configfile=${configArg}`] : []),
      "-dedicated",
      CONFIG.game_server.TelnetPort,
      CONFIG.game_server.TelnetPassword,
    ];

    processManager.gameServer.start(args, GAME_DIR, {
      exeName,
      onExit: (code, signal) => {
        eventBus.push("system", {
          text: `遊戲進程結束 (code=${code}, signal=${signal || "-"})`,
        });
        processManager.status.resetVersion();
      },
      onError: (err) => {
        eventBus.push("system", {
          level: "error",
          text: `遊戲進程錯誤: ${err?.message || err}`,
        });
      },
    });

    if (stopGameTail) {
      try {
        stopGameTail();
      } catch (_) {}
    }
    stopGameTail = tailFile(logFilePath, (line) => {
      eventBus.push("game", { level: "stdout", text: line });
      const logData = logParser.detectAndParse(line);
      if (logData == null) return;
      switch (logData.kind) {
        case "status":
          processManager.gameServer.onlinePlayers = logData.data.ply;
          break;
        case "version":
          processManager.gameServer.gameVersion = logData.data.version;
          break;
        case "telnetStarted":
          telnetStart({
            TelnetPort: CONFIG.game_server.TelnetPort,
            TelnetPassword: CONFIG.game_server.TelnetPassword
          })
          break;
        case "userDataFolder":
          const detected = logData.data.path.trim().replace(/\//g, "\\");
          try {
            if (!CONFIG.game_server) CONFIG.game_server = {};
            const newRoot = `${detected}`;
            const prev = getSavesRoot();
            if (prev !== newRoot) {
              CONFIG.game_server.UserDataFolder = newRoot;
              if (CONFIG.game_server.saves) delete CONFIG.game_server.saves;
              saveConfig();
              eventBus.push("system", {
                text: `自動偵測七日殺伺服器存檔目錄: ${newRoot}`,
              });
              logPathInfo("detect");
            }
          } catch (_) {}
          break;
      }
    });

    const line = `✅ 伺服器已啟動，日誌: ${logFileName}`;
    log(line);
    eventBus.push("system", { text: line });
    return http.sendOk(req, res, line);
  } catch (err) {
    const msg = `❌ 伺服器啟動失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("system", { level: "error", text: msg });
    return http.sendErr(req, res, `❌ 啟動伺服器失敗:\n${err.message}`);
  }
});

app.post("/api/stop", async (req, res) => {
  try {
    const result = await sendTelnetCommand("shutdown");
    if (stopGameTail)
      try {
        stopGameTail();
      } catch (_) {}
    stopGameTail = null;
    const line = `✅ 關閉伺服器指令已發送`;
    log(`${line}: ${result}`);
    eventBus.push("system", { text: line });
    http.sendOk(req, res, `${line}:\n${result}`);
  } catch (err) {
    const msg = `❌ 關閉伺服器失敗: ${err.message}`;
    error(msg);
    eventBus.push("system", { level: "error", text: msg });
    http.sendErr(req, res, `${msg}`);
  }
});

app.post("/api/telnet", async (req, res) => {
  const command = req.body?.command ?? "";
  if (!command)
    return http.respondText(res, "❌ 請提供 Telnet 指令", 400, true);

  try {
    const result = await sendTelnetCommand(command);
    eventBus.push("telnet", {
      level: "stdout",
      text: `> ${command}\n${result}`,
    });
    http.sendOk(req, res, `✅ 結果:\n${result}`);
  } catch (err) {
    const msg = `❌ Telnet 連線失敗: ${err.message}`;
    eventBus.push("telnet", { level: "stderr", text: msg });
    http.sendErr(req, res, `${msg}`);
  }
});

app.post("/api/view-config", (req, res) => {
  try {
    const config = CONFIG;
    http.sendOk(
      req,
      res,
      `✅ 讀取管理後台設定成功:\n${JSON.stringify(config, null, 2)}`
    );
  } catch (err) {
    http.sendErr(req, res, `❌ 讀取管理後台設定失敗:\n${err.message}`);
  }
});

app.post("/api/server-status", async (req, res) => {
  try {
    await sendTelnetCommand("version");
    return http.respondJson(res, { ok: true, status: "online" }, 200);
  } catch (err) {
    return http.respondJson(
      res,
      { ok: false, status: "telnet-fail", message: err.message },
      200
    );
  }
});

app.post("/api/saves/delete", async (req, res) => {
  try {
    if (processManager.gameServer.isRunning) {
      return http.sendErr(req, res, "❌ 伺服器運行中，禁止刪除存檔");
    }
    const savesRoot = getSavesRoot();
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.UserDataFolder)"
      );
    }
    const world = sanitizeName(req.body?.world);
    const name = sanitizeName(req.body?.name);
    if (!world || !name)
      return http.sendErr(req, res, "❌ 需提供 world 與 name");
    const targetDir = path.join(savesRoot, world, name);
    if (!fs.existsSync(targetDir) || !fs.lstatSync(targetDir).isDirectory()) {
      return http.sendErr(req, res, "❌ 指定存檔不存在");
    }

    ensureDir(BACKUP_SAVES_DIR);
    const tsStr = format(new Date(), "YYYYMMDDHHmmss");
    const backupZip = `DelSaves-${world}-${name}-${tsStr}.zip`;
    const backupPath = path.join(BACKUP_SAVES_DIR, backupZip);

    try {
      await archive.zipSingleWorldGame(savesRoot, world, name, backupPath);
    } catch (e) {
      return http.sendErr(req, res, `❌ 刪除前備份失敗: ${e?.message || e}`);
    }

    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (e) {
      return http.sendErr(
        req,
        res,
        `❌ 刪除失敗(仍保留備份 ${backupZip}): ${e?.message || e}`
      );
    }

    const line = `🗑️ 已刪除存檔: ${world}/${name} (已建立備份 ${backupZip})`;
    log(line);
    eventBus.push("backup", { text: line });
    return http.sendOk(req, res, `✅ ${line}`);
  } catch (err) {
    const msg = `❌ 刪除失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    return http.sendErr(req, res, msg);
  }
});
app.post("/api/saves/delete-backup", (req, res) => {
  try {
    const file = String(req.body?.file || "").trim();
    if (!file) return http.sendErr(req, res, "❌ 需提供檔名");
    if (!/^[\w.-]+\.zip$/i.test(file))
      return http.sendErr(req, res, "❌ 檔名不合法");
    const target = path.join(BACKUP_SAVES_DIR, file);
    if (!target.startsWith(path.resolve(BACKUP_SAVES_DIR)))
      return http.sendErr(req, res, "❌ 非法路徑");
    if (!fs.existsSync(target))
      return http.sendErr(req, res, "❌ 指定備份不存在");

    fs.unlinkSync(target);

    const line = `🗑️ 已刪除備份檔: ${file}`;
    log(line);
    eventBus.push("backup", { text: line });
    return http.sendOk(req, res, `✅ ${line}`);
  } catch (err) {
    const msg = `❌ 刪除備份失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("backup", { level: "error", text: msg });
    return http.sendErr(req, res, msg);
  }
});

app.listen(CONFIG.web.port, () => {
  log(`✅ 控制面板已啟動於 http://127.0.0.1:${CONFIG.web.port}`);
  eventBus.push("system", {
    text: `控制面板啟動於 http://127.0.0.1:${CONFIG.web.port}`,
  });
  logPathInfo("listen");
});

app.post("/api/clear-game-server-init", (req, res) => {
  try {
    if (!CONFIG.web) CONFIG.web = {};
    if (CONFIG.web.game_serverInit) {
      CONFIG.web.game_serverInit = "false";
      saveConfig();
      eventBus.push("system", { text: "已清除 game_serverInit 旗標" });
    }
    return http.sendOk(req, res, "✅ game_serverInit 已清除");
  } catch (e) {
    return http.sendErr(req, res, `❌ 清除失敗: ${e.message}`);
  }
});
app.get("/api/public-ip", async (req, res) => {
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`ip service ${r.status}`);
    const j = await r.json();
    const ip = j.ip;
    if (!ip) throw new Error("no ip");
    return http.respondJson(res, { ok: true, data: { ip } }, 200);
  } catch (e) {
    return http.respondJson(
      res,
      { ok: false, message: e.message || "取得公網 IP 失敗" },
      500
    );
  }
});

app.get("/api/check-port-forward", async (req, res) => {
  try {
    const ip = String(req.query.ip || "").trim();
    const port = parseInt(req.query.port, 10);
    const protocol = (req.query.protocol || "tcp").toString().toLowerCase();
    if (!ip)
      return http.respondJson(res, { ok: false, message: "缺少 ip" }, 400);
    if (!Number.isFinite(port) || port <= 0 || port > 65535)
      return http.respondJson(res, { ok: false, message: "port 無效" }, 400);
    if (!/^(tcp|udp)$/.test(protocol))
      return http.respondJson(
        res,
        { ok: false, message: "protocol 無效" },
        400
      );

    const dummyState = await ensureDummyGamePort(port);

    let open = false;
    let raw = null;

    const url = `https://portchecker.io/api/${encodeURIComponent(
      ip
    )}/${port}?protocol=${protocol}`;
    try {
      const r = await fetch(url, {
        headers: { Accept: "text/plain, application/json;q=0.9, */*;q=0.8" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`portchecker.io ${r.status}`);

      const ct = (r.headers.get("content-type") || "").toLowerCase();
      let bodyText = await r.text();
      let parsed = null;

      if (/application\/json/.test(ct) || bodyText.trim().startsWith("{")) {
        try {
          parsed = JSON.parse(bodyText);
        } catch (_) {}
      }
      raw = parsed ?? bodyText;

      if (parsed) {
        if (
          parsed.status === "open" ||
          parsed.open === true ||
          parsed.result === "open" ||
          parsed.port_open === true ||
          parsed.online === true ||
          parsed === true
        ) {
          open = true;
        }
      } else {
        const s = String(bodyText).trim().toLowerCase();
        if (s === "true" || s === "open" || s === "online") open = true;
      }

      log(
        `[PortForwardCheck] url=${url} ct=${ct || "-"} result=${JSON.stringify(
          raw
        )}`
      );
    } catch (e) {
      error(`[PortForwardCheck] fetch error: ${e.message}`);
      return http.respondJson(
        res,
        {
          ok: true,
          data: {
            ip,
            port,
            protocol,
            open: false,
            dummyListening: dummyState.listening,
            dummyJustStarted: dummyState.started,
            error: e.message,
          },
        },
        200
      );
    }

    return http.respondJson(
      res,
      {
        ok: true,
        data: {
          ip,
          port,
          protocol,
          open,
          raw,
          dummyListening: dummyState.listening,
          dummyJustStarted: dummyState.started,
        },
      },
      200
    );
  } catch (e) {
    return http.respondJson(
      res,
      { ok: false, message: e.message || "檢查失敗" },
      500
    );
  }
});
