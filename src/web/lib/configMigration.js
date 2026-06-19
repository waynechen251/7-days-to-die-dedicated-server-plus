const fs = require("fs");
const path = require("path");
const { format } = require("./time");

const CURRENT_CONFIG_VERSION = 1;

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pushUnique(list, value) {
  if (!value || list.includes(value)) return;
  list.push(value);
}

function createFallbackDefaults() {
  return {
    configVersion: CURRENT_CONFIG_VERSION,
    log_keep_days: 7,
    game_server: {
      UserDataFolder:
        "C:\\Windows\\system32\\config\\systemprofile\\AppData\\Roaming\\7DaysToDie",
    },
    web: {
      port: 26901,
      installUser: "<USER>",
      lastInstallVersion: "public",
      game_serverInit: "false",
    },
    firewall: {
      autoManage: true,
      removeOnStop: true,
      openGamePorts: true,
      openManagementPorts: false,
      rulePrefix: "7DTD-DS-P-",
      appliedRules: [],
    },
    game_server_profiles: {
      activeProfileId: null,
      activeByBuildId: {},
      lastStartedByBuildId: {},
      profiles: [],
    },
  };
}

function loadDefaults(serverSamplePath) {
  try {
    return normalizeConfig(readJsonFile(serverSamplePath), createFallbackDefaults())
      .config;
  } catch (_) {
    return createFallbackDefaults();
  }
}

function asPositiveInt(value, fallback) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeBooleanFlag(value, fallback) {
  if (typeof value === "boolean") return value;
  if (/^(true|1)$/i.test(String(value || "").trim())) return true;
  if (/^(false|0)$/i.test(String(value || "").trim())) return false;
  return fallback;
}

function normalizeStringFlag(value, fallback) {
  return normalizeBooleanFlag(value, normalizeBooleanFlag(fallback, false))
    ? "true"
    : "false";
}

function normalizeNonEmptyString(value, fallback) {
  const next = String(value || "").trim();
  return next || fallback;
}

function normalizeLastInstallVersion(value, fallback) {
  const next = String(value || "").trim().toLowerCase();
  return next || fallback || "public";
}

function collectUnknownKeys(source, allowedKeys, prefix, bucket) {
  if (!isPlainObject(source)) return;
  Object.keys(source).forEach((key) => {
    if (!allowedKeys.has(key)) {
      bucket.push(prefix ? `${prefix}.${key}` : key);
    }
  });
}

function normalizeWeb(source, defaults, report) {
  const input = isPlainObject(source) ? source : {};
  const allowedKeys = new Set([
    "port",
    "installUser",
    "lastInstallVersion",
    "game_serverInit",
  ]);
  collectUnknownKeys(input, allowedKeys, "web", report.unknownRemoved);

  const next = {
    port: asPositiveInt(input.port, defaults.port),
    installUser: normalizeNonEmptyString(input.installUser, defaults.installUser),
    lastInstallVersion: normalizeLastInstallVersion(
      input.lastInstallVersion,
      defaults.lastInstallVersion
    ),
    game_serverInit: normalizeStringFlag(
      input.game_serverInit,
      defaults.game_serverInit
    ),
  };

  if (!Object.prototype.hasOwnProperty.call(input, "port")) {
    pushUnique(report.defaulted, "web.port");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "installUser")) {
    pushUnique(report.defaulted, "web.installUser");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "lastInstallVersion")) {
    pushUnique(report.defaulted, "web.lastInstallVersion");
  } else if (String(input.lastInstallVersion || "").trim() === "") {
    pushUnique(report.defaulted, "web.lastInstallVersion");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "game_serverInit")) {
    pushUnique(report.defaulted, "web.game_serverInit");
  }

  return next;
}

function normalizeGameServer(source, defaults, report) {
  const input = isPlainObject(source) ? deepClone(source) : {};
  const next = isPlainObject(input) ? input : {};

  if (Object.prototype.hasOwnProperty.call(next, "saves")) {
    if (!next.UserDataFolder && next.saves) {
      next.UserDataFolder = next.saves;
      report.moved.push({
        from: "game_server.saves",
        to: "game_server.UserDataFolder",
      });
    }
    delete next.saves;
    pushUnique(report.deprecatedRemoved, "game_server.saves");
  }

  if (!next.UserDataFolder && defaults.UserDataFolder) {
    next.UserDataFolder = defaults.UserDataFolder;
    pushUnique(report.defaulted, "game_server.UserDataFolder");
  }

  return next;
}

