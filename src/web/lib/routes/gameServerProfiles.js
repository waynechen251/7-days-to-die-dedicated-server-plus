const { canonicalVersion } = require("../versionProfile");
const { getCachedCatalog } = require("../versionCatalog");

module.exports = function registerGameServerProfilesRoutes(app, ctx) {
  const {
    http,
    eventBus,
    getConfig,
    saveConfig,
    serverConfigLib,
    baseDir,
    GAME_DIR,
    gameServerProfiles,
  } = ctx;

  function resolveConfigPath() {
    return serverConfigLib.resolveServerConfigPath({
      CONFIG: getConfig(),
      baseDir,
      GAME_DIR,
    });
  }

  function readCurrentXmlItems() {
    const cfgPath = resolveConfigPath();
    if (!cfgPath) return { cfgPath: null, items: [] };
    return {
      cfgPath,
      items: serverConfigLib.readValues(cfgPath).items || [],
    };
  }

  function buildContext(version, items) {
    return gameServerProfiles.createVersionContext({
      version,
      items,
      catalog: getCachedCatalog(),
    });
  }

  function editableItemsForContext(items, versionCtx) {
    return serverConfigLib.filterItemsForProfile(items, versionCtx);
  }

  function ensureBuildProfiles(version) {
    const CONFIG = getConfig();
    const { items } = readCurrentXmlItems();
    const versionCtx = buildContext(version, items);
    const editableItems = editableItemsForContext(items, versionCtx);
    const root = gameServerProfiles.ensureProfilesRoot(CONFIG);
    const before = root.profiles.length;
    const active = gameServerProfiles.ensureDefaultProfile({
      CONFIG,
      versionCtx,
      catalog: getCachedCatalog(),
      items: editableItems,
    });
    const changed = root.profiles.length !== before;
    if (changed) saveConfig();
    return {
      root,
      items,
      versionCtx,
      editableItems,
      activeProfile: active,
      changed,
    };
  }

  function serializeProfiles(versionCtx, root) {
    const profiles = gameServerProfiles
      .getProfilesByBuildId(root, versionCtx.buildId)
      .slice()
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const activeProfile = gameServerProfiles.resolveActiveProfile(root, versionCtx.buildId);
    const lastStartedProfile = gameServerProfiles.getLastStartedProfile(
      root,
      versionCtx.buildId
    );
    const initialProfile = gameServerProfiles.resolveInitialProfile(
      root,
      versionCtx.buildId
    );
    return {
      buildId: versionCtx.buildId,
      buildLabel: versionCtx.buildLabel,
      buildTag: versionCtx.buildTag,
      branchHints: versionCtx.branchHints || [],
      mode: versionCtx.profile,
      activeProfileId: activeProfile?.id || null,
      activeProfile,
      lastStartedProfileId: lastStartedProfile?.id || null,
      lastStartedProfile,
      initialProfileId: initialProfile?.id || activeProfile?.id || null,
      profiles,
    };
  }

  app.get("/api/game-server-profiles", (req, res) => {
    try {
      const version = canonicalVersion(req.query?.version);
      const { root, versionCtx } = ensureBuildProfiles(version);
      return http.respondJson(
        res,
        {
          ok: true,
          data: serializeProfiles(versionCtx, root),
        },
        200
      );
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err.message || "讀取版本設定集失敗" },
        500
      );
    }
  });

  app.post("/api/game-server-profiles", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const name = req.body?.name;
      const { root, versionCtx, editableItems } = ensureBuildProfiles(version);
      const snapshot = gameServerProfiles.filterSnapshotByItems(
        req.body?.snapshot || gameServerProfiles.profileSnapshotFromItems(editableItems),
        editableItems
      );
      const profile = gameServerProfiles.createProfileRecord({
        versionCtx,
        catalog: getCachedCatalog(),
        name,
        snapshot,
      });
      root.profiles.push(profile);
      gameServerProfiles.setActiveProfile(root, versionCtx.buildId, profile.id);
      gameServerProfiles.mergeProfileIntoGameServer(getConfig(), profile);
      saveConfig();
      eventBus.push("system", {
        text: `已建立版本設定集: ${profile.displayName}`,
      });
      return http.respondJson(
        res,
        {
          ok: true,
          data: serializeProfiles(versionCtx, root),
        },
        200
      );
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err.message || "建立版本設定集失敗" },
        500
      );
    }
  });

  app.post("/api/game-server-profiles/select", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const profile = gameServerProfiles.getProfileById(root, profileId);
      if (!profile || String(profile.buildId || "") !== String(versionCtx.buildId || "")) {
        return http.respondJson(
          res,
          { ok: false, message: "找不到此版本可用的設定集" },
          404
        );
      }
      gameServerProfiles.setActiveProfile(root, versionCtx.buildId, profile.id);
      gameServerProfiles.mergeProfileIntoGameServer(getConfig(), profile);
      saveConfig();
      return http.respondJson(
        res,
        { ok: true, data: serializeProfiles(versionCtx, root) },
        200
      );
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err.message || "切換版本設定集失敗" },
        500
      );
    }
  });

  app.post("/api/game-server-profiles/save", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx, editableItems } = ensureBuildProfiles(version);
      const profile = gameServerProfiles.getProfileById(root, profileId);
      if (!profile || String(profile.buildId || "") !== String(versionCtx.buildId || "")) {
        return http.respondJson(
          res,
          { ok: false, message: "找不到此版本可保存的設定集" },
          404
        );
      }

      const snapshot = gameServerProfiles.filterSnapshotByItems(
        req.body?.snapshot,
        editableItems
      );
      gameServerProfiles.updateProfileFromSnapshot(
        profile,
        versionCtx,
        getCachedCatalog(),
        snapshot,
        req.body?.name
      );
      gameServerProfiles.setActiveProfile(root, versionCtx.buildId, profile.id);
      gameServerProfiles.mergeProfileIntoGameServer(getConfig(), profile);
      saveConfig();
      return http.respondJson(
        res,
        { ok: true, data: serializeProfiles(versionCtx, root) },
        200
      );
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err.message || "保存版本設定集失敗" },
        500
      );
    }
  });

  app.post("/api/game-server-profiles/rename", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const profile = gameServerProfiles.getProfileById(root, profileId);
      if (!profile || String(profile.buildId || "") !== String(versionCtx.buildId || "")) {
        return http.respondJson(
          res,
          { ok: false, message: "找不到此版本可改名的設定集" },
          404
        );
      }
      gameServerProfiles.updateProfileFromSnapshot(
        profile,
        versionCtx,
        getCachedCatalog(),
        { values: profile.values, commented: profile.commented },
        req.body?.name
      );
      saveConfig();
      return http.respondJson(
        res,
        { ok: true, data: serializeProfiles(versionCtx, root) },
        200
      );
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err.message || "設定集改名失敗" },
        500
      );
    }
  });

  app.post("/api/game-server-profiles/delete", (req, res) => {
    try {
      const version = canonicalVersion(req.body?.version);
      const profileId = req.body?.profileId;
      const { root, versionCtx } = ensureBuildProfiles(version);
      const buildProfiles = gameServerProfiles.getProfilesByBuildId(root, versionCtx.buildId);
      if (buildProfiles.length <= 1) {
        return http.respondJson(
          res,
          { ok: false, message: "至少保留一筆設定檔，無法刪除最後一筆" },
          409
        );
      }
      const index = root.profiles.findIndex((profile) => profile.id === profileId);
      if (index === -1) {
        return http.respondJson(
          res,
          { ok: false, message: "找不到要刪除的設定集" },
          404
        );
      }
      const [removed] = root.profiles.splice(index, 1);
      if (String(removed.buildId || "") !== String(versionCtx.buildId || "")) {
        root.profiles.splice(index, 0, removed);
        return http.respondJson(
          res,
          { ok: false, message: "不可刪除其他版本的設定集" },
          400
        );
      }

      const remaining = gameServerProfiles.getProfilesByBuildId(root, versionCtx.buildId);
      const nextProfile = remaining[0] || null;
      const buildKey = String(versionCtx.buildId || "");
      const activeProfileId =
        root.activeByBuildId?.[buildKey] || root.activeProfileId || null;
      if (activeProfileId === removed.id || !gameServerProfiles.resolveActiveProfile(root, versionCtx.buildId)) {
        gameServerProfiles.setActiveProfile(
          root,
          versionCtx.buildId,
          nextProfile?.id || null
        );
      }
      const lastStartedProfileId = root.lastStartedByBuildId?.[buildKey] || null;
      if (
        lastStartedProfileId === removed.id ||
        !gameServerProfiles.getLastStartedProfile(root, versionCtx.buildId)
      ) {
        gameServerProfiles.setLastStartedProfile(
          root,
          versionCtx.buildId,
          nextProfile?.id || null
        );
      }
      const resolvedProfile =
        gameServerProfiles.resolveActiveProfile(root, versionCtx.buildId) || nextProfile;
      if (resolvedProfile) {
        gameServerProfiles.mergeProfileIntoGameServer(getConfig(), resolvedProfile);
      }
      saveConfig();
      eventBus.push("system", {
        text: `已刪除版本設定集: ${removed.displayName}`,
      });
      return http.respondJson(
        res,
        { ok: true, data: serializeProfiles(versionCtx, root) },
        200
      );
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err.message || "刪除設定集失敗" },
        500
      );
    }
  });
};
