function isLocalRequest(req) {
  const addr = req.socket?.remoteAddress || req.ip || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

module.exports = function registerFirewallRoutes(app, ctx) {
  const { http, eventBus, getConfig, saveConfig, serverConfigLib, baseDir, GAME_DIR, log, error, firewall } = ctx;

  app.get("/api/firewall/status", async (req, res) => {
    try {
      const CONFIG = getConfig();
      const data = await firewall.getStatus(CONFIG);
      return http.respondJson(res, {
        ok: true,
        data: {
          ...data,
          capability: {
            ...(data.capability || {}),
            isLocal: isLocalRequest(req),
          },
        },
      }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "查詢失敗" }, 500);
    }
  });

  app.post("/api/firewall/apply", async (req, res) => {
    try {
      const CONFIG = getConfig();
      const isLocal = isLocalRequest(req);
      // 同步最新 serverconfig.xml 確保埠值最新
      try {
        serverConfigLib.loadAndSyncServerConfig({ CONFIG, baseDir, GAME_DIR, eventBus, saveConfig });
      } catch (_) {}

      const result = await firewall.applyRules(CONFIG, {
        log,
        error,
        eventBus,
        saveConfig,
        allowManagementMutations: isLocal,
      });
      return http.respondJson(res, { ok: result.ok, message: result.message, data: result }, result.ok ? 200 : 500);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "套用失敗" }, 500);
    }
  });

  app.post("/api/firewall/remove", async (req, res) => {
    try {
      const CONFIG = getConfig();
      const result = await firewall.removeRules(CONFIG, {
        log,
        error,
        eventBus,
        saveConfig,
        allowManagementMutations: isLocalRequest(req),
      });
      return http.respondJson(res, { ok: result.ok, message: result.message, data: result }, result.ok ? 200 : 500);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "移除失敗" }, 500);
    }
  });

  app.post("/api/firewall/settings", (req, res) => {
    try {
      const CONFIG = getConfig();
      if (!CONFIG.firewall) CONFIG.firewall = {};

      // 管理用埠設定僅允許本機連線修改，防止遠端斷線
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "openManagementPorts") && !isLocalRequest(req)) {
        return http.respondJson(res, {
          ok: false,
          message: "管理用埠設定僅允許從 localhost 修改，以防止遠端連線斷線。",
        }, 403);
      }

      const allowed = ["autoManage", "removeOnStop", "openGamePorts", "openManagementPorts"];
      let changed = false;
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
          const val = req.body[key];
          if (typeof val !== "boolean") {
            return http.respondJson(res, { ok: false, message: `${key} 必須為布林值` }, 400);
          }
          CONFIG.firewall[key] = val;
          changed = true;
        }
      }
      if (!changed) {
        return http.respondJson(res, { ok: false, message: "未提供有效設定項目" }, 400);
      }
      saveConfig();
      log(`✅ 防火牆設定已更新: ${JSON.stringify(req.body)}`);
      return http.respondJson(res, { ok: true, message: "防火牆設定已更新", data: CONFIG.firewall }, 200);
    } catch (err) {
      return http.respondJson(res, { ok: false, message: err.message || "設定失敗" }, 500);
    }
  });
};
