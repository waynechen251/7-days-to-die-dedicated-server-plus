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
const serverConfigLib = require("./public/lib/serverConfig");

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

function logPathInfo(reason) {
  try {
    const savesPath = CONFIG?.game_server?.saves || "(未設定)";
    log(`ℹ️ [${reason}] 遊戲存檔目錄(Game Saves): ${savesPath}`);
    log(`ℹ️ [${reason}] 備份存放目錄(Backups): ${BACKUP_SAVES_DIR}`);
    eventBus.push("system", { text: `[${reason}] Game Saves: ${savesPath}` });
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
    const savesRoot = CONFIG?.game_server?.saves;
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
  const savesRoot = CONFIG?.game_server?.saves;
  if (!savesRoot || !fs.existsSync(savesRoot))
    return {
      ok: false,
      message: "找不到遊戲存檔根目錄(CONFIG.game_server.saves)",
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

app.get("/api/process-status", async (req, res) => {
  try {
    await processManager.gameServer.checkTelnet(CONFIG.game_server);
    const status = {
      steamCmd: { isRunning: processManager.steamCmd.isRunning },
      gameServer: {
        isRunning: processManager.gameServer.isRunning,
        isTelnetConnected: processManager.gameServer.isTelnetConnected,
        pid: processManager.gameServer.getPid(),
      },
    };
    return http.respondJson(res, { ok: true, data: status }, 200);
  } catch (err) {
    error(`❌ 無法查詢進程狀態: ${err?.message || err}`);
    return http.respondJson(
      res,
      { ok: false, message: "無法查詢進程狀態" },
      500
    );
  }
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
  const hosts = ["0.0.0.0", "127.0.0.1", "::", "::1"];
  const results = await Promise.all(hosts.map((h) => tryBindOnce(port, h)));
  return results.some((r) => r.inUse);
}

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
app.get("/api/saves/list", (req, res) => {
  try {
    const savesRoot = CONFIG?.game_server?.saves;
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
    const savesRoot = CONFIG?.game_server?.saves;
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.saves)"
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
    const savesRoot = CONFIG?.game_server?.saves;
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.saves)"
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
    const src = CONFIG?.game_server?.saves;
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
    const savesRoot = CONFIG?.game_server?.saves;
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.saves)"
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
    const savesRoot = CONFIG?.game_server?.saves;
    if (!savesRoot || !fs.existsSync(savesRoot)) {
      return http.sendErr(
        req,
        res,
        "❌ 找不到遊戲存檔根目錄(CONFIG.game_server.saves)"
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
    const savesRoot = CONFIG?.game_server?.saves;
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

    const args = [
      "+login",
      "anonymous",
      "+force_install_dir",
      GAME_DIR,
      "+app_update",
      "294420",
      ...(version !== "public" ? ["-beta", version] : []),
      "validate",
      "+quit",
    ];

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    eventBus.push("steamcmd", {
      text: `start install/update (${version || "public"})`,
    });

    processManager.steamCmd.start(
      args,
      (data) => {
        http.writeStamped(res, `[stdout] ${data}`);
        eventBus.push("steamcmd", { level: "stdout", text: data });
      },
      (err) => {
        http.writeStamped(res, `[stderr] ${err}`);
        eventBus.push("steamcmd", { level: "stderr", text: err });
      },
      (code) => {
        const line = `✅ 安裝 / 更新結束，Exit Code: ${code}`;
        http.writeStamped(res, line);
        res.end();
        eventBus.push("steamcmd", { text: line });
      },
      { autoQuitOnPrompt: true, cwd: baseDir }
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
  try {
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

    const stripQuotes = (s) =>
      typeof s === "string" ? s.trim().replace(/^"(.*)"$/, "$1") : s;

    const cfgRaw = stripQuotes(CONFIG?.game_server?.serverConfig);
    const cfgCandidates = [];
    if (cfgRaw) {
      if (path.isAbsolute(cfgRaw)) {
        cfgCandidates.push(cfgRaw);
      } else {
        cfgCandidates.push(path.join(GAME_DIR, cfgRaw));
        cfgCandidates.push(path.join(baseDir, cfgRaw));
      }
    }
    cfgCandidates.push(
      resolveFileCaseInsensitive(GAME_DIR, "serverconfig.xml")
    );
    cfgCandidates.push(resolveFileCaseInsensitive(baseDir, "serverconfig.xml"));

    let configArg = null;
    for (const c of cfgCandidates) {
      if (c && fs.existsSync(c)) {
        configArg = c;
        break;
      }
    }
    if (!configArg) {
      eventBus.push("system", {
        text: "未找到 serverconfig.xml，將以預設設定啟動",
      });
    }

    try {
      if (!CONFIG.game_server) CONFIG.game_server = {};
      if (configArg) {
        const { items } = serverConfigLib.readValues(configArg);
        const get = (n) =>
          String(items.find((x) => x.name === n)?.value ?? "").trim();
        const asBool = (s) => /^(true|1)$/i.test(String(s || ""));
        const asInt = (s) => {
          const n = parseInt(String(s || ""), 10);
          return Number.isFinite(n) ? n : undefined;
        };

        const tEnabled = asBool(get("TelnetEnabled"));
        const tPort = asInt(get("TelnetPort"));
        const tPwd = get("TelnetPassword");
        const sPort = asInt(get("ServerPort"));

        if (typeof tEnabled === "boolean")
          CONFIG.game_server.telnetEnabled = tEnabled;
        if (tPort) CONFIG.game_server.telnetPort = tPort;
        if (tPwd) CONFIG.game_server.telnetPassword = tPwd;
        if (sPort) CONFIG.game_server.serverPort = sPort;

        eventBus.push("system", {
          text: `已讀取 telnet/port 設定: TelnetEnabled=${tEnabled}, TelnetPort=${tPort}, ServerPort=${sPort}`,
        });
      }
    } catch (e) {
      eventBus.push("system", {
        level: "warn",
        text: `讀取 telnet/port 設定失敗: ${e?.message || e}`,
      });
    }

    const nographics = req.body?.nographics ?? true;
    const args = [
      "-logfile",
      logFilePath,
      "-batchmode",
      ...(nographics ? ["-nographics"] : []),
      ...(configArg ? [`-configfile=${configArg}`] : []),
      "-dedicated",
    ];

    processManager.gameServer.start(args, GAME_DIR, {
      exeName,
      onExit: (code, signal) => {
        eventBus.push("system", {
          text: `遊戲進程結束 (code=${code}, signal=${signal || "-"})`,
        });
      },
      onError: (err) => {
        eventBus.push("system", {
          level: "error",
          text: `遊戲進程錯誤: ${err?.message || err}`,
        });
      },
    });

    if (stopGameTail)
      try {
        stopGameTail();
      } catch (_) {}
    stopGameTail = tailFile(logFilePath, (line) => {
      eventBus.push("game", { level: "stdout", text: line });

      const m = line.match(/UserDataFolder:\s*(.+)$/i);
      if (m && m[1]) {
        const detected = m[1].trim().replace(/\//g, "\\");
        try {
          if (!CONFIG.game_server) CONFIG.game_server = {};
          const newSaves = `${detected}\\Saves`;
          if (CONFIG.game_server.saves !== newSaves) {
            CONFIG.game_server.saves = newSaves;
            saveConfig();
            eventBus.push("system", {
              text: `自動偵測存檔目錄: ${newSaves}`,
            });
            logPathInfo("detect");
          }
        } catch (_) {}
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
    const result = await sendTelnetCommand(CONFIG.game_server, "shutdown");
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

app.post("/api/kill", async (req, res) => {
  try {
    const pidFromBody = req.body?.pid;
    const targetPid = pidFromBody ?? processManager.gameServer.getPid();

    if (!targetPid) {
      const warn = "⚠️ 無可用 PID，可用狀態已重置";
      log(warn);
      eventBus.push("system", { text: warn });
      return http.sendOk(req, res, `✅ ${warn}`);
    }

    eventBus.push("system", { text: `🗡️ 送出強制結束請求 pid=${targetPid}` });
    const ok = await processManager.gameServer.killByPid(targetPid);

    if (stopGameTail)
      try {
        stopGameTail();
      } catch (_) {}
    stopGameTail = null;

    if (ok) {
      const line = `⚠️ 已強制結束遊戲進程 pid=${targetPid}`;
      log(line);
      eventBus.push("system", { text: line });
      return http.sendOk(req, res, `✅ ${line}`);
    } else {
      const line = `❌ 強制結束失敗 pid=${targetPid}(可能為權限不足或進程不存在)`;
      error(line);
      eventBus.push("system", { level: "error", text: line });
      return http.sendErr(req, res, line);
    }
  } catch (err) {
    const msg = `❌ 強制結束失敗: ${err?.message || err}`;
    error(msg);
    eventBus.push("system", { level: "error", text: msg });
    http.sendErr(req, res, msg);
  }
});

app.post("/api/telnet", async (req, res) => {
  const command = req.body?.command ?? "";
  if (!command)
    return http.respondText(res, "❌ 請提供 Telnet 指令", 400, true);

  try {
    const result = await sendTelnetCommand(CONFIG.game_server, command);
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
    await sendTelnetCommand(CONFIG.game_server, "version");
    return http.respondJson(res, { ok: true, status: "online" }, 200);
  } catch (err) {
    return http.respondJson(
      res,
      { ok: false, status: "telnet-fail", message: err.message },
      200
    );
  }
});

function resolveServerConfigPath() {
  const stripQuotes = (s) =>
    typeof s === "string" ? s.trim().replace(/^"(.*)"$/, "$1") : s;

  const cfgRaw = stripQuotes(CONFIG?.game_server?.serverConfig);
  const candidates = [];

  if (cfgRaw) {
    if (path.isAbsolute(cfgRaw)) candidates.push(cfgRaw);
    else {
      candidates.push(path.join(GAME_DIR, cfgRaw));
      candidates.push(path.join(baseDir, cfgRaw));
    }
  }
  candidates.push(resolveFileCaseInsensitive(GAME_DIR, "serverconfig.xml"));
  candidates.push(resolveFileCaseInsensitive(baseDir, "serverconfig.xml"));

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

app.get("/api/serverconfig", (req, res) => {
  try {
    const cfgPath = resolveServerConfigPath();
    if (!cfgPath) {
      return http.respondJson(
        res,
        { ok: false, message: "找不到 serverconfig.xml" },
        404
      );
    }
    const { items } = serverConfigLib.readValues(cfgPath);
    return http.respondJson(
      res,
      { ok: true, data: { path: cfgPath, items } },
      200
    );
  } catch (e) {
    return http.respondJson(
      res,
      { ok: false, message: e.message || "讀取失敗" },
      500
    );
  }
});
app.post("/api/serverconfig", (req, res) => {
  try {
    if (processManager.gameServer.isRunning) {
      return http.respondJson(
        res,
        { ok: false, message: "伺服器運行中，禁止修改" },
        409
      );
    }
    const cfgPath = resolveServerConfigPath();
    if (!cfgPath) {
      return http.respondJson(
        res,
        { ok: false, message: "找不到 serverconfig.xml" },
        404
      );
    }

    const updates = req.body?.updates || {};
    const toggles = req.body?.toggles || {};
    const hasUpdates =
      updates && typeof updates === "object" && !Array.isArray(updates)
        ? Object.keys(updates).length > 0
        : false;
    const hasToggles =
      toggles && typeof toggles === "object" && !Array.isArray(toggles)
        ? Object.keys(toggles).length > 0
        : false;

    if (!hasUpdates && !hasToggles) {
      return http.respondJson(
        res,
        { ok: false, message: "缺少 updates 或 toggles" },
        400
      );
    }

    let txt = fs.readFileSync(cfgPath, "utf-8");
    const toggled = [];

    function escReg(s) {
      return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    }

    if (hasToggles) {
      for (const [name, enable] of Object.entries(toggles)) {
        const nameEsc = escReg(name);
        const reCommented = new RegExp(
          `<!--\\s*<property\\s+name="${nameEsc}"\\s+value="([^"]*)"\\s*/>\\s*-->`,
          "i"
        );
        const reActive = new RegExp(
          `<property\\s+name="${nameEsc}"\\s+value="([^"]*)"\\s*/>`,
          "i"
        );

        if (enable) {
          if (reCommented.test(txt)) {
            txt = txt.replace(reCommented, (_m, val) => {
              const newVal = Object.prototype.hasOwnProperty.call(updates, name)
                ? updates[name]
                : val;
              return `<property name="${name}" value="${newVal}" />`;
            });
            toggled.push(`${name}:enable`);
          }
        } else {
          if (reActive.test(txt)) {
            txt = txt.replace(reActive, (_m, val) => {
              return `<!-- <property name="${name}" value="${val}" /> -->`;
            });
            toggled.push(`${name}:disable`);
          }
        }
      }

      if (toggled.length) {
        fs.writeFileSync(cfgPath, txt, "utf-8");
      }
    }

    let changed = [];
    if (hasUpdates) {
      const result = serverConfigLib.writeValues(cfgPath, updates);
      changed = result.changed || [];
      txt = fs.readFileSync(cfgPath, "utf-8");
    }

    if (changed.length || toggled.length) {
      eventBus.push("system", {
        text: `serverconfig.xml 已更新: ${[
          changed.length ? `值(${changed.join(",")})` : null,
          toggled.length ? `狀態(${toggled.join(",")})` : null,
        ]
          .filter(Boolean)
          .join(" ")}`,
      });
    }

    const { items } = serverConfigLib.readValues(cfgPath);
    return http.respondJson(
      res,
      {
        ok: true,
        data: { path: cfgPath, changed, toggled, items },
      },
      200
    );
  } catch (err) {
    return http.respondJson(
      res,
      { ok: false, message: err.message || "寫入失敗" },
      500
    );
  }
});

app.listen(CONFIG.web.port, () => {
  log(`✅ 控制面板已啟動於 http://localhost:${CONFIG.web.port}`);
  eventBus.push("system", {
    text: `控制面板啟動於 http://localhost:${CONFIG.web.port}`,
  });
  logPathInfo("listen");
});
