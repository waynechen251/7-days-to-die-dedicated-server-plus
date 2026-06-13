(function (w) {
  const App = (w.App = w.App || {});
  const { fetchText, fetchJSON, saves: savesApi } = App.api;
  const { switchTab, appendLog } = App.console;
  const { setInstalledVersion, updateVersionLockUI, applyUIState } = App.status;
  const { canonicalVersion } = App.utils;
  const S = App.state;

  function on(el, evt, handler, opts) {
    if (!el) return;
    const key = "__bound_" + evt;
    if (el[key]) return;
    el.addEventListener(evt, handler, opts);
    el[key] = true;
  }

  function bindAll() {
    App.dom.refresh();
    const D = App.dom;

    document.querySelectorAll(".console-tabs button").forEach((btn) => {
      const tab = btn.dataset.tab;
      on(btn, "click", () => switchTab(tab));
    });

    on(D.installServerBtn, "click", () => {
      switchTab("steamcmd");

      if (App.state.current?.steamRunning) {
        fetchText("/api/install-abort", { method: "POST" })
          .then((msg) => appendLog("steamcmd", msg, Date.now()))
          .catch((err) =>
            appendLog("steamcmd", `❌ ${err.message}`, Date.now())
          )
          .finally(() => setTimeout(App.bootstrap.refreshStatus, 500));
        return;
      }

      const version = D.versionSelect?.value || "";
      const body = JSON.stringify({ version });
      const headers = { "Content-Type": "application/json" };

      fetch("/api/install", { method: "POST", body, headers })
        .then((res) => {
          if (!res.body) throw new Error(App.i18n ? App.i18n.t("messages.streamInitFailed") : "串流初始化失敗");
          applyUIState({
            backendUp: true,
            steamRunning: true,
            gameRunning: App.state.current.gameRunning,
            telnetOk: App.state.current.telnetOk,
          });
          return res.body.getReader();
        })
        .then((reader) => {
          const decoder = new TextDecoder();
          const pump = () =>
            reader.read().then(({ done, value }) => {
              if (done) {
                const finishedRaw = D.versionSelect?.value || "";
                const finished = canonicalVersion(finishedRaw);
                setInstalledVersion(finished);
                setTimeout(App.bootstrap.refreshStatus, 500);
                return;
              }
              appendLog("steamcmd", decoder.decode(value), Date.now());
              pump();
            });
          pump();
        })
        .catch((err) => appendLog("system", `❌ ${err.message}`, Date.now()));
    });

    on(D.configStartBtn, "click", () => {
      if (App.configModal?.openConfigModal) {
        App.configModal.openConfigModal();
        return;
      }
      if (typeof App.openConfigModal === "function") {
        App.openConfigModal();
        return;
      }
      console.warn("configModal 尚未初始化，將延遲重試");
      setTimeout(() => {
        if (App.configModal?.openConfigModal) {
          App.configModal.openConfigModal();
        } else {
          console.error("configModal 仍未就緒");
          alert(App.i18n ? App.i18n.t("messages.configModalNotReady") : "設定視窗尚未載入，請稍候再試或重新整理頁面。");
        }
      }, 300);
    });

    on(D.stopServerBtn, "click", async () => {
      try {
        appendLog("game", "⏳ 正在發送關閉伺服器指令...", Date.now());
        appendLog(
          "game",
          await fetchText("/api/stop", { method: "POST" }),
          Date.now()
        );
        setTimeout(() => App.bootstrap?.refreshStatus?.(), 250);
      } catch (e) {
        appendLog("system", `❌ ${e.message}`, Date.now());
      }
    });

    on(D.killServerBtn, "click", async () => {
      try {
        appendLog(
          "game",
          await fetchText("/api/processManager/game_server/kill", { method: "POST" }),
          Date.now()
        );
      } catch (e) {
        appendLog("system", `❌ ${e.message}`, Date.now());
      }
    });

    function sendTelnet(cmd) {
      switchTab("telnet");
      fetch("/api/telnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      })
        .then((r) => r.text())
        .then((t) => appendLog("telnet", t, Date.now()))
        .catch((e) => appendLog("telnet", `❌ ${e.message}`, Date.now()));
    }
    on(D.telnetSendBtn, "click", () => {
      const cmd = (D.telnetInput.value || "").trim();
      if (!cmd) return;
      D.telnetInput.value = "";
      sendTelnet(cmd);
    });
    w.sendTelnet = sendTelnet;

    async function runSaveTask(task, options = {}) {
      const { lock = true, clearInput = null, reload = true } = options;
      switchTab("backup");
      if (lock) {
        S.backupInProgress = true;
        applyUIState(S.current);
      }
      try {
        const msg = await task();
        appendLog("backup", msg, Date.now());
        if (reload) {
          await App.saves.loadSaves();
        }
      } catch (e) {
        appendLog("backup", `❌ ${e.message}`, Date.now());
      } finally {
        if (clearInput) clearInput.value = "";
        if (lock) {
          S.backupInProgress = false;
          applyUIState(S.current);
        }
      }
    }

    function getSelectedSave() {
      const world = S.selectedWorld || "";
      const name = S.selectedName || "";
      if (!world || !name) {
        appendLog("backup", `❌ ${App.i18n ? App.i18n.t("messages.selectWorldName") : "請選擇 GameWorld / GameName"}`, Date.now());
        return null;
      }
      return { world, name };
    }

    function getSelectedBackup(selectEl) {
      const file = selectEl?.value || "";
      if (!file) {
        appendLog("backup", `❌ ${App.i18n ? App.i18n.t("messages.selectBackup") : "請選擇備份檔"}`, Date.now());
        return "";
      }
      return file;
    }

    on(D.refreshSavesBtn, "click", () => App.saves.loadSaves());

    on(D.exportGameNameBtn, "click", async () => {
      const selected = getSelectedSave();
      if (!selected) return;
      await runSaveTask(() => savesApi.exportSingle(selected.world, selected.name));
    });

    on(D.importFullBackupBtn, "click", async () => {
      const file = getSelectedBackup(D.fullBackupSelect);
      if (!file) return;
      await runSaveTask(() => savesApi.importBackup("full", file));
    });

    on(D.importSingleBackupBtn, "click", async () => {
      const file = getSelectedBackup(D.singleBackupSelect);
      if (!file) return;
      await runSaveTask(() => savesApi.importBackup("single", file));
    });

    on(D.importFullUploadBtn, "click", async () => {
      const f = D.fullImportUploadFile?.files?.[0];
      if (!f) {
        appendLog("backup", `❌ ${App.i18n ? App.i18n.t("messages.selectZipFile") : "請選擇要上傳的 ZIP 檔"}`, Date.now());
        return;
      }
      await runSaveTask(() => savesApi.importUpload("full", f), {
        clearInput: D.fullImportUploadFile,
      });
    });

    on(D.importSingleUploadBtn, "click", async () => {
      const f = D.singleImportUploadFile?.files?.[0];
      if (!f) {
        appendLog("backup", `❌ ${App.i18n ? App.i18n.t("messages.selectZipFile") : "請選擇要上傳的 ZIP 檔"}`, Date.now());
        return;
      }
      await runSaveTask(() => savesApi.importUpload("single", f), {
        clearInput: D.singleImportUploadFile,
      });
    });

    on(D.exportSavesBtn, "click", async () => {
      await runSaveTask(() => savesApi.exportFull());
    });

    on(D.deleteGameNameBtn, "click", async () => {
      const selected = getSelectedSave();
      if (!selected) return;
      await runSaveTask(() => savesApi.deleteSingle(selected.world, selected.name));
    });

    on(D.deleteFullBackupBtn, "click", async () => {
      const file = getSelectedBackup(D.fullBackupSelect);
      if (!file) return;
      await runSaveTask(() => savesApi.deleteBackup(file));
    });

    on(D.deleteSingleBackupBtn, "click", async () => {
      const file = getSelectedBackup(D.singleBackupSelect);
      if (!file) return;
      await runSaveTask(() => savesApi.deleteBackup(file));
    });

    on(D.versionSelect, "change", () => updateVersionLockUI());

    on(D.gwSelect, "change", () => {
      S.selectedWorld = D.gwSelect.value || "";
      D.gwSelect.title = S.selectedWorld || (App.i18n ? App.i18n.t("common.none") : "(無)");
      S.selectedName = "";
      App.saves.fillNamesFor(S.selectedWorld);
    });

    on(D.applyActiveSaveBtn, "click", async () => {
      const world = S.selectedWorld || "";
      const name = S.selectedName || "";
      if (!world || !name) {
        appendLog("backup", `❌ ${App.i18n ? App.i18n.t("messages.selectWorldName") : "請選擇 GameWorld / GameName"}`, Date.now());
        return;
      }
      switchTab("backup");
      try {
        await App.saves.applyActiveSave();
        appendLog("backup", `✅ ${App.i18n ? App.i18n.t("messages.activeSaveApplied", { world, name }) : `已切換使用中存檔: ${world} / ${name}`}`, Date.now());
      } catch (e) {
        appendLog("backup", `❌ ${e.message}`, Date.now());
      }
    });

    App.actions = { sendTelnet };
  }

  if (w.__fragmentsReady) {
    bindAll();
  } else {
    w.addEventListener("fragments:ready", bindAll, { once: true });
  }
})(window);
