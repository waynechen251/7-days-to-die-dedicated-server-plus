(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api || {};
  const t = (key, def, params) =>
    App.i18n ? App.i18n.t(key, params) : def || key;

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function ensureFragment(id, url) {
    const existing = document.getElementById(id);
    if (existing && existing.classList.contains("modal")) return existing;

    const host =
      document.getElementById("dspModalHost") ||
      document.querySelector('[data-fragment="card-dsp-modal"]');

    if (!host) throw new Error("找不到片段宿主節點");

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("載入片段失敗");
    const html = await res.text();
    host.innerHTML = html;

    const modal = document.getElementById(id);
    if (!modal || !modal.classList.contains("modal")) {
      throw new Error("片段載入後仍找不到 modal 節點");
    }
    return modal;
  }

  function wireModal() {
    if (App.adminConfig) return;

    const modal = document.getElementById("adminCfgModal");
    if (!modal) return;

    const closeBtn = document.getElementById("adminCfgCloseBtn");
    const closeBtn2 = document.getElementById("adminCfgCloseBtn2");
    const refreshBtn = document.getElementById("adminCfgRefreshBtn");
    const copyBtn = document.getElementById("adminCfgCopyBtn");
    const contentEl = document.getElementById("adminCfgContent");
    const statusEl = document.getElementById("adminCfgStatus");
    const migrationEl = document.getElementById("adminCfgMigrationInfo");

    function versionLabel(version) {
      return version == null
        ? t("modal.dspConfig.versionLegacy", "legacy")
        : `v${version}`;
    }

    function renderMigration(meta) {
      if (statusEl) {
        const parts = [
          t("modal.dspConfig.statusConfigVersion", "Schema {version}", {
            version: versionLabel(meta?.configVersion),
          }),
          t(
            meta?.configSource === "server.sample.json"
              ? "modal.dspConfig.sourceSample"
              : "modal.dspConfig.sourceServer",
            meta?.configSource === "server.sample.json"
              ? "來源: server.sample.json"
              : "來源: server.json"
          ),
        ];
        statusEl.textContent = parts.join(" · ");
      }

      if (!migrationEl) return;
      const migration = meta?.migration || {};
      const lines = [];
      if (migration.createdServerJson) {
        lines.push(
          `<div><strong>${escapeHTML(
            t(
              "modal.dspConfig.migrationCreatedFromSample",
              "已依最新 schema 建立新的 server.json"
            )
          )}</strong></div>`
        );
      } else if (migration.changed) {
        lines.push(
          `<div><strong>${escapeHTML(
            t(
              "modal.dspConfig.migrationChanged",
              "已自動升級設定: {from} -> {to}",
              {
                from: versionLabel(migration.fromVersion),
                to: versionLabel(migration.toVersion),
              }
            )
          )}</strong></div>`
        );
      } else {
        lines.push(
          `<div><strong>${escapeHTML(
            t(
              "modal.dspConfig.migrationUpToDate",
              "設定已是最新 schema"
            )
          )}</strong></div>`
        );
      }

      if (migration.backupPath) {
        lines.push(
          `<div>${escapeHTML(
            t("modal.dspConfig.migrationBackup", "備份檔: {path}", {
              path: migration.backupPath,
            })
          )}</div>`
        );
      }

      [
        ["moved", "modal.dspConfig.migrationMoved", "已搬移設定"],
        ["defaulted", "modal.dspConfig.migrationDefaulted", "已補預設值"],
        [
          "deprecatedRemoved",
          "modal.dspConfig.migrationDeprecatedRemoved",
          "已移除棄用設定",
        ],
        [
          "unknownRemoved",
          "modal.dspConfig.migrationUnknownRemoved",
          "已移除未知設定",
        ],
      ].forEach(([key, labelKey, fallbackLabel]) => {
        const values = Array.isArray(migration[key]) ? migration[key] : [];
        if (values.length === 0) return;
        const list = values
          .map((item) =>
            typeof item === "string"
              ? escapeHTML(item)
              : `${escapeHTML(item.from)} → ${escapeHTML(item.to)}`
          )
          .join(", ");
        lines.push(
          `<div>${escapeHTML(t(labelKey, fallbackLabel))}: ${list}</div>`
        );
      });

      if (
        !migration.changed &&
        !migration.backupPath &&
        ["moved", "defaulted", "deprecatedRemoved", "unknownRemoved"].every(
          (key) => !Array.isArray(migration[key]) || migration[key].length === 0
        )
      ) {
        lines.push(
          `<div>${escapeHTML(
            t("modal.dspConfig.migrationNone", "本次啟動沒有升級動作。")
          )}</div>`
        );
      }

      migrationEl.innerHTML = lines.join("");
    }

    async function loadConfig() {
      contentEl.textContent = "";
      try {
        const res = await fetchJSON("/api/get-config");
        if (!res?.ok) throw new Error(res?.message || "讀取失敗");
        const json = res.data || {};
        contentEl.textContent = JSON.stringify(json, null, 2);
        renderMigration(res.meta || {});
      } catch (e) {
        contentEl.textContent = "";
        if (statusEl) statusEl.textContent = "";
        if (migrationEl) migrationEl.textContent = "";
      }
    }

    function show() {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }
    function hide() {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
    async function openModal() {
      show();
      await loadConfig();
    }
    async function refresh() {
      await loadConfig();
    }
    async function copyJSON() {
      const txt = contentEl.textContent || "";
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
      } catch {}
    }

    refreshBtn?.addEventListener("click", refresh);
    copyBtn?.addEventListener("click", copyJSON);
    closeBtn?.addEventListener("click", hide);
    closeBtn2?.addEventListener("click", hide);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) hide();
    });

    App.adminConfig = { open: openModal, refresh };
  }

  function bindTrigger() {
    const triggerBtn = document.getElementById("viewConfigBtn");
    if (!triggerBtn) return false;

    if (!triggerBtn.__bound_openAdminCfg) {
      triggerBtn.addEventListener("click", async () => {
        try {
          await ensureFragment(
            "adminCfgModal",
            "fragments/card-dsp-modal.html"
          );
          const alreadyBound = !!App.adminConfig;
          wireModal();
          if (App.adminConfig?.open) {
            App.adminConfig.open();
          } else if (!alreadyBound) {
            console.error("管理後台設定視窗綁定失敗：缺少 open()");
            alert("載入管理後台設定視窗失敗(缺少開啟方法)");
          }
        } catch (e) {
          console.error(e);
          alert("載入管理後台設定視窗失敗: " + e.message);
        }
      });
      triggerBtn.__bound_openAdminCfg = true;
    }
    return true;
  }

  function boot() {
    if (bindTrigger()) return;
    const once = () => bindTrigger();
    if (w.__fragmentsReady) once();
    else w.addEventListener("fragments:ready", once, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