function normalizeFirewall(source, defaults, report) {
  const input = isPlainObject(source) ? source : {};
  const allowedKeys = new Set([
    "autoManage",
    "removeOnStop",
    "openGamePorts",
    "openManagementPorts",
    "rulePrefix",
    "appliedRules",
  ]);
  collectUnknownKeys(input, allowedKeys, "firewall", report.unknownRemoved);

  const next = {
    autoManage: normalizeBooleanFlag(input.autoManage, defaults.autoManage),
    removeOnStop: normalizeBooleanFlag(input.removeOnStop, defaults.removeOnStop),
    openGamePorts: normalizeBooleanFlag(
      input.openGamePorts,
      defaults.openGamePorts
    ),
    openManagementPorts: normalizeBooleanFlag(
      input.openManagementPorts,
      defaults.openManagementPorts
    ),
    rulePrefix: normalizeNonEmptyString(input.rulePrefix, defaults.rulePrefix),
    appliedRules: Array.isArray(input.appliedRules)
      ? input.appliedRules.map((value) => String(value))
      : deepClone(defaults.appliedRules || []),
  };

  Object.keys(next).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      pushUnique(report.defaulted, `firewall.${key}`);
    }
  });

  return next;
}

function normalizeProfiles(source, defaults, report) {
  const input = isPlainObject(source) ? source : {};
  const allowedKeys = new Set([
    "activeProfileId",
    "activeByBuildId",
    "lastStartedByBuildId",
    "profiles",
  ]);
  collectUnknownKeys(
    input,
    allowedKeys,
    "game_server_profiles",
    report.unknownRemoved
  );

  const activeByBuildId = {};
  if (isPlainObject(input.activeByBuildId)) {
    Object.entries(input.activeByBuildId).forEach(([buildId, profileId]) => {
      const nextId = String(profileId || "").trim();
      if (buildId && nextId) activeByBuildId[String(buildId)] = nextId;
    });
  }

  const lastStartedByBuildId = {};
  if (isPlainObject(input.lastStartedByBuildId)) {
    Object.entries(input.lastStartedByBuildId).forEach(([buildId, profileId]) => {
      const nextId = String(profileId || "").trim();
      if (buildId && nextId) lastStartedByBuildId[String(buildId)] = nextId;
    });
  }

  const profiles = Array.isArray(input.profiles)
    ? input.profiles.map((profile, index) => {
        const profileInput = isPlainObject(profile) ? profile : {};
        const profileAllowed = new Set([
          "id",
          "buildId",
          "branchHints",
          "mode",
          "name",
          "displayName",
          "values",
          "commented",
          "updatedAt",
        ]);
        collectUnknownKeys(
          profileInput,
          profileAllowed,
          `game_server_profiles.profiles[${index}]`,
          report.unknownRemoved
        );
        return {
          id: normalizeNonEmptyString(
            profileInput.id,
            `legacy_profile_${index + 1}`
          ),
          buildId:
            profileInput.buildId == null
              ? null
              : String(profileInput.buildId).trim() || null,
          branchHints: Array.isArray(profileInput.branchHints)
            ? profileInput.branchHints
                .map((value) => String(value || "").trim())
                .filter(Boolean)
            : [],
          mode:
            profileInput.mode === "v3" || profileInput.mode === "legacy"
              ? profileInput.mode
              : "legacy",
          name: normalizeNonEmptyString(profileInput.name, "Default"),
          displayName: normalizeNonEmptyString(
            profileInput.displayName,
            profileInput.name || "Default"
          ),
          values: isPlainObject(profileInput.values)
            ? deepClone(profileInput.values)
            : {},
          commented: isPlainObject(profileInput.commented)
            ? deepClone(profileInput.commented)
            : {},
          updatedAt: normalizeNonEmptyString(
            profileInput.updatedAt,
            new Date().toISOString()
          ),
        };
      })
    : deepClone(defaults.profiles || []);

  if (!Object.prototype.hasOwnProperty.call(input, "activeProfileId")) {
    pushUnique(report.defaulted, "game_server_profiles.activeProfileId");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "activeByBuildId")) {
    pushUnique(report.defaulted, "game_server_profiles.activeByBuildId");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "lastStartedByBuildId")) {
    pushUnique(report.defaulted, "game_server_profiles.lastStartedByBuildId");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "profiles")) {
    pushUnique(report.defaulted, "game_server_profiles.profiles");
  }

  return {
    activeProfileId:
      input.activeProfileId == null
        ? defaults.activeProfileId ?? null
        : String(input.activeProfileId).trim() || null,
    activeByBuildId,
    lastStartedByBuildId,
    profiles,
  };
}

