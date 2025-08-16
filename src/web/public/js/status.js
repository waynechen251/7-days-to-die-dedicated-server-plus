(function (w) {
  const App = (w.App = w.App || {});
  const { setDisabled, setBadge, canonicalVersion } = App.utils;
  const D = App.dom;
  const S = App.state;

  function applyUIState({ backendUp, steamRunning, gameRunning, telnetOk, gameVersion }) {
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
      D.gnSelect,
      D.exportGameNameBtn,
      D.refreshSavesBtn,
      D.viewBackupsBtn,
      D.backupSelect,
      D.importBackupBtn,
      D.importUploadFile,
      D.importUploadBtn,
    ];

    setBadge(D.stBackend, backendUp ? "ok" : "err");
    setBadge(D.stSteam, steamRunning ? "ok" : "err");
    const gameStatus = gameRunning ? (telnetOk ? "ok" : "warn") : "err";
    setBadge(D.stGame, gameStatus);
    setBadge(D.stTelnet, telnetOk ? "ok" : "err");

    setDisabled(all, false);

    if (!backendUp) {
      setDisabled(all, true);
      return;
    }
    if (steamRunning) {
      setDisabled(all, true);
      setDisabled([D.installServerBtn, D.viewConfigBtn], false);

      if (D.installServerBtn) {
        D.installServerBtn.textContent = "❌ 中斷安裝 / 更新";
        D.installServerBtn.setAttribute(
          "data-danger",
          "是否確定中斷安裝 / 更新?\n將不會正常退出，可能導致檔案損毀，請重新執行安裝 / 更新!"
        );
        D.installServerBtn.setAttribute("data-cancel-text", "取消");
        D.installServerBtn.setAttribute("data-continue-text", "繼續");
      }
      return;
    } else {
      if (D.installServerBtn) {
        D.installServerBtn.textContent = "📥 安裝 / 更新";
        D.installServerBtn.setAttribute(
          "data-danger",
          "是否確定安裝 / 更新伺服器?\nserverconfig.xml 將被重置"
        );
        D.installServerBtn.setAttribute("data-cancel-text", "取消");
        D.installServerBtn.setAttribute("data-continue-text", "繼續");
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

    const canManageSaves = !gameRunning && !lockBecauseBackup;
    setDisabled(
      [
        D.gwSelect,
        D.gnSelect,
        D.refreshSavesBtn,
        D.viewBackupsBtn,
        D.backupSelect,
        D.importBackupBtn,
        D.importUploadFile,
        D.importUploadBtn,
      ],
      !canManageSaves
    );

    syncConfigLockFromStatus();

    const gvEl = document.getElementById("gameVersionBadge");
    if (gvEl) {
      gvEl.textContent = `版本: ${
        gameVersion ? gameVersion : gameRunning ? "偵測中…" : "-"
      }`;
    }
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
        badgeEl.textContent = "上次安裝版本: " + versionLabel(installed);
      } else {
        badgeEl.textContent = "上次安裝版本: 無";
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
