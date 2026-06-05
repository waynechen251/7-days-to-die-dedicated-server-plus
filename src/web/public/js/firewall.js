(function (w) {
  const App = (w.App = w.App || {});
  let initialized = false;
  let lastActionFeedback = null;

  function interpolate(text, params) {
    if (!params || typeof params !== "object") return text;
    return String(text).replace(/\{(\w+)\}/g, (_, key) =>
      Object.prototype.hasOwnProperty.call(params, key) ? params[key] : `{${key}}`
    );
  }

  function t(key, def, params) {
    if (App.i18n?.t) {
      const translated = App.i18n.t(key, params);
      if (translated !== key) return translated;
    }
    return interpolate(def || key, params);
  }

  function $id(id) {
    return document.getElementById(id);
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", hidden);
  }

  function setBadge(el, state) {
    if (!el) return;
    el.style.background = "";
    el.style.color = "";
    if (state === "ok") {
      el.style.background = "var(--c-ok, #1a7a1a)";
      el.style.color = "#fff";
    } else if (state === "warn") {
      el.style.background = "var(--c-warn, #a87000)";
      el.style.color = "#fff";
    } else if (state === "err") {
      el.style.background = "var(--c-err, #7a1a1a)";
      el.style.color = "#fff";
    } else if (state === "muted") {
      el.style.background = "var(--c-muted, #666)";
      el.style.color = "#fff";
    }
  }

  function setFeedback(message, tone) {
    const feedback = $id("fw-action-feedback");
    if (!feedback) return;

    if (!message) {
      feedback.textContent = "";
      feedback.title = "";
      setHidden(feedback, true);
      return;
    }

    feedback.textContent = message;
    feedback.title = message;
    feedback.style.background =
      tone === "ok"
        ? "rgba(26, 122, 26, 0.16)"
        : tone === "warn"
        ? "rgba(168, 112, 0, 0.16)"
        : "rgba(122, 26, 26, 0.16)";
    feedback.style.color =
      tone === "ok"
        ? "var(--c-ok, #1a7a1a)"
        : tone === "warn"
        ? "var(--c-warn, #a87000)"
        : "var(--c-err, #7a1a1a)";
    setHidden(feedback, false);
  }

  function isViewer() {
    return App.auth?.isViewer?.() ?? false;
  }

  function applyPolicyToUI(policy) {
    const autoManage = $id("fw-toggle-auto-manage");
    const removeOnStop = $id("fw-toggle-remove-on-stop");
    const gamePorts = $id("fw-toggle-game-ports");
    const mgmtPorts = $id("fw-toggle-mgmt-ports");

    if (autoManage) autoManage.checked = !!policy.autoManage;
    if (removeOnStop) removeOnStop.checked = !!policy.removeOnStop;
    if (gamePorts) gamePorts.checked = !!policy.openGamePorts;
    if (mgmtPorts) mgmtPorts.checked = !!policy.openManagementPorts;
  }

  function getRuleState(rule) {
    if (rule.enabledByPolicy && rule.existsInFirewall) {
      return {
        text: t("card.firewall.ruleStateActive", "已生效"),
        color: "var(--c-ok, #1a7a1a)",
        title: t("card.firewall.stateActive", "已套用並生效"),
      };
    }
    if (rule.enabledByPolicy && !rule.existsInFirewall) {
      return {
        text: t("card.firewall.ruleStatePending", "應生效但尚未生效"),
        color: "var(--c-warn, #a87000)",
        title: t("card.firewall.statePending", "開關已開啟，尚未套用"),
      };
    }
    return {
      text: t("card.firewall.ruleStateExcluded", "未納入策略"),
      color: rule.existsInFirewall ? "var(--c-warn, #a87000)" : "var(--c-muted, #888)",
      title: rule.existsInFirewall
        ? t("card.firewall.stateExcludedExisting", "未納入策略，但規則仍存在於 Windows 防火牆。")
        : t("card.firewall.stateInactive", "開關關閉，不套用"),
    };
  }

  function getDisplayRuleKey(rule) {
    return `${String(rule.protocol || "").toUpperCase()}:${rule.port}:${rule.enabledByPolicy}:${rule.existsInFirewall}`;
  }

  function combineGroups(groups) {
    const ordered = [];
    for (const group of groups) {
      if (!ordered.includes(group)) ordered.push(group);
    }
    if (ordered.length === 0) return "";
    if (ordered.length === 1) {
      return ordered[0] === "game"
        ? t("card.firewall.groupGame", "遊戲")
        : t("card.firewall.groupMgmt", "管理");
    }
    return t("card.firewall.groupShared", "遊戲 / 管理");
  }

  function mergeDisplayRules(rules) {
    const merged = [];
    const byKey = new Map();

    for (const rule of rules) {
      const key = getDisplayRuleKey(rule);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          ...rule,
          groups: [rule.group],
          names: [rule.name],
        });
        continue;
      }
      if (existing.port !== rule.port || existing.protocol !== rule.protocol) {
        continue;
      }
      existing.groups.push(rule.group);
      existing.names.push(rule.name);
    }

    for (const value of byKey.values()) {
      value.groupLabel = combineGroups(value.groups);
      value.nameLabel = value.names.join(" / ");
      merged.push(value);
    }

    return merged.sort((left, right) => {
      if (left.port !== right.port) return left.port - right.port;
      return String(left.protocol).localeCompare(String(right.protocol));
    });
  }

  function renderRuleTable(rules, ids) {
    const tbody = $id(ids.tbody);
    const table = $id(ids.table);
    const empty = $id(ids.empty);
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rules || rules.length === 0) {
      setHidden(table, true);
      setHidden(empty, false);
      return;
    }

    setHidden(empty, true);
    setHidden(table, false);

    const displayRules = mergeDisplayRules(rules);

    for (const rule of displayRules) {
      const tr = document.createElement("tr");
      const state = getRuleState(rule);

      tr.innerHTML = `
        <td style="padding: 2px 6px; color: ${state.color};" title="${state.title}">${state.text}</td>
        <td style="padding: 2px 6px;">${rule.groupLabel || ""}</td>
        <td style="padding: 2px 6px;">${rule.port}</td>
        <td style="padding: 2px 6px;">${rule.protocol}</td>
        <td style="padding: 2px 6px; font-size: 0.75rem; color: var(--c-muted, #888);" title="${rule.nameLabel}">${rule.nameLabel}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderSummaryBadges(summary) {
    const badgeMap = [
      ["fw-summary-desired", t("card.firewall.countDesired", "預期 {count} 條", { count: summary.desiredCount }), "muted"],
      ["fw-summary-actual", t("card.firewall.countActual", "已生效 {count} 條", { count: summary.actualCount }), "ok"],
      ["fw-summary-pending", t("card.firewall.countPending", "待套用 {count} 條", { count: summary.pendingCount }), summary.pendingCount > 0 ? "warn" : "muted"],
      ["fw-summary-unexpected", t("card.firewall.countUnexpected", "殘留 {count} 條", { count: summary.unexpectedCount }), summary.unexpectedCount > 0 ? "warn" : "muted"],
    ];

    for (const [id, text, tone] of badgeMap) {
      const el = $id(id);
      if (!el) continue;
      el.textContent = text;
      setBadge(el, tone);
    }
  }

  function getStatusPresentation(data) {
    const capability = data.capability || {};
    const summary = data.summary || {
      desiredCount: 0,
      actualCount: 0,
      pendingCount: 0,
      unexpectedCount: 0,
    };

    if (!capability.platformSupported) {
      return {
        tone: "warn",
        badge: t("card.firewall.badgeUnsupported", "此平台不支援"),
        summaryText: t("card.firewall.summaryUnsupported", "僅支援 Windows 動態管理"),
        detailText: t("card.firewall.detailUnsupported", "此區塊只描述本機 Windows 防火牆，不包含路由器或 NAT 狀態。"),
      };
    }

    if (!capability.elevated) {
      return {
        tone: "err",
        badge: t("card.firewall.badgeNoPermission", "需要管理員權限"),
        summaryText: t("card.firewall.summaryNoPermission", "目前無法直接修改 Windows 防火牆"),
        detailText: t("card.firewall.detailNoPermission", "仍可調整策略，但立即套用與移除規則需要系統管理員權限。"),
      };
    }

    if (summary.desiredCount === 0) {
      if (summary.unexpectedCount > 0) {
        return {
          tone: "warn",
          badge: t("card.firewall.badgeUnmanagedResidual", "未啟用管理，殘留 {count} 條", {
            count: summary.unexpectedCount,
          }),
          summaryText: t("card.firewall.summaryUnmanagedResidual", "目前未啟用管理，但仍有殘留規則"),
          detailText: t("card.firewall.detailUnmanagedResidual", "目前策略不要求開放任何規則，但 Windows 防火牆內仍存在 {count} 條舊規則。", {
            count: summary.unexpectedCount,
          }),
        };
      }
      return {
        tone: "muted",
        badge: t("card.firewall.badgeUnmanaged", "目前未管理任何規則"),
        summaryText: t("card.firewall.summaryUnmanaged", "目前未啟用管理"),
        detailText: t("card.firewall.detailUnmanaged", "現在的策略不要求開放任何防火牆規則。"),
      };
    }

    if (summary.pendingCount === 0 && summary.actualCount === summary.desiredCount && summary.unexpectedCount === 0) {
      return {
        tone: "ok",
        badge: t("card.firewall.badgeActive", "{count} 條規則已生效", {
          count: summary.actualCount,
        }),
        summaryText: t("card.firewall.summaryActive", "已生效"),
        detailText: t("card.firewall.detailActive", "預期規則與 Windows 防火牆內的實際規則一致。"),
      };
    }

    if (summary.actualCount === 0 && summary.pendingCount === summary.desiredCount) {
      return {
        tone: "warn",
        badge: t("card.firewall.badgePending", "預期 {desired} 條，實際 0 條", {
          desired: summary.desiredCount,
        }),
        summaryText: t("card.firewall.summaryPending", "待套用"),
        detailText: t("card.firewall.detailPending", "策略已開啟，但對應規則尚未寫入 Windows 防火牆。"),
      };
    }

    return {
      tone: "warn",
      badge: t("card.firewall.badgePartial", "預期 {desired} 條，實際 {actual} 條", {
        desired: summary.desiredCount,
        actual: summary.actualCount,
      }),
      summaryText: t("card.firewall.summaryPartial", "部分異常"),
      detailText: t("card.firewall.detailPartial", "有些規則已存在，有些仍缺失；請檢查詳細規則表。"),
    };
  }

  function renderSummary(data) {
    const badge = $id("fw-status-badge");
    const summaryTextEl = $id("fw-status-summary");
    const detailTextEl = $id("fw-status-detail");
    const platformWarn = $id("fw-platform-warn");
    const elevationWarn = $id("fw-elevation-warn");
    const capability = data.capability || {};
    const summary = data.summary || {
      desiredCount: 0,
      actualCount: 0,
      pendingCount: 0,
      unexpectedCount: 0,
    };
    const presentation = getStatusPresentation(data);

    if (badge) {
      badge.textContent = presentation.badge;
      setBadge(badge, presentation.tone);
      badge.title = presentation.detailText;
    }
    if (summaryTextEl) summaryTextEl.textContent = presentation.summaryText;
    if (detailTextEl) detailTextEl.textContent = presentation.detailText;

    renderSummaryBadges(summary);

    setHidden(platformWarn, capability.platformSupported !== false);
    setHidden(elevationWarn, !capability.platformSupported || !!capability.elevated);
  }

  function renderRules(data) {
    const rules = Array.isArray(data.rules) ? data.rules : [];
    const managedRules = rules.filter((rule) => rule.enabledByPolicy);
    const hasSecondaryRules = rules.some((rule) => !rule.enabledByPolicy);
    const allRulesDetails = $id("fw-all-rules-details");

    renderRuleTable(managedRules, {
      tbody: "fw-rules-tbody",
      table: "fw-rules-table",
      empty: "fw-rules-empty",
    });

    setHidden(allRulesDetails, !hasSecondaryRules);

    if (hasSecondaryRules) {
      renderRuleTable(rules, {
        tbody: "fw-all-rules-tbody",
        table: "fw-all-rules-table",
        empty: "fw-all-rules-empty",
      });
    }
  }

  function applyPermissions(data) {
    const capability = data.capability || {};
    const readonly = isViewer();
    const settingsReadonly = readonly || capability.platformSupported === false;
    const actionsReadonly =
      readonly || capability.platformSupported === false || !capability.elevated;

    for (const id of [
      "fw-toggle-auto-manage",
      "fw-toggle-remove-on-stop",
      "fw-toggle-game-ports",
    ]) {
      const el = $id(id);
      if (el) el.disabled = settingsReadonly;
    }

    const mgmtEl = $id("fw-toggle-mgmt-ports");
    const localOnlyNotice = $id("fw-mgmt-local-only");
    if (mgmtEl) mgmtEl.disabled = settingsReadonly || !capability.isLocal;
    setHidden(
      localOnlyNotice,
      capability.platformSupported === false || !!capability.isLocal
    );

    for (const id of ["fw-apply-btn", "fw-remove-btn"]) {
      const el = $id(id);
      if (el) el.disabled = actionsReadonly;
    }
  }

  async function refresh() {
    try {
      const result = await App.api.fetchJSON(`/api/firewall/status?_=${Date.now()}`, {
        cache: "no-store",
      });
      if (!result?.ok) throw new Error(result?.message || "查詢失敗");

      const data = result.data || {};
      applyPolicyToUI(data.policy || {});
      renderSummary(data);
      renderRules(data);
      applyPermissions(data);

      if (lastActionFeedback) {
        setFeedback(lastActionFeedback.message, lastActionFeedback.tone);
      }
    } catch (err) {
      const badge = $id("fw-status-badge");
      if (badge) {
        badge.textContent = t("card.firewall.statusError", "查詢失敗");
        setBadge(badge, "err");
      }
      const summaryTextEl = $id("fw-status-summary");
      const detailTextEl = $id("fw-status-detail");
      if (summaryTextEl) {
        summaryTextEl.textContent = t("card.firewall.summaryRefreshFailed", "狀態讀取失敗");
      }
      if (detailTextEl) {
        detailTextEl.textContent = err.message || t("card.firewall.detailRefreshFailed", "無法取得最新的 Windows 防火牆狀態。");
      }
    }
  }

  async function sendSetting(key, value) {
    try {
      const result = await App.api.fetchJSON("/api/firewall/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!result?.ok) throw new Error(result?.message || "設定失敗");
      App.console?.appendLog?.("system", `✅ ${result.message || "防火牆設定已更新"}`, Date.now());
      lastActionFeedback = {
        tone: "ok",
        message: result.message || t("card.firewall.settingsUpdated", "防火牆設定已更新"),
      };
    } catch (err) {
      App.console?.appendLog?.("system", `❌ 防火牆設定更新失敗: ${err.message}`, Date.now());
      lastActionFeedback = {
        tone: "err",
        message: t("card.firewall.settingsUpdateFailed", "防火牆設定更新失敗: {error}", {
          error: err.message,
        }),
      };
    }
    setFeedback(lastActionFeedback.message, lastActionFeedback.tone);
    await refresh();
  }

  function bindEvents() {
    const applyBtn = $id("fw-apply-btn");
    const removeBtn = $id("fw-remove-btn");
    const refreshBtn = $id("fw-refresh-btn");
    const autoManage = $id("fw-toggle-auto-manage");
    const removeOnStop = $id("fw-toggle-remove-on-stop");
    const gamePorts = $id("fw-toggle-game-ports");
    const mgmtPorts = $id("fw-toggle-mgmt-ports");

    if (applyBtn && !applyBtn.__fwBound) {
      applyBtn.addEventListener("click", async () => {
        applyBtn.disabled = true;
        try {
          App.console?.appendLog?.("system", t("card.firewall.applyingMsg", "正在套用防火牆規則..."), Date.now());
          const result = await App.api.fetchJSON("/api/firewall/apply", { method: "POST" });
          const ok = !!result?.ok;
          const message = result?.message || (ok ? t("card.firewall.applySuccess", "防火牆規則套用完成") : t("card.firewall.applyFailed", "套用失敗"));
          App.console?.appendLog?.("system", `${ok ? "✅" : "❌"} ${message}`, Date.now());
          lastActionFeedback = { tone: ok ? "ok" : "err", message };
        } catch (err) {
          const message = t("card.firewall.applyRequestFailed", "防火牆規則套用失敗: {error}", {
            error: err.message,
          });
          App.console?.appendLog?.("system", `❌ ${message}`, Date.now());
          lastActionFeedback = { tone: "err", message };
        } finally {
          setFeedback(lastActionFeedback?.message, lastActionFeedback?.tone);
          applyBtn.disabled = false;
          await refresh();
        }
      });
      applyBtn.__fwBound = true;
    }

    if (removeBtn && !removeBtn.__fwBound) {
      removeBtn.addEventListener("click", () => {
        App.confirm?.(t("confirm.removeFirewallRules", "確定要移除所有防火牆規則嗎？"), {
          title: t("confirm.title", "請確認操作"),
          continueText: t("common.confirm", "繼續"),
          cancelText: t("common.cancel", "取消"),
        }).then(async (confirmed) => {
          if (!confirmed) return;
          removeBtn.disabled = true;
          try {
            App.console?.appendLog?.("system", t("card.firewall.removingMsg", "正在移除防火牆規則..."), Date.now());
            const result = await App.api.fetchJSON("/api/firewall/remove", { method: "POST" });
            const ok = !!result?.ok;
            const message = result?.message || (ok ? t("card.firewall.removeSuccess", "防火牆規則移除完成") : t("card.firewall.removeFailed", "移除失敗"));
            App.console?.appendLog?.("system", `${ok ? "✅" : "❌"} ${message}`, Date.now());
            lastActionFeedback = { tone: ok ? "ok" : "err", message };
          } catch (err) {
            const message = t("card.firewall.removeRequestFailed", "防火牆規則移除失敗: {error}", {
              error: err.message,
            });
            App.console?.appendLog?.("system", `❌ ${message}`, Date.now());
            lastActionFeedback = { tone: "err", message };
          } finally {
            setFeedback(lastActionFeedback?.message, lastActionFeedback?.tone);
            removeBtn.disabled = false;
            await refresh();
          }
        });
      });
      removeBtn.__fwBound = true;
    }

    if (refreshBtn && !refreshBtn.__fwBound) {
      refreshBtn.addEventListener("click", refresh);
      refreshBtn.__fwBound = true;
    }

    if (autoManage && !autoManage.__fwBound) {
      autoManage.addEventListener("change", () => sendSetting("autoManage", autoManage.checked));
      autoManage.__fwBound = true;
    }
    if (removeOnStop && !removeOnStop.__fwBound) {
      removeOnStop.addEventListener("change", () => sendSetting("removeOnStop", removeOnStop.checked));
      removeOnStop.__fwBound = true;
    }
    if (gamePorts && !gamePorts.__fwBound) {
      gamePorts.addEventListener("change", () => sendSetting("openGamePorts", gamePorts.checked));
      gamePorts.__fwBound = true;
    }
    if (mgmtPorts && !mgmtPorts.__fwBound) {
      mgmtPorts.addEventListener("change", () => sendSetting("openManagementPorts", mgmtPorts.checked));
      mgmtPorts.__fwBound = true;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    refresh();
    w.addEventListener("i18n:changed", refresh);
  }

  App.firewall = { refresh, init };

  if (w.__fragmentsReady) {
    init();
  } else {
    w.addEventListener("fragments:ready", init, { once: true });
  }
})(window);
