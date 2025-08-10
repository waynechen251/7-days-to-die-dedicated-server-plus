(function (w) {
  const App = (w.App = w.App || {});
  const { fetchText, fetchJSON } = App.api;
  const { switchTab, appendLog } = App.console;
  const { setInstalledVersion, updateVersionLockUI, applyUIState } = App.status;
  const { canonicalVersion } = App.utils;
  const D = App.dom;
  const S = App.state;

  document.querySelectorAll(".console-tabs button").forEach((btn) => {
    const tab = btn.dataset.tab;
    btn.addEventListener("click", () => switchTab(tab));
  });

  D.installServerBtn.addEventListener("click", () => {
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

  D.abortInstallBtn.addEventListener("click", async () => {
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

  D.viewConfigBtn.addEventListener("click", async () => {
    switchTab("system");
    try {
      appendLog(
        "system",
        await fetchText("/api/view-config", { method: "POST" }),
        Date.now()
      );
    } catch (e) {
      appendLog("system", `❌ ${e.message}`, Date.now());
    }
  });

  D.startServerBtn.addEventListener("click", () =>
    App.configModal.openConfigModal(true)
  );
  D.editConfigBtn?.addEventListener("click", () =>
    App.configModal.openConfigModal(false)
  );

  D.stopServerBtn.addEventListener("click", async () => {
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

  D.killServerBtn.addEventListener("click", async () => {
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
  D.telnetSendBtn.addEventListener("click", () => {
    const cmd = (D.telnetInput.value || "").trim();
    if (!cmd) return;
    D.telnetInput.value = "";
    sendTelnet(cmd);
  });
  w.sendTelnet = sendTelnet;

  D.refreshSavesBtn.addEventListener("click", () => App.saves.loadSaves());
  D.viewBackupsBtn.addEventListener("click", async () => {
    switchTab("backup");
    try {
      const msg = await fetchText("/api/view-saves", { method: "POST" });
      appendLog("backup", msg, Date.now());
    } catch (e) {
      appendLog("backup", `❌ ${e.message}`, Date.now());
    }
  });

  D.exportOneBtn.addEventListener("click", async () => {
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

  D.importBackupBtn.addEventListener("click", async () => {
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
    } catch (e) {
      appendLog("backup", `❌ ${e.message}`, Date.now());
    }
  });

  D.importUploadBtn.addEventListener("click", async () => {
    const f = D.importUploadFile.files?.[0];
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
    } catch (e) {
      appendLog("backup", `❌ ${e.message}`, Date.now());
    } finally {
      D.importUploadFile.value = "";
    }
  });

  D.backupFullBtn.addEventListener("click", async () => {
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

  D.versionSelect?.addEventListener("change", () => {
    updateVersionLockUI();
  });

  D.gwSelect?.addEventListener("change", () =>
    App.saves.fillNamesFor(D.gwSelect.value)
  );

  App.actions = { sendTelnet };
})(window);