function normalizeConfig(rawConfig, defaults) {
  const input = isPlainObject(rawConfig) ? rawConfig : {};
  const report = {
    changed: false,
    createdServerJson: false,
    fromVersion:
      Number.isInteger(input.configVersion) && input.configVersion > 0
        ? input.configVersion
        : null,
    toVersion: CURRENT_CONFIG_VERSION,
    backupPath: null,
    loadedFrom: null,
    writePath: null,
    moved: [],
    defaulted: [],
    deprecatedRemoved: [],
    unknownRemoved: [],
  };

  const allowedTopLevel = new Set([
    "configVersion",
    "log_keep_days",
    "game_server",
    "web",
    "firewall",
    "game_server_profiles",
  ]);
  collectUnknownKeys(input, allowedTopLevel, "", report.unknownRemoved);

  const config = {
    configVersion: CURRENT_CONFIG_VERSION,
    log_keep_days: asPositiveInt(input.log_keep_days, defaults.log_keep_days),
    game_server: normalizeGameServer(input.game_server, defaults.game_server, report),
    web: normalizeWeb(input.web, defaults.web, report),
    firewall: normalizeFirewall(input.firewall, defaults.firewall, report),
    game_server_profiles: normalizeProfiles(
      input.game_server_profiles,
      defaults.game_server_profiles,
      report
    ),
  };

  if (!Object.prototype.hasOwnProperty.call(input, "log_keep_days")) {
    pushUnique(report.defaulted, "log_keep_days");
  }

  report.changed =
    report.fromVersion !== CURRENT_CONFIG_VERSION ||
    report.moved.length > 0 ||
    report.defaulted.length > 0 ||
    report.deprecatedRemoved.length > 0 ||
    report.unknownRemoved.length > 0;

  return { config, report };
}

function createBackup({
  serverJsonPath,
  baseDir,
}) {
  const backupDir = path.join(baseDir, "server.backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `server.pre-migration__${format(
      new Date(),
      "YYYY-MM-DD__HH-mm-ss"
    )}.json`
  );
  fs.copyFileSync(serverJsonPath, backupPath);
  return backupPath;
}

function loadConfigWithMigration({
  baseDir,
  serverJsonPath,
  serverSamplePath,
}) {
  const defaults = loadDefaults(serverSamplePath);
  const loadedFrom = fs.existsSync(serverJsonPath)
    ? serverJsonPath
    : serverSamplePath;
  const source = path.basename(loadedFrom).toLowerCase() === "server.json"
    ? "server.json"
    : "server.sample.json";
  const rawConfig = readJsonFile(loadedFrom);
  const { config, report } = normalizeConfig(rawConfig, defaults);

  report.loadedFrom = loadedFrom;
  report.writePath = serverJsonPath;
  if (source !== "server.json") {
    report.changed = true;
    report.createdServerJson = true;
  }

  if (report.changed) {
    if (source === "server.json") {
      report.backupPath = createBackup({ serverJsonPath, baseDir });
    }
    fs.writeFileSync(serverJsonPath, JSON.stringify(config, null, 2), "utf-8");
  }

  return {
    config,
    meta: {
      configSource: "server.json",
      configPath: serverJsonPath,
      configVersion: config.configVersion,
      migration: report,
    },
  };
}

module.exports = {
  CURRENT_CONFIG_VERSION,
  loadConfigWithMigration,
};
