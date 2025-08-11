(function (w) {
  const App = (w.App = w.App || {});
  const { setDisabled, setBadge, canonicalVersion } = App.utils;
  const D = App.dom;
  const S = App.state;

  function applyUIState({ backendUp, steamRunning, gameRunning, telnetOk }) {
    const all = [
      D.installServerBtn,
      D.abortInstallBtn,
      D.backupFullBtn,
      D.viewConfigBtn,
      D.startServerBtn,
      D.stopServerBtn,
      D.killServerBtn,
      D.versionSelect,
      D.telnetInput,
      D.telnetSendBtn,
      ...D.telnetBtns,
      D.gwSelect,
      D.gnSelect,
      D.exportOneBtn,
      D.refreshSavesBtn,
      D.viewBackupsBtn,
      D.backupSelect,
      D.importBackupBtn,
      D.importUploadFile,
      D.importUploadBtn,
      D.editConfigBtn,
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
      setDisabled([D.abortInstallBtn, D.viewConfigBtn], false);
      return;
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
    setDisabled(D.backupFullBtn, gameRunning || lockBecauseBackup);
    setDisabled(D.exportOneBtn, gameRunning || lockBecauseBackup);

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
    if (!D.versionSelect || !D.startServerBtn) return;
    const selected = canonicalVersion(D.versionSelect.value || "");
    S.versionNeedsInstall = !S.hasInstalled
      ? true
      : selected !== S.installedVersion;

    if (!S.current.steamRunning && !S.backupInProgress) {
      if (S.versionNeedsInstall) {
        D.startServerBtn.disabled = true;
        D.startServerBtn.title = "此版本尚未安裝，請先按『安裝/更新』";
        D.installServerBtn?.classList.add("btn--attention");
      } else {
        D.startServerBtn.title = "";
        D.installServerBtn?.classList.remove("btn--attention");
      }
    }
  }

  function updateCfgLockUI() {
    const startIntent = !!S.cfg.startIntent;
    const hideChecks = startIntent || S.cfg.locked;
    if (D.cfgChecks) D.cfgChecks.classList.toggle("hidden", hideChecks);

    D.cfgLockBanner?.classList.toggle("hidden", !S.cfg.locked);

    const disableBecause =
      S.cfg.locked || (!startIntent && !S.cfg.lastCheck.passAll);
    setDisabled([D.cfgSaveBtn, D.cfgSaveStartBtn], disableBecause);

    disableCfgInputs(S.cfg.locked);
  }

  function disableCfgInputs(lock) {
    if (!D.cfgBody) return;
    const ctrls = D.cfgBody.querySelectorAll(
      "input, select, textarea, .cfg-combo select, .cfg-combo input"
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
  };
})(window);
