const { execFile } = require("child_process");

const RULE_PREFIX = "7DTD-DS-P-";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

function checkElevation() {
  return new Promise((resolve) => {
    execFile(
      "net",
      ["session"],
      { windowsHide: true },
      (err) => resolve(!err)
    );
  });
}

function escapePowerShellString(value) {
  return String(value).replace(/'/g, "''");
}

async function checkRuleExists(name) {
  const psScript = [
    `$rule = Get-NetFirewallRule -DisplayName '${escapePowerShellString(name)}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty DisplayName`,
    "if ($rule) { Write-Output 'FOUND' }",
  ].join("; ");

  try {
    const { stdout } = await run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      psScript,
    ]);
    if ((stdout || "").trim() === "FOUND") return true;
    return false;
  } catch (_) {
    try {
      const { stdout, stderr } = await run("netsh", [
        "advfirewall",
        "firewall",
        "show",
        "rule",
        `name=${name}`,
      ]);
      const output = `${stdout || ""}\n${stderr || ""}`;
      if (
        /no rules match|找不到|沒有符合|没有与指定条件相匹配|規則不存在/i.test(output)
      ) {
        return false;
      }
      return output.includes(name);
    } catch (err) {
      const output = `${err.stdout || ""}\n${err.stderr || ""}`;
      if (
        /no rules match|找不到|沒有符合|没有与指定条件相匹配|規則不存在/i.test(output)
      ) {
        return false;
      }
      return output.includes(name);
    }
  }
}

function getPolicy(CONFIG) {
  return {
    autoManage: CONFIG?.firewall?.autoManage !== false,
    removeOnStop: CONFIG?.firewall?.removeOnStop !== false,
    openGamePorts: CONFIG?.firewall?.openGamePorts !== false,
    openManagementPorts: CONFIG?.firewall?.openManagementPorts === true,
    rulePrefix: RULE_PREFIX,
  };
}

function getProtectedRuleNames(CONFIG) {
  return new Set(
    computeDesiredRules(CONFIG, { forDisplay: true })
      .filter((rule) => rule.group === "mgmt")
      .map((rule) => rule.name)
  );
}

function filterRulesForMutation(rules, protectedRuleNames, allowManagementMutations) {
  if (allowManagementMutations !== false) return rules;
  return rules.filter((rule) => !protectedRuleNames.has(rule.name));
}

function summarizeSkippedRules(allRules, executableRules) {
  const executableNames = new Set(executableRules.map((rule) => rule.name));
  return allRules.filter((rule) => !executableNames.has(rule.name));
}

// 從 CONFIG 推導期望規則陣列
// forDisplay=true：忽略 open 開關，固定展示所有可能規則（不受勾選狀態影響）
function computeDesiredRules(CONFIG, { forDisplay = false } = {}) {
  const gs = CONFIG?.game_server || {};
  const webPort = CONFIG?.web?.port;
  const fw = CONFIG?.firewall || {};

  const rules = [];

  function addRule(group, label, port, protocol) {
    const p = parseInt(port, 10);
    if (!Number.isFinite(p) || p < 1 || p > 65535) return;
    const name = `${RULE_PREFIX}${group}-${label}-${p}-${protocol}`;
    rules.push({ name, port: p, protocol, group, label });
  }

  const openGame = forDisplay || fw.openGamePorts !== false;
  const openMgmt = forDisplay || fw.openManagementPorts === true;

  if (openGame) {
    const sp = parseInt(gs.ServerPort, 10);
    if (Number.isFinite(sp) && sp >= 1 && sp <= 65535) {
      for (const proto of ["TCP", "UDP"]) {
        addRule("game", "Server", sp, proto);
      }
    }
  }

  if (openMgmt) {
    const wdEnabled = /^(true|1)$/i.test(String(gs.WebDashboardEnabled || ""));
    if (wdEnabled) {
      const wdPort = parseInt(gs.WebDashboardPort, 10);
      if (Number.isFinite(wdPort) && wdPort >= 1 && wdPort <= 65535) {
        addRule("mgmt", "WebDashboard", wdPort, "TCP");
      }
    }

    const telnetEnabled = /^(true|1)$/i.test(String(gs.TelnetEnabled || ""));
    if (telnetEnabled) {
      addRule("mgmt", "Telnet", gs.TelnetPort, "TCP");
    }

    addRule("mgmt", "Backend", webPort, "TCP");
  }

  return rules;
}


