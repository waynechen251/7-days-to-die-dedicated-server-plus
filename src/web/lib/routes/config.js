module.exports = function registerConfigRoutes(app, ctx) {
  const { http, eventBus, getConfig, getConfigMeta, saveConfig } = ctx;

  app.get("/api/get-config", (req, res) => {
    const CONFIG = getConfig();
    const meta = typeof getConfigMeta === "function" ? getConfigMeta() : {};
    return http.respondJson(res, { ok: true, data: CONFIG, meta }, 200);
  });

  app.post("/api/clear-game-server-init", (req, res) => {
    try {
      const CONFIG = getConfig();
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
};
