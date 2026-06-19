const fs = require("fs");
const path = require("path");
const { resolveVersionProfile } = require("./versionProfile");
const { getCachedCatalog } = require("./versionCatalog");

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

function ensureSandboxOnlyItems(items) {
  const existing = Array.isArray(items)
    ? items.find((item) => item.name === "SandboxCode")
    : null;
  if (existing) return [existing];
  return [
    {
      name: "SandboxCode",
      value: "",
      commented: false,
      comment: "7DTD v3.0+ sandbox settings code",
    },
  ];
}

function filterItemsForProfile(items, profile) {
  if (profile?.profile === "v3") {
    return ensureSandboxOnlyItems(items);
  }
  return Array.isArray(items) ? items : [];
}

function extractSandboxCodeUpdate(updates) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(updates, "SandboxCode")) {
    return null;
  }
  return String(updates.SandboxCode ?? "");
}

function escapeXmlAttr(value) {
  return String(value ?? "").replace(/"/g, "&quot;");
}

function upsertPropertyValue(filePath, name, value) {
  const original = fs.readFileSync(filePath, "utf-8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const nameEsc = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const safeValue = escapeXmlAttr(value);
  const activeRe = new RegExp(
    `(<property\\s+[^>]*name="${nameEsc}"[^>]*value=")([^"]*)(")([^>]*\\/>)`,
    "i"
  );
  const commentedRe = new RegExp(
    `<!--\\s*(<property\\s+[^>]*name="${nameEsc}"[^>]*value=")([^"]*)(")([^>]*\\/>)\\s*-->`,
    "i"
  );

  let next = original;
  let changed = false;
  let inserted = false;

  if (activeRe.test(next)) {
    next = next.replace(activeRe, (_m, p1, _old, p3, p4) => {
      changed = true;
      return `${p1}${safeValue}${p3}${p4}`;
    });
  } else if (commentedRe.test(next)) {
    next = next.replace(commentedRe, (_m, p1, _old, p3, p4) => {
      changed = true;
      return `${p1}${safeValue}${p3}${p4}`;
    });
  } else {
    const lines = next.split(/\r?\n/);
    const insertLine = `  <property name="${name}" value="${safeValue}" />`;
    let insertAt = lines.findIndex((line) => /^\s*<\/[^>]+>\s*$/.test(line));
    if (insertAt === -1) insertAt = lines.length;
    lines.splice(insertAt, 0, insertLine);
    next = lines.join(eol);
    changed = true;
    inserted = true;
  }

  if (changed && next !== original) {
    fs.writeFileSync(filePath, next, "utf-8");
  }

  return { changed, inserted };
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
    gameServerProfiles,
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

  function resolveVersionCtx(version, items) {
    return resolveVersionProfile({
      version,
      items,
      catalog: getCachedCatalog(),
    });
  }

  function resolveProfileBackedItems(version, currentItems, profileId) {
    const CONFIG = getConfig();
    const root = gameServerProfiles.ensureProfilesRoot(CONFIG);
    const versionCtx = resolveVersionCtx(version, currentItems);
    let editableItems = filterItemsForProfile(currentItems, versionCtx);

    const before = root.profiles.length;
    const ensured = gameServerProfiles.ensureDefaultProfile({
      CONFIG,
      versionCtx,
      catalog: getCachedCatalog(),
      items: editableItems,
    });
    if (root.profiles.length !== before) saveConfig();

    const selectedProfile = profileId
      ? gameServerProfiles.getProfileById(root, profileId)
      : gameServerProfiles.resolveInitialProfile(root, versionCtx.buildId) || ensured;
    if (
      selectedProfile &&
      String(selectedProfile.buildId || "") === String(versionCtx.buildId || "")
    ) {
      editableItems = gameServerProfiles.applySnapshotToItems(
        editableItems,
        {
          values: selectedProfile.values,
          commented: selectedProfile.commented,
        }
      );
    }
    const activeProfile = gameServerProfiles.resolveActiveProfile(root, versionCtx.buildId);
    const lastStartedProfile = gameServerProfiles.getLastStartedProfile(
      root,
      versionCtx.buildId
    );

    return {
      root,
      versionCtx,
      editableItems,
      selectedProfile:
        selectedProfile &&
        String(selectedProfile.buildId || "") === String(versionCtx.buildId || "")
          ? selectedProfile
          : null,
      activeProfile:
        activeProfile &&
        String(activeProfile.buildId || "") === String(versionCtx.buildId || "")
          ? activeProfile
          : null,
      lastStartedProfile:
        lastStartedProfile &&
        String(lastStartedProfile.buildId || "") === String(versionCtx.buildId || "")
          ? lastStartedProfile
          : null,
    };
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
      const {
        root,
        versionCtx,
        editableItems,
        selectedProfile,
        activeProfile,
        lastStartedProfile,
      } = resolveProfileBackedItems(req.query?.version, items, req.query?.profileId);
      const worlds = listWorldTemplates ? listWorldTemplates() : [];
      return http.respondJson(
        res,
        {
          ok: true,
          data: {
            path: cfgPath,
            items: editableItems,
            worlds,
            profile: versionCtx,
            activeProfileId: selectedProfile?.id || activeProfile?.id || null,
            selectedProfileId: selectedProfile?.id || null,
            lastStartedProfileId: lastStartedProfile?.id || null,
            profiles: gameServerProfiles.getProfilesByBuildId(root, versionCtx.buildId),
          },
        },
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

      const currentItems = readValues(cfgPath).items || [];
      const { root, versionCtx, editableItems, activeProfile } =
        resolveProfileBackedItems(req.body?.version, currentItems, req.body?.profileId);
      const requestedBuildId =
        req.body?.buildId == null ? null : String(req.body.buildId);
      if (
        requestedBuildId &&
        String(versionCtx.buildId || "") !== requestedBuildId
      ) {
        return http.respondJson(
          res,
          { ok: false, message: "版本 BuildID 與目前上下文不一致" },
          409
        );
      }
      if (req.body?.mode && req.body.mode !== versionCtx.profile) {
        return http.respondJson(
          res,
          { ok: false, message: "設定模式與目前版本上下文不一致" },
          409
        );
      }
      if (
        req.body?.profileId &&
        (!activeProfile || activeProfile.id !== req.body.profileId)
      ) {
        return http.respondJson(
          res,
          { ok: false, message: "找不到目前版本可用的設定集" },
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

      if (versionCtx.profile === "v3") {
        const sandboxCode = extractSandboxCodeUpdate(updates);
        if (sandboxCode == null) {
          return http.respondJson(
            res,
            { ok: false, message: "v3.0+ 模式只接受 SandboxCode 寫入" },
            400
          );
        }

        upsertPropertyValue(cfgPath, "SandboxCode", sandboxCode);
        const { items } = readValues(cfgPath);

        try {
          const CONFIG = getConfig();
          const { synced, removed } = syncGameServerFromItems(items, CONFIG);
          if (synced > 0 || removed > 0) {
            saveConfig();
            eventBus.push("system", {
              text: `已同步 SandboxCode 至 server.json (${synced}項變更, 修正大小寫${removed}項)`,
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
          {
            ok: true,
            data: {
              path: cfgPath,
              changed: ["SandboxCode"],
              toggled: [],
              items: ensureSandboxOnlyItems(items),
              profile: versionCtx,
            },
          },
          200
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
        {
          ok: true,
          data: {
            path: cfgPath,
            changed,
            toggled,
            items,
            profile: versionCtx,
            activeProfileId: activeProfile?.id || null,
          },
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
}

module.exports = {
  readValues,
  writeValues,
  upsertPropertyValue,
  ensureSandboxOnlyItems,
  filterItemsForProfile,
  extractSandboxCodeUpdate,
  registerRoutes,
  resolveServerConfigPath,
  syncGameServerFromItems,
  loadAndSyncServerConfig,
};
