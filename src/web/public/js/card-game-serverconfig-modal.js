(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON, fetchText, profiles: profilesApi } = App.api;
  const { decideType, escapeHTML } = App.utils;
  let D = App.dom;
  const S = App.state;

  const t = (key, def, params) => (App.i18n ? App.i18n.t(key, params) : def || key);

  function ensureDom() {
    if (!D.cfgBody || !D.cfgModal) {
      App.dom.refresh();
      D = App.dom;
    }
  }

  function getSelectedVersionValue() {
    return D.versionSelect?.value || "";
  }

  function setModalLoading() {
    if (D.cfgBody) {
      D.cfgBody.innerHTML =
        `<div style='padding:8px;font-size:0.75rem;'>${t("common.loading", "讀取中...")}</div>`;
    }
  }

  function setProfileStore(store) {
    if (App.status?.setProfileStore) {
      App.status.setProfileStore(store);
      return;
    }
    S.profileStore = {
      buildId: store?.buildId || null,
      buildLabel: store?.buildLabel || "",
      buildTag: store?.buildTag || "",
      activeProfileId: store?.activeProfileId || null,
      activeProfile: store?.activeProfile || null,
      lastStartedProfileId: store?.lastStartedProfileId || null,
      lastStartedProfile: store?.lastStartedProfile || null,
      initialProfileId: store?.initialProfileId || null,
      profiles: Array.isArray(store?.profiles) ? store.profiles : [],
    };
  }

  function getActiveProfile() {
    const activeId = S.cfg.activeProfileId || S.profileStore?.activeProfileId;
    return (
      S.profileStore?.profiles?.find((profile) => profile.id === activeId) ||
      S.profileStore?.activeProfile ||
      null
    );
  }

  function renderProfileInfo(activeId, profiles) {
    ensureDom();
    if (!D.cfgProfileInfo) return;
    const selectedProfile =
      profiles.find((profile) => profile.id === activeId) || getActiveProfile();
    const lastStartedProfile =
      profiles.find((profile) => profile.id === S.profileStore?.lastStartedProfileId) ||
      S.profileStore?.lastStartedProfile ||
      null;
    const versionLabel =
      S.cfg.profile?.buildTag ||
      S.cfg.profile?.buildLabel ||
      getSelectedVersionValue() ||
      "-";
    const countLabel = t("modal.serverconfig.profileCountValue", "{count} 筆", {
      count: profiles.length,
    });
    const lastStartedLabel =
      lastStartedProfile?.displayName ||
      lastStartedProfile?.name ||
      t("modal.serverconfig.profileLastStartedNone", "尚未啟動");
    const selectedLabel =
      selectedProfile?.displayName ||
      selectedProfile?.name ||
      t("common.none", "無");

    D.cfgProfileInfo.innerHTML = [
      {
        label: t("modal.serverconfig.profileInfoSelected", "目前選取"),
        value: escapeHTML(selectedLabel),
      },
      {
        label: t("modal.serverconfig.profileInfoLastStarted", "上次啟動"),
        value: escapeHTML(lastStartedLabel),
      },
      {
        label: t("modal.serverconfig.profileInfoCount", "設定檔數"),
        value: escapeHTML(countLabel),
      },
      {
        label: t("modal.serverconfig.profileInfoVersion", "版本"),
        value: escapeHTML(versionLabel),
      },
    ]
      .map(
        (item) =>
          `<div class="cfg-profile-info__item"><div class="cfg-profile-info__label">${item.label}</div><div class="cfg-profile-info__value">${item.value}</div></div>`
      )
      .join("");
    D.cfgProfileInfo.title = S.profileStore?.buildId
      ? `BuildID: ${S.profileStore.buildId}`
      : "";
  }

  function renderChecksPanel(results) {
    const safeResults = Array.isArray(results) ? results : [];
    const okCount = safeResults.filter((item) => item?.ok === true).length;
    const warnCount = safeResults.filter((item) => item?.ok === "warn").length;
    const errCount = safeResults.filter((item) => item?.ok === false).length;
    const icon = (ok) => (ok === true ? "✅" : ok === "warn" ? "⚠️" : "❌");
    const stateClass = (ok) => (ok === true ? "ok" : ok === "warn" ? "warn" : "err");

    return (
      `<div class="cfg-checks__panel">` +
      `<div class="cfg-checks__header">` +
      `<div class="cfg-checks__title">${escapeHTML(
        t("modal.serverconfig.preStartCheck", "啟動前檢查")
      )}</div>` +
      `<div class="cfg-checks__summary">` +
      `<span class="cfg-checks__summary-pill cfg-checks__summary-pill--ok">✅ ${okCount}</span>` +
      `<span class="cfg-checks__summary-pill cfg-checks__summary-pill--warn">⚠️ ${warnCount}</span>` +
      `<span class="cfg-checks__summary-pill cfg-checks__summary-pill--err">❌ ${errCount}</span>` +
      `</div>` +
      `</div>` +
      `<ul class="cfg-checks__list">${safeResults
        .map(
          (item) =>
            `<li class="check-item ${stateClass(item.ok)}">` +
            `<span class="check-item__icon">${icon(item.ok)}</span>` +
            `<span class="check-item__text">${escapeHTML(item.text || "")}</span>` +
            `</li>`
        )
        .join("")}</ul>` +
      `</div>`
    );
  }

  function getFieldLabelKey(name) {
    return `modal.serverconfig.fields.${name}.label`;
  }

  function resolveFieldLabel(name) {
    if (!name) return "";
    if (!App.i18n?.t) return name;
    const key = getFieldLabelKey(name);
    const translated = App.i18n.t(key);
    return translated && translated !== key ? translated : name;
  }

  function createHintNode(description) {
    const text = String(
      description || t("modal.serverconfig.noDescription", "無說明")
    );
    const wrap = document.createElement("span");
    wrap.className = "cfg-hint-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cfg-hint";
    button.textContent = "?";
    button.setAttribute("aria-label", text);

    const bubble = document.createElement("span");
    bubble.className = "cfg-hint__bubble";
    bubble.textContent = text;

    wrap.appendChild(button);
    wrap.appendChild(bubble);
    return wrap;
  }

  function normalizeCheckFieldName(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    return raw.replace(/\+\d+$/, "");
  }

  function collectFieldStates(results) {
    const states = new Map();
    (Array.isArray(results) ? results : []).forEach((result) => {
      if (!result || result.ok === true) return;
      const severity = result.ok === false ? "err" : "warn";
      const fields = Array.isArray(result.fields) ? result.fields : [];
      fields
        .map(normalizeCheckFieldName)
        .filter(Boolean)
        .forEach((fieldName) => {
          const prev = states.get(fieldName);
          if (prev === "err") return;
          states.set(fieldName, prev === "warn" || severity === "warn" ? severity : "err");
          if (severity === "err") states.set(fieldName, "err");
        });
    });
    return states;
  }

  function applyFieldCheckStates(results) {
    ensureDom();
    const states = collectFieldStates(results);
    D.cfgBody.querySelectorAll(".cfg-field").forEach((field) => {
      const name = field.dataset.fieldName || "";
      field.classList.remove("cfg-field--warn", "cfg-field--err");
      if (!name) return;
      const state = states.get(name);
      if (state === "warn") field.classList.add("cfg-field--warn");
      else if (state === "err") field.classList.add("cfg-field--err");
    });
  }

  function renderProfileBar() {
    ensureDom();
    if (!D.cfgProfileBar || !D.cfgProfileSelect) return;
    const readOnly = !!S.cfg.locked || !!App.auth?.isViewer?.();

    const profiles = Array.isArray(S.profileStore?.profiles)
      ? S.profileStore.profiles
      : [];
    const activeId = S.cfg.activeProfileId || S.profileStore?.activeProfileId || "";
    const deleteLocked = profiles.length <= 1;

    D.cfgProfileBar.classList.remove("hidden");
    D.cfgProfileSelect.innerHTML = profiles
      .map((profile) => {
        const label = escapeHTML(
          profile.displayName || profile.name || profile.id || ""
        );
        const selected = profile.id === activeId ? " selected" : "";
        return `<option value="${escapeHTML(profile.id)}"${selected}>${label}</option>`;
      })
      .join("");
    D.cfgProfileSelect.disabled = readOnly || profiles.length === 0;
    renderProfileInfo(activeId, profiles);

    if (D.cfgProfileCreateBtn) {
      D.cfgProfileCreateBtn.title = t(
        "modal.serverconfig.profileCreate",
        "建立新配置"
      );
      D.cfgProfileCreateBtn.disabled = readOnly;
    }
    if (D.cfgProfileRenameBtn) {
      D.cfgProfileRenameBtn.title = t(
        "modal.serverconfig.profileRename",
        "重新命名目前配置"
      );
      D.cfgProfileRenameBtn.disabled = readOnly || !activeId;
    }
    if (D.cfgProfileDeleteBtn) {
      D.cfgProfileDeleteBtn.title = deleteLocked
        ? t(
            "modal.serverconfig.profileDeleteDisabled",
            "至少保留一筆設定檔，無法刪除最後一筆"
          )
        : t("modal.serverconfig.profileDelete", "刪除目前配置");
      D.cfgProfileDeleteBtn.disabled = readOnly || !activeId || deleteLocked;
    }
  }

  function buildProfileSnapshot() {
    const { values, enables } = readCfgValuesFromUI();
    const snapshot = {
      values: {},
      commented: {},
    };

    Object.keys(values).forEach((name) => {
      snapshot.values[name] = normalizeValueForWrite(name, values[name]);
      snapshot.commented[name] = !enables[name];
    });

    return snapshot;
  }

  function collectPendingConfigChanges() {
    const { values, enables } = readCfgValuesFromUI();
    const snapshot = buildProfileSnapshot();
    const updates = {};
    const toggles = {};
    let changed = 0;
    let toggleChanged = 0;

    Object.keys(values).forEach((name) => {
      if (!enables[name]) return;
      const newVal = normalizeValueForWrite(name, values[name]);
      const oldVal = S.cfg.original?.get(name) ?? "";
      if (String(newVal) !== String(oldVal)) {
        updates[name] = newVal;
        changed++;
      }
    });

    if (S.cfg.commentedOriginal) {
      Object.keys(enables).forEach((name) => {
        const oldCommented = S.cfg.commentedOriginal.get(name);
        const newCommented = !enables[name];
        if (oldCommented !== newCommented) {
          toggles[name] = enables[name];
          toggleChanged++;
        }
      });
    }

    return {
      values,
      enables,
      snapshot,
      updates,
      toggles,
      changed,
      toggleChanged,
      hasChanges: changed > 0 || toggleChanged > 0,
    };
  }

  async function confirmDiscardUnsavedChanges() {
    const pending = collectPendingConfigChanges();
    if (!pending.hasChanges) return true;

    const summary = buildChangeSummary({
      updates: pending.updates,
      toggles: pending.toggles,
      enables: pending.enables,
    });

    return window.DangerConfirm
      ? window.DangerConfirm.showConfirm(
          t(
            "confirm.switchProfileWithUnsaved",
            "{summary}\n\n切換設定檔會放棄尚未保存的變更，是否仍要繼續？",
            { summary }
          ),
          {
            title: t(
              "confirm.switchProfileWithUnsavedTitle",
              "尚有未保存的設定變更"
            ),
            continueText: t("common.confirm", "繼續"),
            cancelText: t("common.cancel", "取消"),
          }
        )
      : Promise.resolve(
          window.confirm(
            t(
              "confirm.switchProfileWithUnsavedFallback",
              "切換設定檔會放棄尚未保存的變更，是否仍要繼續？"
            )
          )
        );
  }

  function bindButtons() {
    ensureDom();
    if (D.cfgCloseBtn && !D.cfgCloseBtn.__bound_closeCfg) {
      D.cfgCloseBtn.addEventListener("click", closeCfgModal);
      D.cfgCloseBtn.__bound_closeCfg = true;
    }
    if (D.cfgCancelBtn && !D.cfgCancelBtn.__bound_cancelCfg) {
      D.cfgCancelBtn.addEventListener("click", closeCfgModal);
      D.cfgCancelBtn.__bound_cancelCfg = true;
    }
    if (D.cfgSaveBtn && !D.cfgSaveBtn.__bound_saveCfg) {
      D.cfgSaveBtn.addEventListener("click", () => saveConfigValues(false));
      D.cfgSaveBtn.__bound_saveCfg = true;
    }
    if (D.cfgSaveStartBtn && !D.cfgSaveStartBtn.__bound_saveStartCfg) {
      D.cfgSaveStartBtn.addEventListener("click", () => saveConfigValues(true));
      D.cfgSaveStartBtn.__bound_saveStartCfg = true;
    }

    const loadBtn =
      D.cfgLoadAdminBtn || document.getElementById("cfgLoadAdminBtn");
    if (loadBtn && !loadBtn.__bound_loadAdmin) {
      loadBtn.addEventListener("click", loadAdminGameServerConfig);
      loadBtn.__bound_loadAdmin = true;
    }

    if (D.cfgProfileSelect && !D.cfgProfileSelect.__bound_profileSelect) {
      D.cfgProfileSelect.addEventListener("change", async (e) => {
        const profileId = e.target.value || "";
        if (!profileId) return;
        const previousProfileId =
          S.cfg.activeProfileId || S.profileStore?.activeProfileId || "";
        if (profileId === previousProfileId) return;
        try {
          const proceed = await confirmDiscardUnsavedChanges();
          if (!proceed) {
            e.target.value = previousProfileId;
            return;
          }
          const result = await profilesApi.select({
            version: getSelectedVersionValue(),
            profileId,
          });
          if (!result?.ok) {
            throw new Error(
              result?.message ||
                t("messages.selectProfileFailed", "切換配置失敗")
            );
          }
          setProfileStore(result.data);
          S.cfg.activeProfileId = result.data?.activeProfileId || null;
          renderProfileBar();
          await loadConfigModalData({
            profileId,
            skipLoadingMask: true,
            skipInitPrompt: true,
          });
        } catch (err) {
          e.target.value = previousProfileId;
          App.console.appendLog(
            "system",
            `❌ ${t("messages.selectProfileFailed", "切換配置失敗: {error}", {
              error: err.message,
            })}`,
            Date.now()
          );
        }
      });
      D.cfgProfileSelect.__bound_profileSelect = true;
    }

    if (D.cfgProfileCreateBtn && !D.cfgProfileCreateBtn.__bound_profileCreate) {
      D.cfgProfileCreateBtn.addEventListener("click", async () => {
        const name = await (App.prompt
          ? App.prompt(
              t("messages.profileNamePrompt", "請輸入配置名稱"),
              "",
              {
                title: t("modal.serverconfig.profileCreate", "建立新配置"),
                placeholder: t(
                  "messages.profileNamePlaceholder",
                  "例如: PVE / 測試服 / 活動服"
                ),
              }
            )
          : Promise.resolve(
              window.prompt(
                t("messages.profileNamePrompt", "請輸入配置名稱"),
                ""
              )
            ));
        if (name == null) return;
        try {
          const result = await profilesApi.create({
            version: getSelectedVersionValue(),
            name,
            snapshot: buildProfileSnapshot(),
          });
          if (!result?.ok) {
            throw new Error(
              result?.message ||
                t("messages.createProfileFailed", "建立配置失敗")
            );
          }
          setProfileStore(result.data);
          S.cfg.activeProfileId = result.data?.activeProfileId || null;
          renderProfileBar();
          await loadConfigModalData({
            profileId: S.cfg.activeProfileId,
            skipLoadingMask: true,
            skipInitPrompt: true,
          });
          App.console.appendLog(
            "system",
            `✅ ${t("messages.profileCreated", "已建立配置: {name}", {
              name: getActiveProfile()?.displayName || name,
            })}`,
            Date.now()
          );
        } catch (err) {
          App.console.appendLog(
            "system",
            `❌ ${t("messages.createProfileFailed", "建立配置失敗: {error}", {
              error: err.message,
            })}`,
            Date.now()
          );
        }
      });
      D.cfgProfileCreateBtn.__bound_profileCreate = true;
    }

    if (D.cfgProfileRenameBtn && !D.cfgProfileRenameBtn.__bound_profileRename) {
      D.cfgProfileRenameBtn.addEventListener("click", async () => {
        const activeProfile = getActiveProfile();
        if (!activeProfile) return;
        const nextName = await (App.prompt
          ? App.prompt(
              t("messages.profileRenamePrompt", "請輸入新的配置名稱"),
              activeProfile.name || "",
              {
                title: t(
                  "modal.serverconfig.profileRename",
                  "重新命名目前配置"
                ),
                placeholder: t(
                  "messages.profileNamePlaceholder",
                  "例如: PVE / 測試服 / 活動服"
                ),
              }
            )
          : Promise.resolve(
              window.prompt(
                t("messages.profileRenamePrompt", "請輸入新的配置名稱"),
                activeProfile.name || ""
              )
            ));
        if (nextName == null) return;
        try {
          const result = await profilesApi.rename({
            version: getSelectedVersionValue(),
            profileId: activeProfile.id,
            name: nextName,
          });
          if (!result?.ok) {
            throw new Error(
              result?.message ||
                t("messages.renameProfileFailed", "配置改名失敗")
            );
          }
          setProfileStore(result.data);
          S.cfg.activeProfileId = result.data?.activeProfileId || null;
          renderProfileBar();
        } catch (err) {
          App.console.appendLog(
            "system",
            `❌ ${t("messages.renameProfileFailed", "配置改名失敗: {error}", {
              error: err.message,
            })}`,
            Date.now()
          );
        }
      });
      D.cfgProfileRenameBtn.__bound_profileRename = true;
    }

    if (D.cfgProfileDeleteBtn && !D.cfgProfileDeleteBtn.__bound_profileDelete) {
      D.cfgProfileDeleteBtn.addEventListener("click", async () => {
        const activeProfile = getActiveProfile();
        if (!activeProfile) return;
        if ((S.profileStore?.profiles || []).length <= 1) {
          App.console.appendLog(
            "system",
            `⚠️ ${t(
              "messages.deleteLastProfileBlocked",
              "至少保留一筆設定檔，無法刪除最後一筆。"
            )}`,
            Date.now()
          );
          return;
        }
        const confirmed = await (window.DangerConfirm
          ? window.DangerConfirm.showConfirm(
              t("confirm.deleteProfile", "是否確定刪除此配置？"),
              {
                title: t("modal.serverconfig.profileDelete", "刪除目前配置"),
                continueText: t("common.confirm", "繼續"),
                cancelText: t("common.cancel", "取消"),
              }
            )
          : Promise.resolve(
              window.confirm(t("confirm.deleteProfile", "是否確定刪除此配置？"))
            ));
        if (!confirmed) return;
        try {
          const result = await profilesApi.delete({
            version: getSelectedVersionValue(),
            profileId: activeProfile.id,
          });
          if (!result?.ok) {
            throw new Error(
              result?.message ||
                t("messages.deleteProfileFailed", "刪除配置失敗")
            );
          }
          setProfileStore(result.data);
          S.cfg.activeProfileId = result.data?.activeProfileId || null;
          renderProfileBar();
          await loadConfigModalData({
            profileId: S.cfg.activeProfileId,
            skipLoadingMask: true,
            skipInitPrompt: true,
          });
        } catch (err) {
          App.console.appendLog(
            "system",
            `❌ ${t("messages.deleteProfileFailed", "刪除配置失敗: {error}", {
              error: err.message,
            })}`,
            Date.now()
          );
        }
      });
      D.cfgProfileDeleteBtn.__bound_profileDelete = true;
    }
  }

  if (w.__fragmentsReady) bindButtons();
  else w.addEventListener("fragments:ready", bindButtons, { once: true });

  window.addEventListener("i18n:changed", () => {
    ensureDom();
    if (D.cfgModal?.classList.contains("hidden")) return;
    renderProfileBar();
    if (!S.cfg.locked) rerunChecks();
  });

  function closeCfgModal() {
    D.cfgModal?.classList.add("hidden");
    D.cfgModal?.setAttribute("aria-hidden", "true");
    clearInterval(S.__cfgCheckTimer);

    try {
      fetch("/api/close-dummy-port", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  async function openConfigModal() {
    ensureDom();
    D.cfgModal?.classList.remove("hidden");
    D.cfgModal?.setAttribute("aria-hidden", "false");
    await loadConfigModalData();
  }

  async function loadConfigModalData(options = {}) {
    ensureDom();
    const {
      profileId = "",
      skipLoadingMask = false,
      skipInitPrompt = false,
    } = options;
    if (!skipLoadingMask) setModalLoading();
    const selectedVersion = getSelectedVersionValue();
    try {
      const query = new URLSearchParams();
      if (selectedVersion) query.set("version", selectedVersion);
      if (profileId) query.set("profileId", profileId);

      const [procRes, cfgRes, savesRes, appCfgRes, profilesRes] = await Promise.all([
        fetchJSON("/api/processManager/status").catch(() => null),
        fetchJSON(`/api/serverconfig?${query.toString()}`),
        fetchJSON("/api/saves/list"),
        fetchJSON("/api/get-config").catch(() => null),
        profilesApi.list(selectedVersion).catch(() => null),
      ]);
      ensureDom();
      if (!cfgRes.ok) throw new Error(cfgRes.message || t("messages.loadConfigFailed", "讀取設定失敗"));

      const saves = savesRes?.data?.saves || [];
      S.cfg.worldList = Array.isArray(saves) ? saves.slice() : [];

      const tmplWorlds = cfgRes?.data?.worlds || [];
      tmplWorlds.forEach((w) => {
        if (!S.cfg.worldList.some((x) => x.world === w)) {
          S.cfg.worldList.push({ world: w, name: "" });
        }
      });

      if (procRes?.data?.gameServer) {
        const game = procRes.data.gameServer;
        const steam = procRes.data.steamCmd || {};
        setState({
          backendUp: true,
          steamRunning: !!steam.isRunning,
          gameRunning: !!game.isRunning,
          telnetOk: !!game.isTelnetConnected,
        });
      }

      const items = cfgRes.data?.items || [];
      S.cfg.profile = cfgRes.data?.profile || null;
      S.cfg.activeProfileId =
        cfgRes.data?.selectedProfileId ||
        cfgRes.data?.activeProfileId ||
        profilesRes?.data?.activeProfileId ||
        null;
      const fallbackProfiles = cfgRes.data?.profiles || [];
      const fallbackActiveProfile =
        fallbackProfiles.find((profile) => profile.id === (profilesRes?.data?.activeProfileId || S.cfg.activeProfileId)) ||
        null;
      const fallbackLastStartedProfile =
        fallbackProfiles.find(
          (profile) => profile.id === (cfgRes.data?.lastStartedProfileId || profilesRes?.data?.lastStartedProfileId)
        ) || null;
      setProfileStore(profilesRes?.data || {
        buildId: S.cfg.profile?.buildId || null,
        buildLabel: S.cfg.profile?.buildLabel || "",
        buildTag: S.cfg.profile?.buildTag || "",
        activeProfileId: profilesRes?.data?.activeProfileId || S.cfg.activeProfileId,
        activeProfile: fallbackActiveProfile,
        lastStartedProfileId:
          cfgRes.data?.lastStartedProfileId || profilesRes?.data?.lastStartedProfileId || null,
        lastStartedProfile: fallbackLastStartedProfile,
        initialProfileId:
          cfgRes.data?.selectedProfileId ||
          profilesRes?.data?.initialProfileId ||
          S.cfg.activeProfileId,
        profiles: fallbackProfiles,
      });
      S.cfg.original = new Map(items.map((x) => [x.name, x.value]));
      S.cfg.commentedOriginal = new Map(
        items.map((x) => [x.name, !!x.commented])
      );
      S.cfg.webPort = parseInt(appCfgRes?.data?.web?.port, 10) || NaN;
      renderProfileBar();
      renderCfgEditor(items);

      S.cfg.locked = App.status.computeGameRunning();
      App.status.updateCfgLockUI();
      renderProfileBar();

      const loadBtn =
        D.cfgLoadAdminBtn || document.getElementById("cfgLoadAdminBtn");
      if (loadBtn) loadBtn.disabled = !!S.cfg.locked;
      if (S.cfg.locked) {
        D.cfgSaveBtn && (D.cfgSaveBtn.disabled = true);
        D.cfgSaveStartBtn && (D.cfgSaveStartBtn.disabled = true);
      }

      const gsInit =
        appCfgRes?.data?.web && appCfgRes.data.web.game_serverInit === "true";
      if (gsInit && !S.cfg.locked && !skipInitPrompt) {
        try {
          const proceed = await (window.DangerConfirm
            ? window.DangerConfirm.showConfirm(
                t("confirm.loadAfterInstall", "偵測到剛完成安裝。是否載入上次保存的 game_server 設定?\n(選擇『載入設定』將覆蓋目前編輯器中的值)"),
                {
                  title: t("confirm.loadAfterInstallTitle", "載入上次保存設定"),
                  continueText: t("confirm.loadConfigBtn", "載入設定"),
                  cancelText: t("confirm.skipBtn", "略過"),
                }
              )
            : Promise.resolve(window.confirm("是否載入上次保存設定?")));
          fetch("/api/clear-game-server-init", { method: "POST" }).catch(
            () => {}
          );
          if (proceed) {
            if (typeof loadAdminGameServerConfig === "function") {
              await loadAdminGameServerConfig();
            } else if (loadBtn) {
              loadBtn.click();
            }
          } else {
            App.console.appendLog(
              "system",
              `ℹ️ ${t("messages.skippedLoadConfig", "已略過載入上次保存設定")}`,
              Date.now()
            );
          }
        } catch (e) {
          App.console.appendLog(
            "system",
            `⚠️ ${t("messages.initLoadPromptFailed", { error: e.message })}`,
            Date.now()
          );
        }
      }

      if (!S.cfg.locked) {
        await runCfgChecks();
        clearInterval(S.__cfgCheckTimer);
        S.__cfgCheckTimer = setInterval(() => {
          runCfgChecks().catch(() => {});
        }, 5000);
      }
    } catch (e) {
      App.console.appendLog(
        "system",
        `❌ ${t("messages.readServerconfigFailed", { error: e.message })}`,
        Date.now()
      );
    }
  }
  const ENUM_OPTIONS = {
    Region: {
      default: "NorthAmericaEast",
      options: [
        { value: "NorthAmericaEast", label: "北美東部" },
        { value: "NorthAmericaWest", label: "北美西部" },
        { value: "CentralAmerica", label: "中美洲" },
        { value: "SouthAmerica", label: "南美洲" },
        { value: "Europe", label: "歐洲" },
        { value: "Russia", label: "俄羅斯" },
        { value: "Asia", label: "亞洲" },
        { value: "MiddleEast", label: "中東" },
        { value: "Africa", label: "非洲" },
        { value: "Oceania", label: "大洋洲" },
      ],
    },
    ServerVisibility: {
      default: "2",
      options: [
        { value: "0", label: "0 - 隱藏伺服器" },
        { value: "1", label: "1 - 僅好友可見 (Steam 好友)" },
        { value: "2", label: "2 - 公開伺服器" },
      ],
    },
    ServerDisabledNetworkProtocols: {
      default: "SteamNetworking",
      options: [
        {
          value: "LiteNetLib",
          label: "LiteNetLib(已設定 NAT 或 Port-forward 建議使用)",
        },
        { value: "SteamNetworking", label: "SteamNetworking" },
      ],
    },
    WebDashboardEnabled: {
      default: "false",
      options: [
        { value: "true", label: "啟用 Web 控制台" },
        { value: "false", label: "停用 Web 控制台" },
      ],
    },
    EnableMapRendering: {
      default: "false",
      options: [
        { value: "true", label: "啟用 Web 地圖渲染" },
        { value: "false", label: "停用 Web 地圖渲染" },
      ],
    },
    TelnetEnabled: {
      default: "true",
      options: [
        { value: "true", label: "啟用 Telnet 遠端控制" },
        { value: "false", label: "停用 Telnet 遠端控制" },
      ],
    },
    TerminalWindowEnabled: {
      default: "false",
      options: [
        { value: "true", label: "顯示伺服器終端視窗" },
        { value: "false", label: "不顯示伺服器終端視窗" },
      ],
    },
    ServerAllowCrossplay: {
      default: "true",
      options: [
        { value: "true", label: "允許跨平台連線" },
        { value: "false", label: "不允許跨平台連線" },
      ],
    },
    EACEnabled: {
      default: "true",
      options: [
        { value: "true", label: "啟用 EAC 反作弊" },
        { value: "false", label: "停用 EAC 反作弊" },
      ],
    },
    IgnoreEOSSanctions: {
      default: "false",
      options: [
        { value: "true", label: "忽略 EOS 封禁 (允許被封玩家)" },
        { value: "false", label: "遵循 EOS 封禁 (建議)" },
      ],
    },
    PersistentPlayerProfiles: {
      default: "false",
      options: [
        { value: "true", label: "保留玩家角色設定" },
        { value: "false", label: "不保留玩家角色設定" },
      ],
    },
    GameDifficulty: {
      default: "1",
      options: [
        { value: "0", label: "0 - 採集者 (最簡單)" },
        { value: "1", label: "1 - 冒險者 (預設)" },
        { value: "2", label: "2 - 偵查者" },
        { value: "3", label: "3 - 生存者" },
        { value: "4", label: "4 - 求生專家" },
        { value: "5", label: "5 - 瘋狂 (最困難)" },
      ],
    },
    BuildCreate: {
      default: "false",
      options: [
        { value: "true", label: "啟用創造模式 (作弊)" },
        { value: "false", label: "停用創造模式" },
      ],
    },
    BiomeProgression: {
      default: "true",
      options: [
        { value: "true", label: "啟用生物群落進程" },
        { value: "false", label: "停用生物群落進程" },
      ],
    },
    DeathPenalty: {
      default: "1",
      options: [
        { value: "0", label: "0 - 無懲罰" },
        { value: "1", label: "1 - 經典 (失去經驗)" },
        { value: "2", label: "2 - 傷害懲罰" },
        { value: "3", label: "3 - 永久死亡 (硬核)" },
      ],
    },
    DropOnDeath: {
      default: "1",
      options: [
        { value: "0", label: "0 - 無掉落" },
        { value: "1", label: "1 - 掉落全部物品" },
        { value: "2", label: "2 - 僅掉落工具欄" },
        { value: "3", label: "3 - 僅掉落背包" },
        { value: "4", label: "4 - 物品直接刪除" },
      ],
    },
    DropOnQuit: {
      default: "0",
      options: [
        { value: "0", label: "0 - 無掉落" },
        { value: "1", label: "1 - 掉落全部物品" },
        { value: "2", label: "2 - 僅掉落工具欄" },
        { value: "3", label: "3 - 僅掉落背包" },
      ],
    },
    AllowSpawnNearFriend: {
      default: "2",
      options: [
        { value: "0", label: "0 - 禁止在好友附近重生" },
        { value: "1", label: "1 - 允許 (任何地點)" },
        { value: "2", label: "2 - 僅允許在森林生物群落" },
      ],
    },
    EnemySpawnMode: {
      default: "true",
      options: [
        { value: "true", label: "啟用殭屍生成" },
        { value: "false", label: "停用殭屍生成" },
      ],
    },
    EnemyDifficulty: {
      default: "0",
      options: [
        { value: "0", label: "0 - 普通" },
        { value: "1", label: "1 - 狂暴" },
      ],
    },
    ZombieMove: {
      default: "0",
      options: [
        { value: "0", label: "0 - 白天步行" },
        { value: "1", label: "1 - 白天慢跑" },
        { value: "2", label: "2 - 白天奔跑" },
        { value: "3", label: "3 - 白天衝刺" },
        { value: "4", label: "4 - 白天夢魘" },
      ],
    },
    ZombieMoveNight: {
      default: "3",
      options: [
        { value: "0", label: "0 - 夜晚步行" },
        { value: "1", label: "1 - 夜晚慢跑" },
        { value: "2", label: "2 - 夜晚奔跑" },
        { value: "3", label: "3 - 夜晚衝刺" },
        { value: "4", label: "4 - 夜晚夢魘" },
      ],
    },
    ZombieFeralMove: {
      default: "3",
      options: [
        { value: "0", label: "0 - 發狂步行" },
        { value: "1", label: "1 - 發狂慢跑" },
        { value: "2", label: "2 - 發狂奔跑" },
        { value: "3", label: "3 - 發狂衝刺" },
        { value: "4", label: "4 - 發狂夢魘" },
      ],
    },
    ZombieBMMove: {
      default: "3",
      options: [
        { value: "0", label: "0 - 血月步行" },
        { value: "1", label: "1 - 血月慢跑" },
        { value: "2", label: "2 - 血月奔跑" },
        { value: "3", label: "3 - 血月衝刺" },
        { value: "4", label: "4 - 血月夢魘" },
      ],
    },
    AirDropMarker: {
      default: "true",
      options: [
        { value: "true", label: "顯示空投標記" },
        { value: "false", label: "不顯示空投標記" },
      ],
    },
    PartyKillingMode: {
      default: "3",
      options: [
        { value: "0", label: "0 - 禁止 PvP" },
        { value: "1", label: "1 - 允許隊友互相攻擊" },
        { value: "2", label: "2 - 僅陌生人可互攻" },
        { value: "3", label: "3 - 全部玩家可互攻" },
      ],
    },
    LandClaimDecayMode: {
      default: "0",
      options: [
        { value: "0", label: "0 - 緩慢衰減" },
        { value: "1", label: "1 - 快速衰減" },
        { value: "2", label: "2 - 永久保護 (直到過期)" },
      ],
    },
    DynamicMeshEnabled: {
      default: "true",
      options: [
        { value: "true", label: "啟用動態網格" },
        { value: "false", label: "停用動態網格" },
      ],
    },
    DynamicMeshLandClaimOnly: {
      default: "false",
      options: [
        { value: "true", label: "僅在領地範圍啟用" },
        { value: "false", label: "所有區域啟用" },
      ],
    },
    TwitchBloodMoonAllowed: {
      default: "false",
      options: [
        { value: "true", label: "允許 Twitch 血月事件" },
        { value: "false", label: "不允許 Twitch 血月事件" },
      ],
    },
  };

  function renderCfgEditor(items) {
    ensureDom();
    const grid = document.createElement("div");
    grid.className = "cfg-grid";

    const worldValues = [...new Set(S.cfg.worldList.map((x) => x.world))];
    const nameMap = new Map();
    S.cfg.worldList.forEach((x) => {
      const arr = nameMap.get(x.world) || [];
      if (!arr.includes(x.name)) arr.push(x.name);
      nameMap.set(x.world, arr);
    });

    const byName = new Map(items.map((i) => [i.name, i.value]));

    items.forEach((item) => {
      const { name, value, commented } = item;
      const field = document.createElement("div");
      field.className = "cfg-field";
      field.dataset.fieldName = name;
      const header = document.createElement("div");
      header.className = "cfg-field__header";

      const enable = document.createElement("input");
      enable.type = "checkbox";
      enable.className = "cfg-enable";
      enable.dataset.enableFor = name;
      enable.checked = !commented;
      enable.setAttribute("aria-label", name);

      const lab = document.createElement("div");
      lab.className = "cfg-label";
      const labelText = document.createElement("span");
      labelText.className = "cfg-label__text cfg-field__name";
      labelText.textContent = name;

      const translatedText = document.createElement("span");
      translatedText.className = "cfg-field__translation";
      translatedText.dataset.i18n = getFieldLabelKey(name);
      translatedText.textContent = resolveFieldLabel(name);

      lab.appendChild(labelText);
      lab.appendChild(translatedText);

      const hint = createHintNode(
        item.comment || item.doc || t("modal.serverconfig.noDescription", "無說明")
      );

      header.appendChild(enable);
      header.appendChild(lab);
      header.appendChild(hint);

      let inputEl;

      if (name === "GameWorld") {
        const wrap = document.createElement("div");
        wrap.className = "cfg-combo";
        const sel = document.createElement("select");
        sel.innerHTML =
          `<option value="">${t("common.selectExisting", "(選擇現有)")}</option>` +
          worldValues
            .map(
              (w) =>
                `<option value="${escapeHTML(w)}"${
                  w === value ? " selected" : ""
                }>${escapeHTML(w)}</option>`
            )
            .join("");
        const txt = document.createElement("input");
        txt.type = "text";
        txt.value = value || "";
        txt.dataset.name = name;
        txt.dataset.type = "text";
        sel.addEventListener("change", () => {
          if (sel.value) txt.value = sel.value;
          rerunChecks();
        });
        txt.addEventListener("input", rerunChecks);
        wrap.appendChild(sel);
        wrap.appendChild(txt);
        inputEl = wrap;
      } else if (name === "GameName") {
        const wrap = document.createElement("div");
        wrap.className = "cfg-combo";
        const currentWorld =
          byName.get("GameWorld") ||
          (S.cfg.original && S.cfg.original.get("GameWorld")) ||
          "";
        const candidates = (currentWorld && nameMap.get(currentWorld)) || [
          ...new Set(S.cfg.worldList.map((x) => x.name)),
        ];
        const sel = document.createElement("select");
        sel.innerHTML =
          `<option value="">${t("common.selectExisting", "(選擇現有)")}</option>` +
          candidates
            .map(
              (n) =>
                `<option value="${escapeHTML(n)}"${
                  n === value ? " selected" : ""
                }>${escapeHTML(n)}</option>`
            )
            .join("");
        const txt = document.createElement("input");
        txt.type = "text";
        txt.value = value || "";
        txt.dataset.name = name;
        txt.dataset.type = "text";
        sel.addEventListener("change", () => {
          if (sel.value) txt.value = sel.value;
          rerunChecks();
        });
        txt.addEventListener("input", rerunChecks);
        wrap.appendChild(sel);
        wrap.appendChild(txt);
        inputEl = wrap;
      } else if (ENUM_OPTIONS[name]) {
        const enumDef = ENUM_OPTIONS[name];
        const enumList = Array.isArray(enumDef) ? enumDef : enumDef.options;
        const defVal = Array.isArray(enumDef)
          ? undefined
          : enumDef.default || undefined;
        const currentRaw = String(value ?? "");
        const current =
          currentRaw === "" && defVal !== undefined ? defVal : currentRaw;

        const sel = document.createElement("select");
        sel.dataset.name = name;
        sel.dataset.type = "text";

        const hasCurrent = enumList.some((o) => o.value === current);

        sel.innerHTML =
          `<option value="">${t("common.notSet", "(未設定)")}${ 
            defVal ? ` / ${t("common.default", "預設")}=${escapeHTML(defVal)}` : ""
          }</option>` +
          enumList
            .map(
              (o) =>
                `<option value="${escapeHTML(o.value)}"${
                  o.value === current ? " selected" : ""
                }>${escapeHTML(t(`enum.${name}.${o.value}`, o.label))}</option>`
            )
            .join("") +
          (!hasCurrent && current
            ? `<option value="${escapeHTML(
                current
              )}" selected>${t("common.custom", "(自訂)")} ${escapeHTML(current)}</option>`
            : "");

        sel.addEventListener("change", rerunChecks);
        inputEl = sel;
      } else {
        const t = document.createElement("input");
        t.type = "text";
        t.value = value;
        t.dataset.name = name;
        t.dataset.type = "text";
        t.addEventListener("input", rerunChecks);
        inputEl = t;
      }

      if (commented) {
        if (inputEl.classList?.contains("cfg-combo")) {
          inputEl
            .querySelectorAll("input,select")
            .forEach((e) => (e.disabled = true));
        } else inputEl.disabled = true;
      }

      enable.addEventListener("change", () => {
        const enabled = enable.checked;
        if (inputEl.classList?.contains("cfg-combo")) {
          inputEl
            .querySelectorAll("input,select")
            .forEach((e) => (e.disabled = !enabled || S.cfg.locked));
        } else inputEl.disabled = !enabled || S.cfg.locked;
        rerunChecks();
      });

      field.appendChild(header);
      field.appendChild(inputEl);
      grid.appendChild(field);
    });

    D.cfgBody.innerHTML = "";
    D.cfgBody.appendChild(grid);
    if (S.cfg.locked) App.status.disableCfgInputs(true);
  }

  const rerunChecks = App.utils.debounce(() => runCfgChecks(), 250);

  function readCfgValuesFromUI() {
    ensureDom();
    const values = {};
    D.cfgBody.querySelectorAll("[data-name]").forEach((el) => {
      const name = el.dataset.name;
      if (!name) return;
      values[name] = String(el.value || "").trim();
    });
    const enables = {};
    D.cfgBody.querySelectorAll(".cfg-enable").forEach((cb) => {
      const name = cb.dataset.enableFor;
      if (name) enables[name] = cb.checked;
    });
    Object.keys(values).forEach((name) => {
      if (!Object.prototype.hasOwnProperty.call(enables, name)) {
        enables[name] = true;
      }
    });
    return { values, enables };
  }

  function isTrue(v) {
    return /^(true)$/i.test(String(v || "").trim());
  }
  function num(v) {
    const n = parseInt(String(v || "").trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  function getUserDataFolderCheck(values, enables) {
    const fieldLabel = resolveFieldLabel("UserDataFolder") || "UserDataFolder";
    const enabled = !!enables.UserDataFolder;
    const value = String(values.UserDataFolder || "").trim();

    if (!enabled) {
      return {
        ok: "warn",
        needsReminder: true,
        text: value
          ? t(
              "checks.userDataFolderDisabledWithValueWarn",
              "{name} 尚未啟用(未打勾)。目前欄位值為 {value}，但不會生效；啟動時將使用遊戲預設資料夾。",
              { name: fieldLabel, value }
            )
          : t(
              "checks.userDataFolderDisabledWarn",
              "{name} 尚未啟用(未打勾)，將使用遊戲預設資料夾。",
              { name: fieldLabel }
            ),
      };
    }

    if (!value) {
      return {
        ok: "warn",
        needsReminder: true,
        text: t(
          "checks.userDataFolderEmptyWarn",
          "{name} 尚未設定，將使用遊戲預設資料夾。",
          { name: fieldLabel }
        ),
      };
    }

    return {
      ok: true,
      needsReminder: false,
      text: t(
        "checks.userDataFolderSet",
        "{name} 已啟用且已設定。",
        { name: fieldLabel }
      ),
    };
  }

  async function confirmUserDataFolderStartIfNeeded(values, enables) {
    const check = getUserDataFolderCheck(values, enables);
    if (!check.needsReminder) return true;

    const message = t(
      "confirm.userDataFolderStartWarning",
      "{detail}\n\n未打勾或空值時仍可啟動，但會使用遊戲預設資料夾。是否仍要保存並啟動？",
      { detail: check.text }
    );
    const options = {
      title: t("confirm.userDataFolderStartWarningTitle", "UserDataFolder 提醒"),
      continueText: t("confirm.saveAndStartAction", "保存並啟動"),
      cancelText: t("common.cancel", "取消"),
    };

    if (window.DangerConfirm?.showConfirm) {
      return window.DangerConfirm.showConfirm(message, options);
    }
    if (App.confirm) {
      return App.confirm(message, options);
    }
    return Promise.resolve(window.confirm(message));
  }

  async function runCfgChecks() {
    ensureDom();
    if (S.cfg.locked) return S.cfg.lastCheck;
    if (!D.cfgChecks) return { passAll: true, results: [] };

    const { values, enables } = readCfgValuesFromUI();
    const results = [];
    const webPort = Number.isFinite(S.cfg.webPort) ? S.cfg.webPort : NaN;

    function pushResult(ok, text, fields) {
      results.push({
        ok,
        text,
        fields: Array.isArray(fields) ? fields.map(normalizeCheckFieldName).filter(Boolean) : [],
      });
    }

    function needEnabled(name, failMsgIfDisabled, validateFn) {
      if (!enables[name]) {
        pushResult(
          failMsgIfDisabled ? false : true,
          t("checks.disabledCommented", `${name} 已停用(註解)`, { name }),
          [name]
        );
        return;
      }
      validateFn();
    }

    needEnabled("ServerPort", false, () => {
      const sp = parseInt(values.ServerPort, 10);
      if (!Number.isFinite(sp) || sp <= 0 || sp > 65535) {
        pushResult(false, t("checks.serverPortNotSet", "ServerPort 未設定或格式錯誤"), ["ServerPort"]);
      }
    });

    if (!enables.TelnetEnabled)
      pushResult(false, t("checks.telnetDisabled", "TelnetEnabled 已停用 (啟動需要 Telnet)"), ["TelnetEnabled"]);
    else if (!/^(true)$/i.test(values.TelnetEnabled))
      pushResult(false, t("checks.telnetMustBeTrue", "TelnetEnabled 必須為 true"), ["TelnetEnabled"]);
    else pushResult(true, t("checks.telnetEnabled", "TelnetEnabled 已啟用"), ["TelnetEnabled"]);

    if (!enables.TelnetPort)
      pushResult(false, t("checks.telnetPortDisabled", "TelnetPort 已停用"), ["TelnetPort"]);
    else {
      const tp = parseInt(values.TelnetPort, 10);
      if (!Number.isFinite(tp) || tp <= 0 || tp > 65535)
        pushResult(false, t("checks.telnetPortInvalid", "TelnetPort 未設定或格式錯誤"), ["TelnetPort"]);
    }

    if (!enables.TelnetPassword)
      pushResult(false, t("checks.telnetPasswordDisabled", "TelnetPassword 已停用"), ["TelnetPassword"]);
    else if (!String(values.TelnetPassword).trim())
      pushResult(false, t("checks.telnetPasswordEmpty", "TelnetPassword 不可為空"), ["TelnetPassword"]);
    else pushResult(true, t("checks.telnetPasswordSet", "TelnetPassword 已設定"), ["TelnetPassword"]);

    (function userDataFolderCheck() {
      const check = getUserDataFolderCheck(values, enables);
      pushResult(check.ok, check.text, ["UserDataFolder"]);
    })();

    if (!enables.EACEnabled)
      pushResult(true, t("checks.eacDisabled", "EACEnabled 已停用(註解)"), ["EACEnabled"]);
    else if (/^true$/i.test(values.EACEnabled))
      pushResult(
        "warn",
        t("checks.eacEnabledWarn", "EACEnabled=true: 啟用 EAC 時無法使用模組"),
        ["EACEnabled"]
      );
    else pushResult(true, t("checks.eacDisabledOk", "EACEnabled=false"), ["EACEnabled"]);

    (function equalPortGuards() {
      const portEntries = [];
      const seen = new Set();

      function addEntry(name, port, protocol) {
        const p = parseInt(port, 10);
        if (!Number.isFinite(p) || p <= 0 || p > 65535) return;
        const proto = String(protocol || "").toUpperCase();
        const key = `${name}:${p}:${proto}`;
        if (seen.has(key)) return;
        seen.add(key);
        portEntries.push({
          name,
          port: p,
          protocol: proto,
          displayName: `${name} (${proto})`,
        });
      }

      if (enables.ServerPort) {
        const sp = parseInt(values.ServerPort, 10);
        if (Number.isFinite(sp) && sp > 0 && sp <= 65535) {
          addEntry("ServerPort", sp, "TCP");
          addEntry("ServerPort", sp, "UDP");
        }
      }

      if (enables.TelnetPort) addEntry("TelnetPort", values.TelnetPort, "TCP");
      if (enables.WebDashboardPort)
        addEntry("WebDashboardPort", values.WebDashboardPort, "TCP");
      if (enables.ControlPanelPort)
        addEntry("ControlPanelPort", values.ControlPanelPort, "TCP");

      if (Number.isFinite(webPort)) {
        for (const pe of portEntries) {
          if (pe.port === webPort && pe.protocol === "TCP") {
            pushResult(
              false,
              t("checks.portConflictWithConsole", `${pe.displayName} 不可與控制台埠 ${webPort}/TCP 相同(避免衝突)`, { name: pe.displayName, port: webPort }),
              [pe.name]
            );
          }
        }
      }

      for (let i = 0; i < portEntries.length; i++) {
        for (let j = i + 1; j < portEntries.length; j++) {
          const a = portEntries[i];
          const b = portEntries[j];
          if (a.port === b.port && a.protocol === b.protocol) {
            pushResult(
              false,
              t("checks.portConflictSame", `${a.displayName} 與 ${b.displayName} 不可使用相同埠 (${a.port}/${a.protocol})`, { nameA: a.displayName, nameB: b.displayName, port: `${a.port}/${a.protocol}` }),
              [a.name, b.name]
            );
          }
        }
      }
    })();

    const asyncChecks = [];
    if (enables.ServerPort) {
      const sp = parseInt(values.ServerPort, 10);
      if (Number.isFinite(sp) && sp > 0 && sp <= 65535) {
        const coreTargets = [
          { port: sp, protocol: "tcp" },
          { port: sp, protocol: "udp" },
        ];
        asyncChecks.push(
          (async () => {
            try {
              try {
                const localRes = await fetchJSON(`/api/check-port?port=${sp}`);
                if (localRes?.ok) {
                  // 當 isDummy 為 true 時，視為端口可用（啟動時會自動關閉 dummy）
                  if (localRes.data?.inUse && !localRes.data?.isDummy) {
                    pushResult(false, t("checks.serverPortLocalInUse", `ServerPort/TCP 本機 ${sp} 已被佔用`, { port: sp }), ["ServerPort"]);
                  } else {
                    pushResult(true, t("checks.serverPortLocalFree", `ServerPort/TCP 本機 ${sp} 未被佔用`, { port: sp }), ["ServerPort"]);
                  }
                } else {
                  pushResult("warn", t("checks.serverPortLocalCheckFailed", `ServerPort/TCP 本機檢查失敗: ${localRes?.message || "未知錯誤"}`, { error: localRes?.message || "未知錯誤" }), ["ServerPort"]);
                }
              } catch (e) {
                pushResult("warn", t("checks.serverPortLocalCheckException", `ServerPort/TCP 本機檢查例外: ${e.message}`, { error: e.message }), ["ServerPort"]);
              }

              const ipRes = await fetchJSON("/api/public-ip");
              const pubIp = ipRes?.data?.ip;
              if (!pubIp) {
                pushResult(
                  "warn",
                  t(
                    "checks.externalAccessUnavailable",
                    "外網直連測試暫時無法判定，請稍後再試。",
                    { reason: t("checks.serverPortNoPublicIp", "ServerPort 檢查異常: 無法取得公網 IP") }
                  ),
                  ["ServerPort"]
                );
                return;
              }

              const forwardChecks = [];
              for (const target of coreTargets) {
                try {
                  const pfRes = await fetchJSON(
                    `/api/check-port-forward?ip=${encodeURIComponent(pubIp)}&port=${target.port}&protocol=${target.protocol}&dummyBasePort=${sp}`
                  );
                  if (!pfRes?.ok) {
                    forwardChecks.push({
                      target,
                      state: "error",
                      reason: pfRes?.message || "未知錯誤",
                    });
                    continue;
                  }
                  if (pfRes.data?.error) {
                    forwardChecks.push({
                      target,
                      state: "error",
                      reason: pfRes.data.error,
                    });
                    continue;
                  }
                  forwardChecks.push({
                    target,
                    state: pfRes.data?.open === true ? "open" : "closed",
                  });
                } catch (e) {
                  forwardChecks.push({
                    target,
                    state: "error",
                    reason: e.message || "未知錯誤",
                  });
                }
              }

              const opened = forwardChecks
                .filter((item) => item.state === "open")
                .map((item) => `${item.target.port}/${String(item.target.protocol || "").toUpperCase()}`);
              const failedCore = forwardChecks
                .filter(
                  (item) =>
                    item.state === "closed" &&
                    coreTargets.some(
                      (target) =>
                        target.port === item.target.port &&
                        target.protocol === item.target.protocol
                    )
                )
                .map((item) => `${item.target.port}/${String(item.target.protocol || "").toUpperCase()}`);
              const errors = forwardChecks
                .filter((item) => item.state === "error")
                .map((item) => `${item.target.port}/${String(item.target.protocol || "").toUpperCase()}: ${item.reason}`);

              if (errors.length) {
                pushResult(
                  "warn",
                  t(
                    "checks.externalAccessUnavailable",
                    "外網直連測試暫時無法判定，請稍後再試。",
                    { reason: errors.join("；") }
                  ),
                  ["ServerPort"]
                );
              } else if (failedCore.length === 0) {
                pushResult(
                  true,
                  t(
                    "checks.externalAccessAllOpen",
                    "外網直連測試通過：目前可從外網加入。",
                    { ip: pubIp, tested: opened.join(", ") }
                  ),
                  ["ServerPort"]
                );
              } else {
                pushResult(
                  false,
                  t(
                    "checks.externalAccessTcpFailed",
                    "外網直連測試未通過：目前無法從外網加入。",
                    { failed: failedCore.join(", ") }
                  ),
                  ["ServerPort"]
                );
              }
            } catch (e) {
              pushResult(
                "warn",
                t(
                  "checks.externalAccessUnavailable",
                  "外網直連測試暫時無法判定，請稍後再試。",
                  { reason: t("checks.serverPortCheckException", `ServerPort 檢查異常: ${e.message}`, { error: e.message }) }
                ),
                ["ServerPort"]
              );
            }
          })()
        );
      }
    }
    if (enables.TelnetPort) {
      const tp = parseInt(values.TelnetPort, 10);
      if (Number.isFinite(tp) && tp > 0 && tp <= 65535) {
        asyncChecks.push(
          fetchJSON(`/api/check-port?port=${tp}`)
            .then((r) => {
              const inUse = !!r?.data?.inUse;
              pushResult(
                inUse
                  ? false
                  : true,
                inUse
                  ? t("checks.telnetPortInUse", `TelnetPort ${tp} 已被佔用`, { port: tp })
                  : t("checks.telnetPortAvailable", `TelnetPort ${tp} 可用`, { port: tp }),
                ["TelnetPort"]
              );
            })
            .catch(() =>
              pushResult(false, t("checks.telnetPortCheckFailed", "TelnetPort 檢查失敗"), ["TelnetPort"])
            )
        );
      }
    }

    (function crossplayCheck() {
      const condsMissing = [];
      const allowEnabled =
        enables.ServerAllowCrossplay &&
        /^(true)$/i.test(values.ServerAllowCrossplay || "");
      if (!allowEnabled) condsMissing.push("ServerAllowCrossplay!=true");
      const maxPlayers = parseInt(values.ServerMaxPlayerCount, 10);
      if (!Number.isFinite(maxPlayers) || maxPlayers > 8)
        condsMissing.push("ServerMaxPlayerCount>8");
      const eacOk =
        enables.EACEnabled && /^(true)$/i.test(values.EACEnabled || "");
      if (!eacOk) condsMissing.push("EACEnabled!=true");
      const eosOk =
        enables.IgnoreEOSSanctions &&
        /^(false)$/i.test(values.IgnoreEOSSanctions || "");
      if (!eosOk) condsMissing.push("IgnoreEOSSanctions!=false");
      if (condsMissing.length === 0) {
        pushResult(
          true,
          t("checks.crossplayCompatible", "跨平台連線相容: (MaxPlayer≤8, AllowCrossplay=true, EAC=true, IgnoreEOSSanctions=false)"),
          ["ServerMaxPlayerCount", "ServerAllowCrossplay", "EACEnabled", "IgnoreEOSSanctions"]
        );
      } else {
        pushResult(
          "warn",
          t("checks.crossplayIncompatible", "跨平台連線不相容: {conditions} (不會出現在跨平台搜尋)", { conditions: condsMissing.join(", ") }),
          ["ServerMaxPlayerCount", "ServerAllowCrossplay", "EACEnabled", "IgnoreEOSSanctions"]
        );
      }
    })();

    await Promise.all(asyncChecks);

    const passAll = results.every((x) => x.ok === true || x.ok === "warn");
    D.cfgChecks.innerHTML = renderChecksPanel(results);
    applyFieldCheckStates(results);
    const pending = collectPendingConfigChanges();

    App.utils.setDisabled(
      [D.cfgSaveStartBtn],
      S.cfg.locked || !passAll || S.versionNeedsInstall
    );
    App.utils.setDisabled([D.cfgSaveBtn], S.cfg.locked || !pending.hasChanges);

    S.cfg.lastCheck = { passAll, results };
    return S.cfg.lastCheck;
  }

  function normalizeValueForWrite(name, newVal) {
    const oldVal = S.cfg.original?.get(name);
    if (oldVal == null) return newVal;
    const vTrim = String(newVal).trim();
    if (/^(true|false)$/i.test(vTrim)) return vTrim.toLowerCase();
    return vTrim;
  }

  function buildChangeSummary({ updates, toggles, enables }) {
    const lines = [];
    const originalVals = S.cfg.original || new Map();
    const commentedOrig = S.cfg.commentedOriginal || new Map();

    Object.entries(updates).forEach(([name, newVal]) => {
      const oldVal = originalVals.get(name);
      if (String(oldVal) !== String(newVal)) {
        const wasEnabled = !(commentedOrig.get(name) === true);
        const nowEnabled = !!enables[name];
        let tag = "";
        if (wasEnabled !== nowEnabled) {
          tag = nowEnabled ? ` (${t("changeSummary.enabledState", " 啟用")})` : ` (${t("changeSummary.disabledState", "停用")})`;
        }
        lines.push(
          `• ${name}${tag}: "` +
            (oldVal === undefined ? t("changeSummary.notSetValue", "(未設定)") : oldVal) +
            `"  =>  "${newVal}"`
        );
      }
    });

    Object.entries(toggles).forEach(([name, nowEnabled]) => {
      if (updates.hasOwnProperty(name)) return;
      const wasEnabled = !(commentedOrig.get(name) === true);
      if (wasEnabled !== nowEnabled) {
        lines.push(
          `• ${name}: ${wasEnabled ? t("changeSummary.enabledState", "啟用") : t("changeSummary.disabledState", "停用")}  =>  ` +
            (nowEnabled ? t("changeSummary.enabledState", "啟用") : t("changeSummary.disabledState", "停用"))
        );
      }
    });

    if (!lines.length) return t("messages.noChanges", "無任何參數變更。");
    return lines.join("\n");
  }

  function applySavedSnapshot(snapshot) {
    const values = snapshot?.values || {};
    const commented = snapshot?.commented || {};
    S.cfg.original = new Map(
      Object.keys(values).map((name) => [name, values[name]])
    );
    S.cfg.commentedOriginal = new Map(
      Object.keys(commented).map((name) => [name, !!commented[name]])
    );
  }

  async function saveConfigValues(startAfter) {
    ensureDom();
    const selectedVersion = getSelectedVersionValue();
    const activeProfileId = S.cfg.activeProfileId || S.profileStore?.activeProfileId;
    if (S.cfg.locked) {
      closeCfgModal();
      return;
    }
    if (startAfter && S.versionNeedsInstall) {
      App.console.appendLog(
        "system",
        `❌ ${t("messages.versionNotInstalled", "目前選擇的版本尚未安裝，請先安裝。")}`,
        Date.now()
      );
      return;
    }
    if (startAfter) {
      const checkNow = await runCfgChecks();
      if (!checkNow.passAll) {
        App.console.appendLog(
          "system",
          `❌ ${t("messages.cannotStartCheckFailed", "無法啟動: 請先修正啟動前未通過項目。")}`,
          Date.now()
        );
        return;
      }
    }

    const {
      snapshot,
      updates,
      toggles,
      changed,
      toggleChanged,
      enables,
    } = collectPendingConfigChanges();
    const { values } = readCfgValuesFromUI();

    try {
      const needPreview = changed > 0 || toggleChanged > 0;
      if (needPreview) {
        const summary = buildChangeSummary({
          updates,
          toggles,
          enables,
        });
        const actionLabel = startAfter ? t("confirm.saveAndStartAction", "保存並啟動") : t("common.save", "保存");
        const proceed = await (window.DangerConfirm
          ? window.DangerConfirm.showConfirm(
              t("changeSummary.confirmSaveStart", "{summary}\n\n是否確定{action}?", { summary, action: actionLabel }),
              {
                title: t("confirm.changesSummaryTitle", "即將寫入的設定變更"),
                continueText: actionLabel,
                cancelText: t("common.cancel", "取消"),
              }
            )
          : Promise.resolve(true));
        if (!proceed) {
          App.console.appendLog(
            "system",
            `ℹ️ ${t("messages.cancelledBySave", "已取消保存 (使用者取消)")}`,
            Date.now()
          );
          return;
        }
      }
    } catch (e) {
      App.console.appendLog(
        "system",
        `⚠️ ${t("messages.generateSummaryFailed", { error: e.message })} (將直接保存)`,
        Date.now()
        );
    }

    if (startAfter) {
      const proceed = await confirmUserDataFolderStartIfNeeded(values, enables);
      if (!proceed) {
        App.console.appendLog(
          "system",
          `ℹ️ ${t("messages.cancelledBySave", "已取消保存 (使用者取消)")}`,
          Date.now()
        );
        return;
      }
    }

    try {
      if (activeProfileId) {
        const profileSaveRes = await profilesApi.save({
          version: selectedVersion,
          profileId: activeProfileId,
          snapshot,
        });
        if (!profileSaveRes?.ok) {
          throw new Error(
            profileSaveRes?.message ||
              t("messages.saveProfileFailed", "保存配置失敗")
          );
        }
        setProfileStore(profileSaveRes.data);
        S.cfg.activeProfileId = profileSaveRes.data?.activeProfileId || activeProfileId;
      }

      if (changed > 0 || toggleChanged > 0) {
        const res = await fetchJSON("/api/serverconfig", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: selectedVersion,
            profileId: S.cfg.activeProfileId || activeProfileId,
            buildId: S.cfg.profile?.buildId || null,
            mode: S.cfg.profile?.profile || "legacy",
            updates,
            toggles,
          }),
        });
        if (!res.ok) throw new Error(res.message || "寫入失敗");
      }
      applySavedSnapshot(snapshot);
      await runCfgChecks();
      if (startAfter) {
        closeCfgModal();
        const msg = await fetchText("/api/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nographics: false, version: selectedVersion }),
        });
        App.console.appendLog("system", msg, Date.now());
        App.console.switchTab("game");
      }
    } catch (e) {
      App.console.appendLog(
        "system",
        `❌ ${t("messages.writeServerconfigFailed", { error: e.message })}`,
        Date.now()
      );
      return;
    }
  }

  App.configModal = App.configModal || {};
  App.configModal.openConfigModal = openConfigModal;
  App.openConfigModal = openConfigModal;

  async function loadAdminGameServerConfig() {
    ensureDom();
    if (!D.cfgBody) return;
    if (S.cfg.locked) {
      App.console.appendLog(
        "system",
        `❌ ${t("messages.serverRunningCannotLoad", "伺服器運行中，禁止載入上次保存設定")}`,
        Date.now()
      );
      return;
    }
    try {
      await loadConfigModalData({
        profileId: S.cfg.activeProfileId || S.profileStore?.activeProfileId || "",
        skipInitPrompt: true,
      });
      App.console.appendLog(
        "system",
        `✅ ${t("messages.loadedAdminConfig", "已載入上次保存設定到編輯器 (尚未保存)")}`,
        Date.now()
      );
    } catch (e) {
      App.console.appendLog(
        "system",
        `❌ ${t("messages.loadAdminConfigFailed", { error: e.message }) }`,
        Date.now()
      );
    }
  }

  function applyGameServerValuesToEditor(gs) {
    ensureDom();
    if (!D.cfgBody) return;

    const inputsByName = new Map();
    D.cfgBody.querySelectorAll("[data-name]").forEach((el) => {
      const n = el.dataset.name;
      if (!n) return;
      const list = inputsByName.get(n) || [];
      list.push(el);
      inputsByName.set(n, list);
    });

    const enableMap = new Map();
    D.cfgBody
      .querySelectorAll(".cfg-enable")
      .forEach((cb) => enableMap.set(cb.dataset.enableFor, cb));

    let applied = 0;

    inputsByName.forEach((els, name) => {
      if (!Object.prototype.hasOwnProperty.call(gs, name)) return;
      const val = gs[name];
      els.forEach((el) => {
        if (el.dataset.type === "boolean") {
          el.value = /^(true|1)$/i.test(String(val)) ? "true" : "false";
        } else {
          el.value = String(val);
        }
        const combo = el.closest(".cfg-combo");
        if (combo) {
          combo.querySelectorAll("select[data-name]").forEach((sel) => {
            const hasOpt = Array.from(sel.options).some(
              (o) => o.value === String(val)
            );
            sel.value = hasOpt ? String(val) : "";
          });
          if (!S.cfg.locked) {
            combo
              .querySelectorAll("input,select")
              .forEach((c) => (c.disabled = false));
          }
        } else if (!S.cfg.locked) {
          el.disabled = false;
        }
      });

      const cb = enableMap.get(name);
      if (cb) {
        cb.checked = true;
      }
      applied++;
    });

    if (applied === 0) {
      App.console.appendLog(
        "system",
        `ℹ️ ${t("messages.noApplicableProps", "載入後台設定: 無可套用的屬性 (server.json 中的 game_server 可能尚未保存或屬性名稱不相符)")}`,
        Date.now()
      );
    } else {
      App.console.appendLog(
        "system",
        `✅ ${t("messages.appliedAdminConfig", "已套用後台設定 ({count} 項) (尚未保存)", { count: applied }) }`,
        Date.now()
      );
    }

    rerunChecks();
  }
})(window);
