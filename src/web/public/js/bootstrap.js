(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api;
  const { restoreUnreadBadges } = App.console;
  const { setInstalledVersion } = App.status;
  const D = App.dom;
  const S = App.state;

  async function initUI() {
    try {
      const cfg = await fetchJSON("/api/get-config");
      if (
        cfg?.data?.web &&
        Object.prototype.hasOwnProperty.call(cfg.data.web, "lastInstallVersion")
      ) {
        const last = cfg.data.web.lastInstallVersion;
        if (last && last !== "public") {
          const opt = Array.from(D.versionSelect.options).find(
            (o) => o.value === last
          );
          if (opt) D.versionSelect.value = last;
        } else {
          D.versionSelect.value = "";
        }
        setInstalledVersion(last);
      } else {
        setInstalledVersion(null);
      }
    } catch (_) {
      setInstalledVersion(null);
    }
    restoreUnreadBadges();
    App.saves.loadSaves();
  }

  function setState(s) {
    S.current = s;
    App.status.applyUIState(s);
    App.mask.updateMask();
  }

  async function refreshStatus() {
    try {
      const s = await fetchJSON("/api/process-status", { method: "GET" });
      const game = s.data?.gameServer || {};
      const steam = s.data?.steamCmd || {};
      S.hasEverConnected = true;
      setState({
        backendUp: true,
        steamRunning: !!steam.isRunning,
        gameRunning: !!game.isRunning,
        telnetOk: !!game.isTelnetConnected,
      });
    } catch {
      setState({
        backendUp: false,
        steamRunning: false,
        gameRunning: false,
        telnetOk: false,
      });
    } finally {
      setTimeout(refreshStatus, 1000);
    }
  }

  App.bootstrap = { refreshStatus, setState };

  (async function boot() {
    async function realBoot() {
      await initUI();
      App.console.switchTab(S.activeTab);
      App.mask.updateMask();
      App.sse.connectSSE();
      refreshStatus();
    }

    if (window.__fragmentsReady) {
      realBoot();
    } else {
      window.addEventListener("fragments:ready", () => realBoot(), {
        once: true,
      });
    }
  })();

  w.setState = setState;
})(window);
