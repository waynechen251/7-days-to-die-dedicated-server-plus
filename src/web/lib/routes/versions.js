const { canonicalVersion, resolveVersionProfile } = require("../versionProfile");
const {
  getCachedCatalog,
  refreshCatalog,
  getFallbackCatalogResponse,
} = require("../versionCatalog");

module.exports = function registerVersionsRoutes(app, ctx) {
  const { http, log, error, serverConfigLib, baseDir, GAME_DIR, getConfig } = ctx;

  function readCurrentServerConfigItems() {
    try {
      const cfgPath = serverConfigLib.resolveServerConfigPath({
        CONFIG: getConfig(),
        baseDir,
        GAME_DIR,
      });
      if (!cfgPath) return [];
      return serverConfigLib.readValues(cfgPath).items || [];
    } catch (_) {
      return [];
    }
  }

  app.get("/api/versions", async (req, res) => {
    try {
      const result = await refreshCatalog();
      log(`[versions] Loaded ${result.versions.length} versions from ${result.source}`);
      return http.respondJson(
        res,
        { ok: true, source: result.source, versions: result.versions },
        200
      );
    } catch (err) {
      error(`[versions] API fetch failed: ${err.message}, using fallback`);
      const fallback = getFallbackCatalogResponse();
      return http.respondJson(
        res,
        { ok: true, source: fallback.source, versions: fallback.versions },
        200
      );
    }
  });

  app.get("/api/version-profile", (req, res) => {
    try {
      const version = canonicalVersion(req.query?.version);
      const items = readCurrentServerConfigItems();
      const profile = resolveVersionProfile({
        version,
        items,
        catalog: getCachedCatalog(),
      });
      return http.respondJson(res, { ok: true, data: profile }, 200);
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err.message || "無法判斷版本模式" },
        500
      );
    }
  });
};
