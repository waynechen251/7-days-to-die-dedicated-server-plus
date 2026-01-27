const fs = require("fs");
const path = require("path");

function stripQuotes(s) {
  return typeof s === "string" ? s.trim().replace(/^"(.*)"$/, "$1") : s;
}

function syncGameServerFromItems(items, CONFIG) {
  if (!CONFIG.game_server) CONFIG.game_server = {};
  const gs = CONFIG.game_server;
  let synced = 0;
  let removed = 0;
  const existingKeys = Object.keys(gs);

  items.forEach(({ name, value }) => {
    const lower = name.toLowerCase();
    existingKeys.forEach((k) => {
      if (k !== name && k.toLowerCase() === lower) {
        delete gs[k];
        removed++;
      }
    });
    if (gs[name] !== value) {
      gs[name] = value;
      synced++;
    }
  });

  return { synced, removed };
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

function resolveServerConfigPath({ CONFIG, baseDir, GAME_DIR }) {
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

function loadAndSyncServerConfig({
  CONFIG,
  baseDir,
  GAME_DIR,
  eventBus,
  saveConfig,
}) {
  let configPath = null;
  try {
    configPath = resolveServerConfigPath({ CONFIG, baseDir, GAME_DIR });
    if (!configPath) {
      eventBus.push("system", {
        text: "未找到 serverconfig.xml，將以預設設定啟動",
      });
      return { configPath: null };
    }
    const { items } = readValues(configPath);
    const { synced, removed } = syncGameServerFromItems(items, CONFIG);

    try {
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
        CONFIG.game_server.TelnetEnabled = tEnabled.toString();
      if (tPort) CONFIG.game_server.TelnetPort = tPort.toString();
      if (tPwd) CONFIG.game_server.TelnetPassword = tPwd;
      if (sPort) CONFIG.game_server.ServerPort = sPort.toString();
    } catch (e) {
      eventBus.push("system", {
        level: "warn",
        text: `讀取 telnet/port 設定失敗: ${e?.message || e}`,
      });
    }

    if (synced > 0 || removed > 0) saveConfig();
    eventBus.push("system", {
      text: `已同步並讀取 serverconfig.xml 屬性 (${items.length}) (更新${synced}項, 修正大小寫${removed}項)`,
    });
  } catch (e) {
    eventBus.push("system", {
      level: "warn",
      text: `讀取 serverconfig.xml 失敗: ${e?.message || e}`,
    });
  }
  return { configPath };
}

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
  }
) {
  if (!app || !http) throw new Error("registerRoutes 需要 app 與 http");
  if (!getConfig)
    throw new Error("registerRoutes 需要 getConfig() 取得 CONFIG 物件");

  function _resolveServerConfigPath() {
    return resolveServerConfigPath({
      CONFIG: getConfig(),
      baseDir,
      GAME_DIR,
    });
  }

  app.get("/api/serverconfig", (req, res) => {
    try {
      const cfgPath = _resolveServerConfigPath();
      if (!cfgPath) {
        return http.respondJson(
          res,
          { ok: false, message: "找不到 serverconfig.xml" },
          404
        );
      }
      const { items } = readValues(cfgPath);
      const worlds = listWorldTemplates ? initStatus() : [];
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
      if (processManager.gameServer.isRunning) {
        return http.respondJson(
          res,
          { ok: false, message: "伺服器運行中，禁止修改" },
          409
        );
      }
      const cfgPath = _resolveServerConfigPath();
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
        const CONFIG = getConfig();
        const { synced, removed } = syncGameServerFromItems(items, CONFIG);
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

module.exports = {
  readValues,
  writeValues,
  registerRoutes,
  resolveServerConfigPath,
  syncGameServerFromItems,
  loadAndSyncServerConfig,
};
