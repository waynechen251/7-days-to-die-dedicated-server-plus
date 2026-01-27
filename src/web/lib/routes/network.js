const net = require("net");

function tryConnectOnce(port, host, timeout = 500) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let resolved = false;
    function done(inUse) {
      if (resolved) return;
      resolved = true;
      try {
        sock.destroy();
      } catch (_) {}
      resolve({ host, inUse });
    }
    sock.setTimeout(timeout);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
    try {
      sock.connect(port, host);
    } catch (_) {
      done(false);
    }
  });
}

async function checkPortInUse(port) {
  const hosts = ["127.0.0.1"];
  const results = await Promise.all(hosts.map((h) => tryConnectOnce(port, h)));
  return results.some((r) => r.inUse);
}

module.exports = function registerNetworkRoutes(app, ctx) {
  const { http, eventBus, processManager, getConfig, log, error } = ctx;

  let dummyGamePortServer = null;
  let dummyGamePort = null;

  function closeDummyGamePort(reason = "start") {
    if (dummyGamePortServer) {
      try {
        const p = dummyGamePort;
        dummyGamePortServer.close(() => {
          log(`ℹ️ 已關閉 dummy ServerPort 監聽 (${p}) 原因: ${reason}`);
        });
        eventBus.push("system", {
          text: `關閉暫時 ServerPort 測試監聽 (${dummyGamePort}) (${reason})`,
        });
      } catch (_) {}
      dummyGamePortServer = null;
      dummyGamePort = null;
    }
  }

  async function ensureDummyGamePort(wantedPortOverride) {
    try {
      if (processManager.gameServer.isRunning) {
        if (dummyGamePortServer) closeDummyGamePort("game-running");
        return { listening: false, started: false };
      }

      const CONFIG = getConfig();
      let wantedPort = Number.isFinite(parseInt(wantedPortOverride, 10))
        ? parseInt(wantedPortOverride, 10)
        : NaN;

      if (!Number.isFinite(wantedPort)) {
        const pRaw =
          CONFIG?.game_server?.ServerPort ||
          CONFIG?.game_server?.serverPort ||
          CONFIG?.game_server?.serverport;
        wantedPort = parseInt(pRaw, 10);
      }

      if (!Number.isFinite(wantedPort) || wantedPort <= 0 || wantedPort > 65535) {
        if (dummyGamePortServer) closeDummyGamePort("invalid-port");
        return { listening: false, started: false };
      }

      if (dummyGamePortServer && dummyGamePort !== wantedPort) {
        closeDummyGamePort(`port-changed ${dummyGamePort}→${wantedPort}`);
      }

      if (dummyGamePortServer) {
        return { listening: true, started: false };
      }

      if (await checkPortInUse(wantedPort)) {
        return { listening: false, started: false };
      }

      await new Promise((resolve, reject) => {
        const srv = net.createServer((socket) => {
          socket.destroy();
        });
        srv.once("error", (e) => reject(e));
        srv.listen(wantedPort, "0.0.0.0", () => {
          dummyGamePortServer = srv;
          dummyGamePort = wantedPort;
          log(
            `ℹ️ 已啟動假的 ServerPort 監聽 (dummy) 於 ${wantedPort} (等待實際伺服器啟動)`
          );
          eventBus.push("system", {
            text: `啟動暫時 ServerPort 測試監聽 (dummy) 於 ${wantedPort}`,
          });
          resolve();
        });
      });

      return { listening: true, started: true };
    } catch (e) {
      error(`❌ 啟動/切換 dummy ServerPort 失敗: ${e.message}`);
      return { listening: false, started: false, error: e.message };
    }
  }

  // Expose closeDummyGamePort for use by game routes
  ctx.closeDummyGamePort = closeDummyGamePort;

  // Register cleanup handlers
  process.on("exit", () => closeDummyGamePort("process-exit"));
  process.on("SIGINT", () => {
    closeDummyGamePort("sigint");
    process.exit(0);
  });

  app.get("/api/check-port", async (req, res) => {
    const p = parseInt(req.query?.port, 10);
    if (!Number.isFinite(p) || p <= 0 || p > 65535) {
      return http.respondJson(res, { ok: false, message: "port 無效" }, 400);
    }
    try {
      const inUse = await checkPortInUse(p);
      // 判斷是否為 dummy 監聽器佔用
      const isDummy = !!(dummyGamePortServer && dummyGamePort === p);
      return http.respondJson(res, { ok: true, data: { inUse, isDummy } }, 200);
    } catch (err) {
      return http.respondJson(
        res,
        { ok: false, message: err?.message || "檢查失敗" },
        500
      );
    }
  });

  app.post("/api/close-dummy-port", (req, res) => {
    try {
      if (dummyGamePortServer) {
        closeDummyGamePort("ui-close");
      }
      return http.respondJson(res, { ok: true }, 200);
    } catch (e) {
      return http.respondJson(
        res,
        { ok: false, message: e?.message || "關閉失敗" },
        500
      );
    }
  });

  app.get("/api/public-ip", async (req, res) => {
    try {
      const r = await fetch("https://api.ipify.org?format=json", {
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) throw new Error(`ip service ${r.status}`);
      const j = await r.json();
      const ip = j.ip;
      if (!ip) throw new Error("no ip");
      return http.respondJson(res, { ok: true, data: { ip } }, 200);
    } catch (e) {
      return http.respondJson(
        res,
        { ok: false, message: e.message || "取得公網 IP 失敗" },
        500
      );
    }
  });

  app.get("/api/check-port-forward", async (req, res) => {
    try {
      const ip = String(req.query.ip || "").trim();
      const port = parseInt(req.query.port, 10);
      const protocol = (req.query.protocol || "tcp").toString().toLowerCase();
      if (!ip)
        return http.respondJson(res, { ok: false, message: "缺少 ip" }, 400);
      if (!Number.isFinite(port) || port <= 0 || port > 65535)
        return http.respondJson(res, { ok: false, message: "port 無效" }, 400);
      if (!/^(tcp|udp)$/.test(protocol))
        return http.respondJson(
          res,
          { ok: false, message: "protocol 無效" },
          400
        );

      const dummyState = await ensureDummyGamePort(port);

      let open = false;
      let raw = null;

      const url = `https://portchecker.io/api/${encodeURIComponent(
        ip
      )}/${port}?protocol=${protocol}`;
      try {
        const r = await fetch(url, {
          headers: { Accept: "text/plain, application/json;q=0.9, */*;q=0.8" },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error(`portchecker.io ${r.status}`);

        const ct = (r.headers.get("content-type") || "").toLowerCase();
        let bodyText = await r.text();
        let parsed = null;

        if (/application\/json/.test(ct) || bodyText.trim().startsWith("{")) {
          try {
            parsed = JSON.parse(bodyText);
          } catch (_) {}
        }
        raw = parsed ?? bodyText;

        if (parsed) {
          if (
            parsed.status === "open" ||
            parsed.open === true ||
            parsed.result === "open" ||
            parsed.port_open === true ||
            parsed.online === true ||
            parsed === true
          ) {
            open = true;
          }
        } else {
          const s = String(bodyText).trim().toLowerCase();
          if (s === "true" || s === "open" || s === "online") open = true;
        }

        log(
          `[PortForwardCheck] url=${url} ct=${ct || "-"} result=${JSON.stringify(
            raw
          )}`
        );
      } catch (e) {
        error(`[PortForwardCheck] fetch error: ${e.message}`);
        return http.respondJson(
          res,
          {
            ok: true,
            data: {
              ip,
              port,
              protocol,
              open: false,
              dummyListening: dummyState.listening,
              dummyJustStarted: dummyState.started,
              error: e.message,
            },
          },
          200
        );
      }

      return http.respondJson(
        res,
        {
          ok: true,
          data: {
            ip,
            port,
            protocol,
            open,
            raw,
            dummyListening: dummyState.listening,
            dummyJustStarted: dummyState.started,
          },
        },
        200
      );
    } catch (e) {
      return http.respondJson(
        res,
        { ok: false, message: e.message || "檢查失敗" },
        500
      );
    }
  });
};
