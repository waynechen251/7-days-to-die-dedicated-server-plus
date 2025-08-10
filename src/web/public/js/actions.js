(function (w) {
  const App = (w.App = w.App || {});
  const { fetchText, fetchJSON } = App.api;
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
      const version = D.versionSelect?.value || "";
      const body = JSON.stringify({ version });
      const headers = { "Content-Type": "application/json" };

      fetch("/api/install", { method: "POST", body, headers })
        .then((res) => {
          if (!res.body) throw new Error("串流初始化失敗");
          applyUIState({
            backendUp: true,
            steamRunning: true,
            gameRunning: S.current.gameRunning,
            telnetOk: S.current.telnetOk,
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

    on(D.abortInstallBtn, "click", async () => {
      switchTab("steamcmd");
      try {
        appendLog(
          "steamcmd",
          await fetchText("/api/install-abort", { method: "POST" }),
          Date.now()
        );
      } catch (e) {
        appendLog("system", `❌ ${e.message}`, Date.now());
      }
    });

    on(D.startServerBtn, "click", () => App.configModal.openConfigModal(true));
    on(D.editConfigBtn, "click", () => App.configModal.openConfigModal(false));

    on(D.stopServerBtn, "click", async () => {
      switchTab("system");
      try {
        appendLog(
          "system",
          await fetchText("/api/stop", { method: "POST" }),
          Date.now()
        );
      } catch (e) {
        appendLog("system", `❌ ${e.message}`, Date.now());
      }
    });

    on(D.killServerBtn, "click", async () => {
      switchTab("system");
      try {
        appendLog(
          "system",
          await fetchText("/api/kill", { method: "POST" }),
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

    on(D.refreshSavesBtn, "click", () => App.saves.loadSaves());

    on(D.viewBackupsBtn, "click", async () => {
      switchTab("backup");
      try {
        const msg = await fetchText("/api/view-saves", { method: "POST" });
        appendLog("backup", msg, Date.now());
      } catch (e) {
        appendLog("backup", `❌ ${e.message}`, Date.now());
      }
    });

    on(D.exportOneBtn, "click", async () => {
      const world = D.gwSelect.value || "";
      const name = D.gnSelect.value || "";
      if (!world || !name) {
        appendLog("backup", "❌ 請選擇 GameWorld / GameName", Date.now());
        return;
      }
      switchTab("backup");
      S.backupInProgress = true;
      applyUIState(S.current);
      try {
        const msg = await fetchText("/api/saves/export-one", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ world, name }),
        });
        appendLog("backup", msg, Date.now());
        App.saves.loadSaves();
      } catch (e) {
        appendLog("backup", `❌ ${e.message}`, Date.now());
      } finally {
        S.backupInProgress = false;
        applyUIState(S.current);
      }
    });

    on(D.importBackupBtn, "click", async () => {
      const file = D.backupSelect.value || "";
      if (!file) {
        appendLog("backup", "❌ 請選擇備份檔", Date.now());
        return;
      }
      switchTab("backup");
      try {
        const msg = await fetchText("/api/saves/import-backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file }),
        });
        appendLog("backup", msg, Date.now());
        App.saves.loadSaves();
      } catch (e) {
        appendLog("backup", `❌ ${e.message}`, Date.now());
      }
    });

    on(D.importUploadBtn, "click", async () => {
      const f = D.importUploadFile?.files?.[0];
      if (!f) {
        appendLog("backup", "❌ 請選擇要上傳的 ZIP 檔", Date.now());
        return;
      }
      switchTab("backup");
      try {
        const msg = await fetchText(
          `/api/saves/import-upload?filename=${encodeURIComponent(f.name)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: f,
          }
        );
        appendLog("backup", msg, Date.now());
        App.saves.loadSaves();
      } catch (e) {
        appendLog("backup", `❌ ${e.message}`, Date.now());
      } finally {
        if (D.importUploadFile) D.importUploadFile.value = "";
      }
    });

    on(D.backupFullBtn, "click", async () => {
      switchTab("backup");
      S.backupInProgress = true;
      applyUIState(S.current);
      try {
        const msg = await fetchText("/api/backup", { method: "POST" });
        appendLog("backup", msg, Date.now());
        App.saves.loadSaves();
      } catch (e) {
        appendLog("backup", `❌ ${e.message}`, Date.now());
      } finally {
        S.backupInProgress = false;
        applyUIState(S.current);
      }
    });

    on(D.versionSelect, "change", () => updateVersionLockUI());

    on(D.gwSelect, "change", () => App.saves.fillNamesFor(D.gwSelect.value));

    App.actions = { sendTelnet };
  }

  if (w.__fragmentsReady) {
    bindAll();
  } else {
    w.addEventListener("fragments:ready", bindAll, { once: true });
  }
})(window);
