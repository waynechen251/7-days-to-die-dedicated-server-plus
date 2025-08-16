const fs = require("fs");
const path = require("path");

function readValues(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/);
  const map = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.includes("<property")) continue;
    const m = line.match(/<property\s+([^>]*?)\/>/i);
    if (!m) continue;

    const idxProp = line.indexOf("<property");
    const idxCmtStart = line.indexOf("<!--");
    const isCommented =
      idxCmtStart !== -1 && idxCmtStart < idxProp && line.includes("-->");

    const attrStr = m[1];

    const nameM = attrStr.match(/name\s*=\s*"([^"]*)"/i);
    const valueM = attrStr.match(/value\s*=\s*"([^"]*)"/i);
    if (!nameM) continue;
    const name = nameM[1];
    const value = valueM ? valueM[1] : "";

    let comment = "";
    const after = rawLine.split(/\/>/)[1] || "";
    const inlineDocMatch = after.match(/<!--(.*?)-->/);
    if (inlineDocMatch) comment = inlineDocMatch[1].trim();

    const existing = map.get(name);
    if (!existing) {
      map.set(name, { name, value, commented: isCommented, comment });
    } else {
      if (existing.commented && !isCommented) {
        map.set(name, {
          name,
          value,
          commented: false,
          comment: comment || existing.comment,
        });
      }
    }
  }

  return {
    items: Array.from(map.values()),
  };
}

function writeValues(filePath, updates) {
  let txt = fs.readFileSync(filePath, "utf-8");
  let changed = [];
  function escReg(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  }
  for (const [name, value] of Object.entries(updates || {})) {
    const nameEsc = escReg(name);
    const re = new RegExp(
      `(<property\\s+[^>]*name="${nameEsc}"[^>]*value=")([^"]*)(")([^>]*\\/>)`,
      "i"
    );
    if (re.test(txt)) {
      txt = txt.replace(re, (_m, p1, _old, p3, p4) => {
        return `${p1}${value}${p3}${p4}`;
      });
      changed.push(name);
    }
  }
  if (changed.length) {
    fs.writeFileSync(filePath, txt, "utf-8");
  }
  return { changed };
}

function registerRoutes(
  app,
  {
    http,
    processManager,
    eventBus,
    baseDir,
    GAME_DIR,
    getConfig,
    saveConfig,
    listWorldTemplates,
    syncGameServerFromItems,
  }
) {
  if (!app || !http) throw new Error("registerRoutes 需要 app 與 http");
  if (!getConfig)
    throw new Error("registerRoutes 需要 getConfig() 取得 CONFIG 物件");

  function resolveFileCaseInsensitive(dir, file) {
    try {
      const entries = require("fs").readdirSync(dir, { withFileTypes: true });
      const hit = entries.find(
        (e) => e.isFile() && e.name.toLowerCase() === file.toLowerCase()
      );
      return hit ? path.join(dir, hit.name) : path.join(dir, file);
    } catch (_) {
      return path.join(dir, file);
    }
  }

  function resolveServerConfigPath() {
    const CONFIG = getConfig();
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
      if (c && require("fs").existsSync(c)) return c;
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
      const { items } = readValues(cfgPath);
      const worlds = listWorldTemplates ? listWorldTemplates() : [];
      return http.respondJson(
        res,
        { ok: true, data: { path: cfgPath, items, worlds } },
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
      const CONFIG = getConfig();
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

      const fs = require("fs");
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
                const newVal = Object.prototype.hasOwnProperty.call(
                  updates,
                  name
                )
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
        if (toggled.length) fs.writeFileSync(cfgPath, txt, "utf-8");
      }

      let changed = [];
      if (hasUpdates) {
        const result = writeValues(cfgPath, updates);
        changed = result.changed || [];
      }

      const { items } = readValues(cfgPath);

      try {
        const { synced, removed } = syncGameServerFromItems(items);
        if (synced > 0 || removed > 0) {
          saveConfig();
          eventBus.push("system", {
            text: `已同步 serverconfig.xml 至 server.json (${synced}項變更, 修正大小寫${removed}項)`,
          });
        }
      } catch (e) {
        eventBus.push("system", {
          level: "warn",
          text: `同步 server.json 失敗: ${e?.message || e}`,
        });
      }

      return http.respondJson(
        res,
        { ok: true, data: { path: cfgPath, changed, toggled, items } },
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
}

module.exports = { readValues, writeValues, registerRoutes };
