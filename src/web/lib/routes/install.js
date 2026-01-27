module.exports = function registerInstallRoutes(app, ctx) {
  const {
    http,
    eventBus,
    processManager,
    steamcmd,
    getConfig,
    saveConfig,
    baseDir,
    GAME_DIR,
  } = ctx;

  app.post("/api/install", (req, res) => {
    try {
      const CONFIG = getConfig();
      const rawVersion = (req.body?.version ?? "").trim();
      const version = rawVersion === "" ? "public" : rawVersion;
      CONFIG.web.lastInstallVersion = version;
      saveConfig();

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      eventBus.push("steamcmd", {
        text: `start install/update (${version})`,
      });

      const baseDirLocal = baseDir;
      const gameDirLocal = GAME_DIR;
      steamcmd.install(
        version,
        gameDirLocal,
        {
          onData: (data) => {
            http.writeStamped(res, `[stdout] ${data}`);
            eventBus.push("steamcmd", { level: "stdout", text: data });
          },
          onError: (err) => {
            http.writeStamped(res, `[stderr] ${err}`);
            eventBus.push("steamcmd", { level: "stderr", text: err });
          },
          onClose: (code) => {
            const line = `✅ 安裝 / 更新結束，Exit Code: ${code}`;
            try {
              if (!CONFIG.web) CONFIG.web = {};
              CONFIG.web.game_serverInit = "true";
              saveConfig();
              eventBus.push("system", {
                text: "已設定 game_serverInit=true (首次開啟編輯器時提示載入保存設定)",
              });
            } catch (e) {
              eventBus.push("system", {
                level: "warn",
                text: `設定 game_serverInit 失敗: ${e.message}`,
              });
            }
            http.writeStamped(res, line);
            res.end();
            eventBus.push("steamcmd", { text: line });
          },
        },
        { cwd: baseDirLocal }
      );
    } catch (err) {
      const msg = `❌ 無法啟動 steamcmd: ${err.message}`;
      ctx.error(msg);
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
};