async function applyRules(CONFIG, { log, error, eventBus, saveConfig, allowManagementMutations = true } = {}) {
  if (process.platform !== "win32") {
    return { ok: false, message: "僅支援 Windows 平台", platformSupported: false };
  }

  const elevated = await checkElevation();
  if (!elevated) {
    const msg = "需要系統管理員權限才能管理防火牆規則。請以系統管理員身分啟動，或確認服務以 LocalSystem 執行。";
    if (error) error(`❌ ${msg}`);
    if (eventBus) eventBus.push("system", { level: "error", text: `❌ ${msg}` });
    return { ok: false, message: msg, elevated: false };
  }

  const allRules = computeDesiredRules(CONFIG);
  const protectedRuleNames = getProtectedRuleNames(CONFIG);
  const rules = filterRulesForMutation(allRules, protectedRuleNames, allowManagementMutations);
  const skippedRules = summarizeSkippedRules(allRules, rules);
  if (rules.length === 0) {
    const msg = skippedRules.length > 0
      ? "遠端操作已保留管理用埠相關規則，沒有其他需要套用的規則"
      : "無需開放的防火牆規則（依目前設定判斷）";
    if (log) log(`ℹ️ ${msg}`);
    if (eventBus) eventBus.push("system", { text: `ℹ️ ${msg}` });
    return { ok: true, message: msg, results: [], skippedRules };
  }

  const results = [];
  const applied = [];

  for (const rule of rules) {
    const { name, port, protocol } = rule;
    try {
      // delete 先忽略錯誤（not found 視為正常）
      await run("netsh", [
        "advfirewall", "firewall", "delete", "rule", `name=${name}`,
      ]).catch(() => {});

      await run("netsh", [
        "advfirewall", "firewall", "add", "rule",
        `name=${name}`,
        "dir=in",
        `protocol=${protocol}`,
        `localport=${port}`,
        "action=allow",
        "enable=yes",
        "profile=any",
      ]);
      applied.push(name);
      results.push({ name, ok: true });
      if (log) log(`✅ 防火牆規則已套用: ${name}`);
    } catch (err) {
      const isAccessDenied =
        err.code === 5 ||
        (err.stderr || "").toLowerCase().includes("access") ||
        (err.message || "").toLowerCase().includes("access");
      const errMsg = isAccessDenied
        ? `權限不足: ${name}`
        : `套用失敗: ${name} (${err.message || err})`;
      results.push({ name, ok: false, error: errMsg });
      if (error) error(`❌ 防火牆規則套用失敗: ${name}: ${err.message || err}`);
      if (eventBus) eventBus.push("system", { level: "warn", text: `⚠️ ${errMsg}` });
    }
  }

  // 持久化到 server.json
  if (!CONFIG.firewall) CONFIG.firewall = {};
  const existing = Array.isArray(CONFIG.firewall.appliedRules)
    ? CONFIG.firewall.appliedRules
    : [];
  const merged = Array.from(new Set([...existing, ...applied]));
  CONFIG.firewall.appliedRules = merged;
  if (saveConfig) saveConfig();

  const okCount = results.filter((r) => r.ok).length;
  let msg = `防火牆規則套用完成：${okCount}/${results.length} 條成功`;
  if (skippedRules.length > 0) {
    msg += `；已保留 ${skippedRules.length} 條管理用埠相關規則`;
  }
  if (log) log(`✅ ${msg}`);
  if (eventBus) eventBus.push("system", { text: `✅ ${msg}` });

  return {
    ok: okCount > 0 || results.length === 0,
    message: msg,
    results,
    elevated: true,
    skippedRules,
  };
}

