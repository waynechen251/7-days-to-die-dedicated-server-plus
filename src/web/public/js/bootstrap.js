(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api;
  const { restoreUnreadBadges } = App.console;
  const { setInstalledVersion } = App.status;
  const D = App.dom;
  const S = App.state;

  function setVersionSourceBadge(source) {
    if (!D.versionSourceBadge) return;
    const sourceLabels = {
      api: "SteamCMD API",
      cache: "SteamCMD API (快取)",
      fallback: "靜態列表",
    };
    const sourceColors = {
      api: "var(--c-ok)",
      cache: "var(--c-ok)",
      fallback: "var(--c-warn)",
    };
    D.versionSourceBadge.textContent = sourceLabels[source] || source;
    D.versionSourceBadge.style.background = sourceColors[source] || "";
  }

  async function loadVersions() {
    try {
      const result = await fetchJSON("/api/versions");
      if (result?.ok && Array.isArray(result.versions)) {
        // Clear existing options
        D.versionSelect.innerHTML = "";

        // Add options from API
        for (const ver of result.versions) {
          const opt = document.createElement("option");
          // Use empty string for "public" to match existing behavior
          opt.value = ver.value === "public" ? "" : ver.value;
          opt.textContent = ver.label;
          D.versionSelect.appendChild(opt);
        }

        // Store version labels for later use
        S.versionLabels = {};
        for (const ver of result.versions) {
          const key = ver.value === "public" ? "" : ver.value;
          S.versionLabels[key] = ver.label;
        }

        // Update source badge
        setVersionSourceBadge(result.source);

        return true;
      }
    } catch (_) {
      // Keep existing static options on failure
      setVersionSourceBadge("fallback");
    }
    return false;
  }

  async function initUI() {
    // Load versions dynamically
    await loadVersions();

    try {
      const cfg = await fetchJSON("/api/get-config");
      if (
        cfg?.data?.web &&
        Object.prototype.hasOwnProperty.call(cfg.data.web, "lastInstallVersion")
      ) {
        const last = cfg.data.web.lastInstallVersion;
        // Convert "public" to empty string for select value
        const selectValue = last === "public" ? "" : last;
        if (selectValue) {
          const opt = Array.from(D.versionSelect.options).find(
            (o) => o.value === selectValue
          );
          if (opt) D.versionSelect.value = selectValue;
        } else {
          D.versionSelect.value = "";
        }
        setInstalledVersion(last);
      } else {
        setInstalledVersion(null);
      }

      if (D.gameSelectedVersionBadge) {
        const installed = S.installedVersion;
        if (installed) {
          const lbl = App.status.versionLabel
            ? App.status.versionLabel(installed)
            : installed;
          D.gameSelectedVersionBadge.textContent = "上次安裝版本: " + lbl;
        }
      }
    } catch (_) {
      setInstalledVersion(null);
      if (D.gameSelectedVersionBadge) {
        D.gameSelectedVersionBadge.textContent = "上次安裝版本: 無紀錄";
      }
    }
    restoreUnreadBadges();
    App.saves.loadSaves();
  }

  function setState(s) {
    S.current = Object.assign({}, S.current || {}, s);
    App.status.applyUIState(S.current);
    App.mask.updateMask();
  }

  async function refreshStatus() {
    try {
      const s = await fetchJSON("/api/processManager/status", {
        method: "GET",
      });
      const game = s.data?.gameServer || {};
      const steam = s.data?.steamCmd || {};
      S.hasEverConnected = true;

      const heapVal = Number.isFinite(game.heap)
        ? game.heap
        : Number.isFinite(game.heapMB)
        ? game.heapMB
        : undefined;
      const maxVal = Number.isFinite(game.max)
        ? game.max
        : Number.isFinite(game.maxMB)
        ? game.maxMB
        : undefined;
      const rssVal = Number.isFinite(game.rss)
        ? game.rss
        : Number.isFinite(game.rssMB)
        ? game.rssMB
        : undefined;

      setState({
        backendUp: true,
        steamRunning: !!steam.isRunning,
        gameRunning: !!game.isRunning,
        telnetOk: !!game.isTelnetConnected,
        gameVersion: game.gameVersion || "",
        onlinePlayers:
          game.onlinePlayers != null && game.onlinePlayers !== ""
            ? game.onlinePlayers
            : "",
        fps: Number.isFinite(game.fps) ? game.fps : undefined,
        heap: heapVal,
        max: maxVal,
        zom: Number.isFinite(game.zom) ? game.zom : undefined,
        rss: rssVal,
      });
    } catch {
      setState({
        backendUp: false,
        steamRunning: false,
        gameRunning: false,
        telnetOk: false,
        gameVersion: "",
        onlinePlayers: "",
      });
    } finally {
      setTimeout(refreshStatus, 1000);
    }
  }

  let booted = false;

  async function checkForUpdate() {
    try {
      const result = await fetchJSON("/api/update-check");
      if (result?.hasUpdate && D.updateBadge) {
        D.updateBadge.href = result.releaseUrl || "#";
        D.updateBadge.classList.remove("hidden");
      }
    } catch (_) {
      // 靜默失敗，更新提示保持隱藏
    }
  }

  async function realBoot() {
    if (booted) return;
    booted = true;

    // 語言選擇器（i18n 已在 boot 中初始化）
    const select = document.getElementById("langSelect");
    if (select && App.i18n) {
      select.value = App.i18n.getCurrentLang();
      select.addEventListener("change", (e) => {
        App.i18n.setLanguage(e.target.value);
      });
    }

    await initUI();
    App.console.switchTab(S.activeTab);
    App.mask.updateMask();
    App.sse.connectSSE();
    refreshStatus();

    // 更新 UI (權限相關)
    if (App.auth?.updateUI) App.auth.updateUI();
    checkForUpdate();
  }

  (async function boot() {
    const onFragmentsReady = async () => {
      // 1. 初始化 i18n（登入頁面也需要翻譯）
      if (App.i18n) await App.i18n.init();

      // 2. 綁定 Auth 表單事件
      App.auth?.bindEvents();

      // 3. 檢查首次設定
      const setupRequired = await App.auth?.checkSetup();
      if (setupRequired) {
        App.auth.showSetupScreen();
        return;
      }

      // 4. 檢查認證狀態
      const authenticated = await App.auth?.checkAuth();
      if (!authenticated) {
        App.auth.showLoginScreen();
        return;
      }

      // 5. 已認證，啟動主界面
      await realBoot();
    };

    if (window.__fragmentsReady) {
      onFragmentsReady();
    } else {
      window.addEventListener("fragments:ready", () => onFragmentsReady(), {
        once: true,
      });
    }
  })();

  App.bootstrap = { refreshStatus, setState, realBoot };

  w.setState = setState;
})(window);
