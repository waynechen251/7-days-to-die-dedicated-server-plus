const { canonicalVersion } = require("../versionProfile");
const { getCachedCatalog } = require("../versionCatalog");

module.exports = function registerLocalizationRoutes(app, ctx) {
  const {
    http,
    eventBus,
    getConfig,
    saveConfig,
    GAME_DIR,
    localizationProfiles,
    localization,
    appVersion,
  } = ctx;

  function ensureLocalizationMeta(CONFIG) {
    if (!CONFIG.localization_meta || typeof CONFIG.localization_meta !== "object") {
      CONFIG.localization_meta = {
        lastGeneratedAt: null,
        lastGeneratedBuildId: null,
        lastGeneratedProfileId: null,
        needsRestart: false,
      };
    }
    return CONFIG.localization_meta;
  }

  function buildContext(version) {
    return localizationProfiles.createVersionContext({
      version,
      catalog: getCachedCatalog(),
    });
  }

  function ensureBuildProfiles(version) {
    const store = localizationProfiles.getStore();
    const versionCtx = buildContext(version);
    const root = localizationProfiles.ensureProfilesRoot(store);
    const before = root.profiles.length;
    const active = localizationProfiles.ensureDefaultProfile({
      store: root,
      versionCtx,
      catalog: getCachedCatalog(),
    });
    const changed = root.profiles.length !== before;
    if (changed) localizationProfiles.saveStore();
    return { root, versionCtx, activeProfile: active, changed };
  }

  function serializeProfiles(versionCtx, root) {
    const profiles = localizationProfiles
      .getProfilesByBuildId(root, versionCtx.buildId)
      .slice()
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const activeProfile = localizationProfiles.resolveActiveProfile(root, versionCtx.buildId);
    const lastGeneratedProfile = localizationProfiles.getLastGeneratedProfile(
      root,
      versionCtx.buildId
    );
    const initialProfile = localizationProfiles.resolveInitialProfile(root, versionCtx.buildId);
    const meta = ensureLocalizationMeta(getConfig());
    return {
      buildId: versionCtx.buildId,
      buildLabel: versionCtx.buildLabel,
      buildTag: versionCtx.buildTag,
      branchHints: versionCtx.branchHints || [],
      mode: versionCtx.profile,
      activeProfileId: activeProfile?.id || null,
      activeProfile,
      lastGeneratedProfileId: lastGeneratedProfile?.id || null,
      lastGeneratedProfile,
      initialProfileId: initialProfile?.id || activeProfile?.id || null,
      profiles,
      meta,
      languageColumns: localization.LANGUAGE_COLUMNS,
    };
  }

  app.get("/api/localization", (req, res) => {
    try {
      const version = canonicalVersion(req.query?.version);
      const { root, versionCtx } = ensureBuildProfiles(version);
      return http.respondJson(res, { ok: true, data: serializeProfiles(versionCtx, root) }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "讀取語系設定集失敗" }, 500);
    }
  });

  app.post("/api/localization", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const name = req.body?.name;
      const { root, versionCtx } = ensureBuildProfiles(version);

      let entries = req.body?.entries;
      if (!Array.isArray(entries) && req.body?.sourceProfileId) {
        const sourceProfile = localizationProfiles.getProfileById(root, req.body.sourceProfileId);
        entries = localizationProfiles.cloneProfileEntries(sourceProfile);
      }
      const validation = localizationProfiles.validateEntries(entries || []);
      if (!validation.ok) {
        return http.respondJson(
          res,
          { ok: false, message: "翻譯清單驗證失敗", errors: validation.errors },
          400
        );
      }

      const profile = localizationProfiles.createProfileRecord({
        versionCtx,
        catalog: getCachedCatalog(),
        name,
        entries: entries || [],
      });
      root.profiles.push(profile);
      localizationProfiles.setActiveProfile(root, versionCtx.buildId, profile.id);
      localizationProfiles.saveStore();
      eventBus.push("system", { text: `已建立語系設定集: ${profile.displayName}` });
      return http.respondJson(res, { ok: true, data: serializeProfiles(versionCtx, root) }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "建立語系設定集失敗" }, 500);
    }
  });

  app.post("/api/localization/select", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const profile = localizationProfiles.getProfileById(root, profileId);
      if (!profile || String(profile.buildId || "") !== String(versionCtx.buildId || "")) {
        return http.respondJson(res, { ok: false, message: "找不到此版本可用的語系設定集" }, 404);
      }
      localizationProfiles.setActiveProfile(root, versionCtx.buildId, profile.id);
      localizationProfiles.saveStore();
      return http.respondJson(res, { ok: true, data: serializeProfiles(versionCtx, root) }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "切換語系設定集失敗" }, 500);
    }
  });

  app.post("/api/localization/save", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const profile = localizationProfiles.getProfileById(root, profileId);
      if (!profile || String(profile.buildId || "") !== String(versionCtx.buildId || "")) {
        return http.respondJson(res, { ok: false, message: "找不到此版本可保存的語系設定集" }, 404);
      }

      const validation = localizationProfiles.validateEntries(req.body?.entries || []);
      if (!validation.ok) {
        return http.respondJson(
          res,
          { ok: false, message: "翻譯清單驗證失敗", errors: validation.errors },
          400
        );
      }

      localizationProfiles.updateProfileFromEntries(
        profile,
        versionCtx,
        getCachedCatalog(),
        req.body?.entries,
        req.body?.name
      );
      localizationProfiles.setActiveProfile(root, versionCtx.buildId, profile.id);
      localizationProfiles.saveStore();
      return http.respondJson(res, { ok: true, data: serializeProfiles(versionCtx, root) }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "保存語系設定集失敗" }, 500);
    }
  });

  app.post("/api/localization/rename", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const profile = localizationProfiles.getProfileById(root, profileId);
      if (!profile || String(profile.buildId || "") !== String(versionCtx.buildId || "")) {
        return http.respondJson(res, { ok: false, message: "找不到此版本可改名的語系設定集" }, 404);
      }
      localizationProfiles.updateProfileFromEntries(
        profile,
        versionCtx,
        getCachedCatalog(),
        profile.entries,
        req.body?.name
      );
      localizationProfiles.saveStore();
      return http.respondJson(res, { ok: true, data: serializeProfiles(versionCtx, root) }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "語系設定集改名失敗" }, 500);
    }
  });

  app.post("/api/localization/delete", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const buildProfiles = localizationProfiles.getProfilesByBuildId(root, versionCtx.buildId);
      if (buildProfiles.length <= 1) {
        return http.respondJson(res, { ok: false, message: "至少保留一筆設定集，無法刪除最後一筆" }, 409);
      }
      const index = root.profiles.findIndex((profile) => profile.id === profileId);
      if (index === -1) {
        return http.respondJson(res, { ok: false, message: "找不到要刪除的語系設定集" }, 404);
      }
      const [removed] = root.profiles.splice(index, 1);
      if (String(removed.buildId || "") !== String(versionCtx.buildId || "")) {
        root.profiles.splice(index, 0, removed);
        return http.respondJson(res, { ok: false, message: "不可刪除其他版本的設定集" }, 400);
      }

      const remaining = localizationProfiles.getProfilesByBuildId(root, versionCtx.buildId);
      const nextProfile = remaining[0] || null;
      const buildKey = String(versionCtx.buildId || "");
      const activeProfileId = root.activeByBuildId?.[buildKey] || root.activeProfileId || null;
      if (
        activeProfileId === removed.id ||
        !localizationProfiles.resolveActiveProfile(root, versionCtx.buildId)
      ) {
        localizationProfiles.setActiveProfile(root, versionCtx.buildId, nextProfile?.id || null);
      }
      const lastGeneratedProfileId = root.lastGeneratedByBuildId?.[buildKey] || null;
      if (
        lastGeneratedProfileId === removed.id ||
        !localizationProfiles.getLastGeneratedProfile(root, versionCtx.buildId)
      ) {
        localizationProfiles.setLastGeneratedProfile(root, versionCtx.buildId, nextProfile?.id || null);
      }
      localizationProfiles.saveStore();
      eventBus.push("system", { text: `已刪除語系設定集: ${removed.displayName}` });
      return http.respondJson(res, { ok: true, data: serializeProfiles(versionCtx, root) }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "刪除語系設定集失敗" }, 500);
    }
  });

  app.post("/api/localization/generate", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const profile = localizationProfiles.getProfileById(root, profileId);
      if (!profile || String(profile.buildId || "") !== String(versionCtx.buildId || "")) {
        return http.respondJson(res, { ok: false, message: "找不到此版本可生成的語系設定集" }, 404);
      }
      const validation = localizationProfiles.validateEntries(profile.entries || []);
      if (!validation.ok) {
        return http.respondJson(
          res,
          { ok: false, message: "翻譯清單驗證失敗，請先修正後再生成", errors: validation.errors },
          400
        );
      }

      const result = localization.writeModFiles({ GAME_DIR, profile, appVersion });

      localizationProfiles.setLastGeneratedProfile(root, versionCtx.buildId, profile.id);
      localizationProfiles.saveStore();

      const CONFIG = getConfig();
      const meta = ensureLocalizationMeta(CONFIG);
      meta.lastGeneratedAt = new Date().toISOString();
      meta.lastGeneratedBuildId = versionCtx.buildId;
      meta.lastGeneratedProfileId = profile.id;
      meta.needsRestart = true;
      saveConfig();

      eventBus.push("system", {
        text: `已生成語系 Mod: ${profile.displayName}（${result.rowCount} 筆），請重啟伺服器套用`,
      });
      return http.respondJson(
        res,
        { ok: true, data: { ...result, needsRestart: true, meta } },
        200
      );
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "生成語系 Mod 失敗" }, 500);
    }
  });

  app.post("/api/localization/acknowledge-restart", (req, res) => {
    try {
      const CONFIG = getConfig();
      const meta = ensureLocalizationMeta(CONFIG);
      meta.needsRestart = false;
      saveConfig();
      return http.respondJson(res, { ok: true, data: meta }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "更新狀態失敗" }, 500);
    }
  });

  app.get("/api/localization/official-keys", (req, res) => {
    try {
      const officialCsvPath = localization.resolveOfficialCsvPath(GAME_DIR);
      const search = req.query?.search;
      const page = parseInt(req.query?.page, 10);
      const pageSize = parseInt(req.query?.pageSize, 10);
      const data = localization.scanOfficialCsvKeys({
        officialCsvPath,
        search,
        page: Number.isInteger(page) ? page : undefined,
        pageSize: Number.isInteger(pageSize) ? pageSize : undefined,
      });
      return http.respondJson(res, { ok: true, data }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "讀取官方語系清單失敗" }, 500);
    }
  });

  app.get("/api/localization/preview", (req, res) => {
    try {
      const version = canonicalVersion(req.query?.version);
      const profileId = req.query?.profileId;
      const { root } = ensureBuildProfiles(version);
      const profile = localizationProfiles.getProfileById(root, profileId);
      if (!profile) {
        return http.respondJson(res, { ok: false, message: "找不到語系設定集" }, 404);
      }
      const officialRowByKey = localization.getOfficialCsvRowByKeyMap(
        localization.resolveOfficialCsvPath(GAME_DIR)
      );
      const rows = localization.buildCsvRows(profile.entries, officialRowByKey);
      return http.respondJson(
        res,
        { ok: true, data: { headers: localization.CSV_HEADERS, rows, rowCount: rows.length } },
        200
      );
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "預覽失敗" }, 500);
    }
  });
};
