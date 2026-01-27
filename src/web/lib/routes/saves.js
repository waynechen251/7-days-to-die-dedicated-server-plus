const path = require("path");
const fs = require("fs");
const express = require("express");
const { format } = require("../time");

const rawUpload = express.raw({
  type: "application/octet-stream",
  limit: "4096mb",
});

function sanitizeName(s) {
  return String(s || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 180);
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeJoin(root, p) {
  const abs = path.resolve(root, p || "");
  if (!abs.startsWith(path.resolve(root))) throw new Error("非法路徑");
  return abs;
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

module.exports = function registerSavesRoutes(app, ctx) {
  const {
    http,
    eventBus,
    archive,
    processManager,
    getSavesRoot,
    BACKUP_SAVES_DIR,
    UPLOADS_DIR,
    log,
    error,
  } = ctx;

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
};
