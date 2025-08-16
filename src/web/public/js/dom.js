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
      telnetInput: $("telnetInput"),
      telnetSendBtn: $("telnetSendBtn"),
      telnetBtns: Array.from(
        document.querySelectorAll('button[data-role="telnet"]')
      ),
      gwSelect: $("gwSelect"),
      gnSelect: $("gnSelect"),
      exportGameNameBtn: $("exportGameNameBtn"),
      refreshSavesBtn: $("refreshSavesBtn"),
      viewBackupsBtn: $("viewBackupsBtn"),
      backupSelect: $("backupSelect"),
      importBackupBtn: $("importBackupBtn"),
      importUploadFile: $("importUploadFile"),
      importUploadBtn: $("importUploadBtn"),
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

      appMask: $("appMask"),

      splitResizer: $("splitResizer"),
      appSplit: document.querySelector(".app-split"),
      paneMainEl: document.querySelector(".pane-main"),

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

      deleteBackupBtn: document.getElementById("deleteBackupBtn"),
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
