(function (w) {
  const App = (w.App = w.App || {});
  const { setDisabled, setBadge, canonicalVersion } = App.utils;
  const D = App.dom;
  const S = App.state;

  const t = (key, def) => (App.i18n ? App.i18n.t(key) : def || key);

  function setGnListDisabled(disabled) {
    if (!D.gnList) return;
    D.gnList.querySelectorAll(".save-chip").forEach((c) => (c.disabled = !!disabled));
  }

  function applyUIState({
    backendUp,
    steamRunning,
    gameRunning,
    telnetOk,
    gameVersion,
    onlinePlayers,
    fps,
    heap,
    max,
    zom,
    rss,
    statsUpdatedAt,
  }) {
    const all = [
      D.installServerBtn,
      D.exportSavesBtn,
      D.deleteGameNameBtn,
      D.viewConfigBtn,
      D.stopServerBtn,
      D.killServerBtn,
      D.configStartBtn,
      D.versionSelect,
      D.telnetInput,
      D.telnetSendBtn,
      ...D.telnetBtns,
      D.gwSelect,
      D.exportGameNameBtn,
      D.applyActiveSaveBtn,
      D.refreshSavesBtn,
      D.viewBackupsBtn,
      D.backupSelect,
      D.importBackupBtn,
      D.importUploadFile,
      D.importUploadBtn,
    ];

    const isViewer = App.auth?.isViewer?.() || false;

    // 後端離線
    if (S.backendDown || !backendUp) {
      setBadge(D.stBackend, "err");
      // 重置其他徽章
      setBadge(D.stSteam, "");
      setBadge(D.stGame, "");
      setBadge(D.stTelnet, "");
      setDisabled(all, true);
      setGnListDisabled(true);
      App.saves?.updateApplyActiveBtnState?.();
      return;
    }

    // 更新通用狀態徽章與儀表板
    setBadge(D.stBackend, "ok");
    setBadge(D.stSteam, steamRunning ? "ok" : "err");
    const gameStatus = gameRunning ? (telnetOk ? "ok" : "warn") : "err";
    setBadge(D.stGame, gameStatus);
    setBadge(D.stTelnet, telnetOk ? "ok" : "err");
    updateDashboardStats({ gameVersion, onlinePlayers, fps, heap, max, zom, rss, gameRunning, statsUpdatedAt });

    if (isViewer) {
      const readOnlyButtons = [
        D.installServerBtn,
        D.deleteGameNameBtn,
        D.applyActiveSaveBtn,
        D.stopServerBtn,
        D.killServerBtn,
        D.configStartBtn,
        D.versionSelect,
        D.telnetInput,
        D.telnetSendBtn,
        ...D.telnetBtns,
        D.exportGameNameBtn,
        D.backupSelect,
        D.importBackupBtn,
        D.importUploadFile,
        D.importUploadBtn,
        D.cfgSaveBtn,
        D.cfgSaveStartBtn,
      ];

      setDisabled(readOnlyButtons, true);
      readOnlyButtons.forEach(btn => {
        if (btn) btn.title = t("auth.viewerNoPermission", "觀察者角色無權執行此操作");
      });

      // Viewer 可用的功能（唯讀）
      const viewOnlyButtons = [
        D.viewConfigBtn,
        D.exportSavesBtn,
        D.gwSelect,
        D.refreshSavesBtn,
        D.viewBackupsBtn,
      ];
      setDisabled(viewOnlyButtons, false);
      setGnListDisabled(false);
      
      // 更新按鈕文字狀態 (例如查看配置 vs 啟動伺服器)
      if (D.configStartBtn) {
        if (gameRunning) {
          D.configStartBtn.textContent = "📝 " + t("card.game.viewServerconfig", "檢視 serverconfig.xml");
          // 如果是查看模式，允許 Viewer 點擊
          if (D.configStartBtn.disabled && isViewer) {
            D.configStartBtn.disabled = false;
            D.configStartBtn.title = "";
          }
        } else {
          D.configStartBtn.textContent = "🛠 " + t("card.game.startServer", "啟動伺服器");
          // 保持禁用
        }
      }

      App.saves?.updateApplyActiveBtnState?.();
      return;
    }

    // ─── 標準權限邏輯 (Admin / Operator) ───
    setDisabled(all, false);
    setGnListDisabled(false);

    if (steamRunning) {
      setDisabled(all, true);
      setDisabled([D.installServerBtn, D.viewConfigBtn], false);

      const savesControls = [
        D.gwSelect,
        D.refreshSavesBtn,
        D.exportSavesBtn,
        D.exportGameNameBtn,
        D.applyActiveSaveBtn,
        D.deleteGameNameBtn,
        D.viewBackupsBtn,
        D.backupSelect,
        D.importBackupBtn,
        D.importUploadFile,
        D.importUploadBtn,
      ];

      const lockBecauseBackup = S.backupInProgress;
      setDisabled(savesControls, !!lockBecauseBackup);
      setGnListDisabled(!!lockBecauseBackup);

      if (D.installServerBtn) {
        D.installServerBtn.textContent = "❌ " + t("card.game.abortInstall", "中斷安裝 / 更新");
        D.installServerBtn.setAttribute(
          "data-danger",
          t("confirm.abortInstall", "是否確定中斷安裝 / 更新?\n將不會正常退出，可能導致檔案損毀，請重新執行安裝 / 更新!")
        );
        D.installServerBtn.setAttribute("data-cancel-text", t("common.cancel", "取消"));
        D.installServerBtn.setAttribute("data-continue-text", t("common.confirm", "繼續"));
      }
      App.saves?.updateApplyActiveBtnState?.();
      return;
    } else {
      if (D.installServerBtn) {
        D.installServerBtn.textContent = "📥 " + t("card.game.installUpdate", "安裝 / 更新");
        D.installServerBtn.setAttribute(
          "data-danger",
          t("confirm.installServer", "是否確定安裝 / 更新伺服器?\nserverconfig.xml 將被重置")
        );
        D.installServerBtn.setAttribute("data-cancel-text", t("common.cancel", "取消"));
        D.installServerBtn.setAttribute("data-continue-text", t("common.confirm", "繼續"));
      }
    }

    const lockBecauseBackup = S.backupInProgress;

    setDisabled(
      [D.installServerBtn, D.versionSelect],
      !(!gameRunning && !lockBecauseBackup)
    );
    setDisabled(D.abortInstallBtn, true);

    setDisabled([D.startServerBtn], !(!gameRunning && !lockBecauseBackup));

    const canManage = gameRunning && telnetOk && !lockBecauseBackup;
    setDisabled(
      [D.stopServerBtn, D.telnetInput, D.telnetSendBtn, ...D.telnetBtns],
      !canManage
    );

    setDisabled(D.killServerBtn, !gameRunning);
    setDisabled(D.exportSavesBtn, gameRunning || lockBecauseBackup);
    setDisabled(D.deleteGameNameBtn, gameRunning || lockBecauseBackup);
    setDisabled(D.exportGameNameBtn, gameRunning || lockBecauseBackup);
    setDisabled(D.applyActiveSaveBtn, gameRunning || lockBecauseBackup);

    const canManageSaves = !gameRunning && !lockBecauseBackup;
    setDisabled(
      [
        D.viewBackupsBtn,
        D.importBackupBtn,
        D.importUploadFile,
        D.importUploadBtn,
      ],
      !canManageSaves
    );

    setDisabled(
      [D.gwSelect, D.refreshSavesBtn, D.backupSelect],
      false
    );
    setGnListDisabled(false);

    if (App.auth?.isOperator?.()) {
      if (D.deleteGameNameBtn) {
        D.deleteGameNameBtn.disabled = true;
        D.deleteGameNameBtn.title = t("auth.operatorNoPermission", "操作員無權執行此操作");
      }
      if (D.applyActiveSaveBtn) {
        D.applyActiveSaveBtn.disabled = true;
        D.applyActiveSaveBtn.title = t("auth.operatorNoPermission", "操作員無權執行此操作");
      }
    }

    syncConfigLockFromStatus();
    
    updateDashboardStats({ gameVersion, onlinePlayers, fps, heap, max, zom, rss, gameRunning, statsUpdatedAt });

    if (D.configStartBtn) {
      D.configStartBtn.textContent = gameRunning
        ? "📝 " + t("card.game.viewServerconfig", "檢視 serverconfig.xml")
        : "🛠 " + t("card.game.startServer", "啟動伺服器");
    }

    App.saves?.updateApplyActiveBtnState?.();
  }

  function updateDashboardStats({ gameVersion, onlinePlayers, fps, heap, max, zom, rss, gameRunning, statsUpdatedAt }) {
    const gvEl = document.getElementById("gameVersionBadge");
    if (gvEl) {
      gvEl.textContent = `${t("card.game.version", "版本:")} ${
        gameVersion ? gameVersion : gameRunning ? "-" : "-"
      }`;
    }

    const opEl = document.getElementById("onlinePlayersBadge");
    if (opEl) opEl.textContent = onlinePlayers !== "" ? onlinePlayers : "-";

    const fpsEl = document.getElementById("fpsBadge");
    if (fpsEl) fpsEl.textContent = Number.isFinite(fps) ? fps : "-";

    const heapEl = document.getElementById("heapBadge");
    if (heapEl) heapEl.textContent = Number.isFinite(heap) ? heap + "MB" : "-";

    const maxEl = document.getElementById("maxBadge");
    if (maxEl) maxEl.textContent = Number.isFinite(max) ? max + "MB" : "-";

    const zomEl = document.getElementById("zomBadge");
    if (zomEl) zomEl.textContent = Number.isFinite(zom) ? zom : "-";

    const rssEl = document.getElementById("rssBadge");
    if (rssEl) rssEl.textContent = Number.isFinite(rss) ? rss + "MB" : "-";

    const updatedEl = document.getElementById("statsUpdatedBadge");
    if (updatedEl) {
      updatedEl.textContent = `${t("card.game.statsUpdatedAt", "更新於:")} ${
        statsUpdatedAt ? formatDateTime(statsUpdatedAt) : "-"
      }`;
    }
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function computeGameRunning() {
    if (typeof S.current.gameRunning === "boolean")
      return !!S.current.gameRunning;
    return (
      D.stGame.classList.contains("ok") || D.stGame.classList.contains("warn")
    );
  }

  function syncConfigLockFromStatus() {
    if (D.cfgModal?.classList.contains("hidden")) return;
    const running = computeGameRunning();
    if (S.cfg.locked !== running) {
      S.cfg.locked = running;
      updateCfgLockUI();
    }
  }

  function setInstalledVersion(v) {
    if (v == null) {
      S.installedVersion = "";
      S.hasInstalled = false;
    } else {
      S.installedVersion = canonicalVersion(v);
      S.hasInstalled = true;
    }
    updateVersionLockUI();
  }

  function updateVersionLockUI() {
    if (!D.versionSelect) return;
    const selected = canonicalVersion(D.versionSelect.value || "");
    S.versionNeedsInstall = !S.hasInstalled
      ? true
      : selected !== S.installedVersion;

    if (D.installServerBtn) {
      D.installServerBtn.classList.remove("btn--attention");
    }

    const badgeEl =
      D.gameSelectedVersionBadge ||
      document.getElementById("gameSelectedVersionBadge");

    if (badgeEl) {
      const installed = S.installedVersion;
      if (installed) {
        badgeEl.textContent = t("card.game.lastInstallVersion", "上次安裝版本:") + " " + versionLabel(installed);
      } else {
        badgeEl.textContent = t("card.game.lastInstallVersionNone", "上次安裝版本: 無");
      }
      if (!D.gameSelectedVersionBadge) D.gameSelectedVersionBadge = badgeEl;
    }
  }

  function versionLabel(v) {
    if (!v) return "";
    if (v === "public") return "Stable (public)";
    return v;
  }

  function updateCfgLockUI() {
    const hideChecks = S.cfg.locked;
    if (D.cfgChecks) D.cfgChecks.classList.toggle("hidden", hideChecks);
    D.cfgLockBanner?.classList.toggle("hidden", !S.cfg.locked);

    const disableSave = S.cfg.locked || !S.cfg.lastCheck.passAll;
    setDisabled([D.cfgSaveBtn], disableSave);
    setDisabled([D.cfgSaveStartBtn], disableSave || S.versionNeedsInstall);

    disableCfgInputs(S.cfg.locked);
  }

  function disableCfgInputs(lock) {
    if (!D.cfgBody) return;
    const ctrls = D.cfgBody.querySelectorAll(
      "input, select, textarea, .cfg-combo select, .cfg-combo input, .cfg-enable"
    );
    ctrls.forEach((el) => (el.disabled = !!lock));
  }

  App.status = {
    applyUIState,
    computeGameRunning,
    syncConfigLockFromStatus,
    setInstalledVersion,
    updateVersionLockUI,
    updateCfgLockUI,
    disableCfgInputs,
    versionLabel,
  };

  if (w.__fragmentsReady) {
    setTimeout(updateVersionLockUI, 0);
  } else {
    w.addEventListener(
      "fragments:ready",
      () => {
        updateVersionLockUI();
      },
      { once: true }
    );
  }
})(window);