async function removeRules(CONFIG, { log, error, eventBus, saveConfig, allowManagementMutations = true } = {}) {
  if (process.platform !== "win32") {
    return { ok: false, message: "僅支援 Windows 平台", platformSupported: false };
  }

  const elevated = await checkElevation();
  if (!elevated) {
    const msg = "需要系統管理員權限才能管理防火牆規則。";
    if (error) error(`❌ ${msg}`);
    if (eventBus) eventBus.push("system", { level: "error", text: `❌ ${msg}` });
    return { ok: false, message: msg, elevated: false };
  }

  const desired = computeDesiredRules(CONFIG).map((r) => r.name);
  const persisted = Array.isArray(CONFIG.firewall?.appliedRules)
    ? CONFIG.firewall.appliedRules
    : [];
  const allRules = computeDesiredRules(CONFIG, { forDisplay: true });
  const protectedRuleNames = getProtectedRuleNames(CONFIG);
  const toRemove = Array.from(new Set([...desired, ...persisted]))
    .filter((name) => {
      if (allowManagementMutations !== false) return true;
      return !protectedRuleNames.has(name);
    });
  const skippedRules = allowManagementMutations !== false
    ? []
    : allRules.filter((rule) => protectedRuleNames.has(rule.name));

  if (toRemove.length === 0) {
    const msg = skippedRules.length > 0
      ? "遠端操作已保留管理用埠相關規則，沒有其他需要移除的規則"
      : "沒有需要移除的防火牆規則";
    if (log) log(`ℹ️ ${msg}`);
    return { ok: true, message: msg, results: [], skippedRules };
  }

  const results = [];
  for (const name of toRemove) {
    try {
      await run("netsh", [
        "advfirewall", "firewall", "delete", "rule", `name=${name}`,
      ]);
      results.push({ name, ok: true });
      if (log) log(`✅ 防火牆規則已移除: ${name}`);
    } catch (err) {
      // not-found 視為成功（規則本來就不存在）
      const notFound =
        (err.stderr || "").toLowerCase().includes("no rules") ||
        (err.stdout || "").toLowerCase().includes("no rules") ||
        (err.stderr || "").includes("找不到") ||
        (err.stdout || "").includes("找不到");
      if (notFound) {
        results.push({ name, ok: true });
      } else {
        results.push({ name, ok: false, error: err.message || String(err) });
        if (error) error(`❌ 防火牆規則移除失敗: ${name}: ${err.message || err}`);
        if (eventBus) eventBus.push("system", { level: "warn", text: `⚠️ 移除失敗: ${name}` });
      }
    }
  }

  // 清空持久化清單
  if (!CONFIG.firewall) CONFIG.firewall = {};
  CONFIG.firewall.appliedRules = allowManagementMutations === false
    ? persisted.filter((name) => protectedRuleNames.has(name))
    : [];
  if (saveConfig) saveConfig();

  const okCount = results.filter((r) => r.ok).length;
  let msg = `防火牆規則移除完成：${okCount}/${results.length} 條成功`;
  if (skippedRules.length > 0) {
    msg += `；已保留 ${skippedRules.length} 條管理用埠相關規則`;
  }
  if (log) log(`✅ ${msg}`);
  if (eventBus) eventBus.push("system", { text: `✅ ${msg}` });

  return { ok: true, message: msg, results, skippedRules };
}

async function getStatus(CONFIG) {
  const policy = getPolicy(CONFIG);

  if (process.platform !== "win32") {
    return {
      ok: true,
      capability: {
        platformSupported: false,
        elevated: false,
        isLocal: false,
      },
      policy,
      summary: {
        desiredCount: 0,
        actualCount: 0,
        pendingCount: 0,
        unexpectedCount: 0,
      },
      rules: [],
    };
  }

  const elevated = await checkElevation();
  const candidateRules = computeDesiredRules(CONFIG, { forDisplay: true });
  const desiredRules = computeDesiredRules(CONFIG);
  const desiredSet = new Set(desiredRules.map((r) => r.name));
  const existenceEntries = await Promise.all(
    candidateRules.map(async (rule) => [rule.name, await checkRuleExists(rule.name)])
  );
  const existenceMap = new Map(existenceEntries);

  const rules = candidateRules.map((rule) => {
    const enabledByPolicy = desiredSet.has(rule.name);
    const existsInFirewall = existenceMap.get(rule.name) === true;
    return {
      name: rule.name,
      group: rule.group,
      label: rule.label,
      port: rule.port,
      protocol: rule.protocol,
      enabledByPolicy,
      existsInFirewall,
    };
  });

  const summary = {
    desiredCount: rules.filter((rule) => rule.enabledByPolicy).length,
    actualCount: rules.filter(
      (rule) => rule.enabledByPolicy && rule.existsInFirewall
    ).length,
    pendingCount: rules.filter(
      (rule) => rule.enabledByPolicy && !rule.existsInFirewall
    ).length,
    unexpectedCount: rules.filter(
      (rule) => !rule.enabledByPolicy && rule.existsInFirewall
    ).length,
  };

  return {
    ok: true,
    capability: {
      platformSupported: true,
      elevated,
      isLocal: false,
    },
    policy,
    summary,
    rules,
    appliedRules: Array.isArray(CONFIG?.firewall?.appliedRules)
      ? CONFIG.firewall.appliedRules
      : [],
  };
}

module.exports = { computeDesiredRules, checkElevation, applyRules, removeRules, getStatus };
