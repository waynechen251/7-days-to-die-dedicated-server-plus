(function (w) {
  const App = (w.App = w.App || {});
  const $ = (id) => document.getElementById(id);

  function buildDom() {
    return {
      installServerBtn: $("installServerBtn"),
      viewConfigBtn: $("viewConfigBtn"),
      configStartBtn: $("configStartBtn"),
      stopServerBtn: $("stopServerBtn"),
      killServerBtn: $("killServerBtn"),
      versionSelect: $("versionSelect"),
      versionSourceBadge: $("versionSourceBadge"),
      gameSelectedVersionBadge: $("gameSelectedVersionBadge"),
      currentProfileBadge: $("currentProfileBadge"),
      gameRuntimeSection: $("gameRuntimeSection"),
      telnetInput: $("telnetInput"),
      telnetSendBtn: $("telnetSendBtn"),
      telnetBtns: Array.from(
        document.querySelectorAll('button[data-role="telnet"]')
      ),
      gwSelect: $("gwSelect"),
      gnList: $("gnList"),
      exportGameNameBtn: $("exportGameNameBtn"),
      applyActiveSaveBtn: $("applyActiveSaveBtn"),
      refreshSavesBtn: $("refreshSavesBtn"),
      fullBackupSelect: $("fullBackupSelect"),
      importFullBackupBtn: $("importFullBackupBtn"),
      deleteFullBackupBtn: $("deleteFullBackupBtn"),
      fullImportUploadFile: $("fullImportUploadFile"),
      importFullUploadBtn: $("importFullUploadBtn"),
      singleBackupSelect: $("singleBackupSelect"),
      importSingleBackupBtn: $("importSingleBackupBtn"),
      deleteSingleBackupBtn: $("deleteSingleBackupBtn"),
      singleImportUploadFile: $("singleImportUploadFile"),
      importSingleUploadBtn: $("importSingleUploadBtn"),
      stBackend: $("st-backend"),
      stSteam: $("st-steam"),
      stGame: $("st-game"),
      stTelnet: $("st-telnet"),
      exportSavesBtn: $("exportSavesBtn"),
      deleteGameNameBtn: $("deleteGameNameBtn"),
      cfgModal: $("cfgModal"),
      cfgBody: $("cfgBody"),
      cfgChecks: $("cfgChecks"),
      cfgCloseBtn: $("cfgCloseBtn"),
      cfgCancelBtn: $("cfgCancelBtn"),
      cfgSaveBtn: $("cfgSaveBtn"),
      cfgSaveStartBtn: $("cfgSaveStartBtn"),
      cfgLockBanner: $("cfgLockBanner"),
      cfgProfileBar: $("cfgProfileBar"),
      cfgProfileSelect: $("cfgProfileSelect"),
      cfgProfileCreateBtn: $("cfgProfileCreateBtn"),
      cfgProfileRenameBtn: $("cfgProfileRenameBtn"),
      cfgProfileDeleteBtn: $("cfgProfileDeleteBtn"),
      cfgProfileInfo: $("cfgProfileInfo"),

      appMask: $("appMask"),

      splitResizer: $("splitResizer"),
      appSplit: document.querySelector(".app-split"),
      paneMainEl: document.querySelector(".pane-main"),
      paneConsoleEl: document.querySelector(".pane-console"),
      consoleCollapseBtn: $("consoleCollapseBtn"),
      consoleCollapseText: $("consoleCollapseText"),
      consoleCollapseIcon: $("consoleCollapseIcon"),
      consolePanesEl: $("consolePanes"),

      panes: {
        system: $("console-system"),
        steamcmd: $("console-steamcmd"),
        game: $("console-game"),
        telnet: $("console-telnet"),
        backup: $("console-backup"),
      },

      tabBtns: (() => {
        const map = {};
        document.querySelectorAll(".console-tabs button").forEach((btn) => {
          map[btn.dataset.tab] = btn;
        });
        return map;
      })(),

      updateBadge: $("updateBadge"),

      fwStatusBadge: $("fw-status-badge"),
      fwApplyBtn: $("fw-apply-btn"),
      fwRemoveBtn: $("fw-remove-btn"),
      fwRefreshBtn: $("fw-refresh-btn"),
      fwToggleAutoManage: $("fw-toggle-auto-manage"),
      fwToggleRemoveOnStop: $("fw-toggle-remove-on-stop"),
      fwToggleGamePorts: $("fw-toggle-game-ports"),
      fwToggleMgmtPorts: $("fw-toggle-mgmt-ports"),
      fwElevationWarn: $("fw-elevation-warn"),
      fwPlatformWarn: $("fw-platform-warn"),
    };
  }

  const initial = buildDom();
  App.dom = Object.assign(App.dom || {}, initial);

  App.dom.refresh = function refreshDom() {
    const next = buildDom();
    for (const k of Object.keys(next)) {
      App.dom[k] = next[k];
    }
  };
})(window);
