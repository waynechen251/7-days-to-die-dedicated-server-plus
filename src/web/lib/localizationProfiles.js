const fs = require("fs");
const {
  canonicalVersion,
  resolveVersionProfile,
  getBuildDisplayTag,
  getBuildEntries,
} = require("./versionProfile");
const { LANGUAGE_COLUMNS } = require("./localization");

let storePath = "";
let store = null;

function emptyStore() {
  return {
    schemaVersion: 1,
    profiles: [],
    activeByBuildId: {},
    lastGeneratedByBuildId: {},
    activeProfileId: null,
  };
}

function ensureProfilesRoot(target) {
  const root = target && typeof target === "object" ? target : emptyStore();
  if (!Array.isArray(root.profiles)) root.profiles = [];
  if (!root.activeByBuildId || typeof root.activeByBuildId !== "object") {
    root.activeByBuildId = {};
  }
  if (!root.lastGeneratedByBuildId || typeof root.lastGeneratedByBuildId !== "object") {
    root.lastGeneratedByBuildId = {};
  }
  if (!root.activeProfileId) root.activeProfileId = null;
  if (!root.schemaVersion) root.schemaVersion = 1;
  return root;
}

function loadStore(filePath) {
  storePath = filePath;
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
      store = ensureProfilesRoot(JSON.parse(raw));
    } else {
      store = emptyStore();
      saveStore();
    }
  } catch (_e) {
    store = emptyStore();
  }
  return store;
}

function getStore() {
  if (!store) store = emptyStore();
  return store;
}

function saveStore() {
  if (!storePath) return false;
  try {
    fs.writeFileSync(storePath, JSON.stringify(getStore(), null, 2), "utf-8");
    return true;
  } catch (_e) {
    return false;
  }
}

function normalizeProfileName(name) {
  return String(name || "").trim() || "Default";
}

function normalizeEntry(raw) {
  const translations = {};
  LANGUAGE_COLUMNS.forEach((lang) => {
    translations[lang] = String(raw?.translations?.[lang] || "");
  });
  return {
    key: String(raw?.key || "").trim(),
    file: String(raw?.file || "").trim(),
    context: String(raw?.context || ""),
    enabled: raw?.enabled !== false,
    note: String(raw?.note || ""),
    translations,
  };
}

function validateEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const errors = [];
  const seen = new Set();
  list.forEach((entry, index) => {
    const key = String(entry?.key || "").trim();
    if (!key) {
      errors.push({ index, key, reason: "key 不可為空白" });
      return;
    }
    if (seen.has(key)) {
      errors.push({ index, key, reason: "key 重複" });
      return;
    }
    seen.add(key);
  });
  return { ok: errors.length === 0, errors };
}

function entriesSnapshotFromList(entries) {
  return (Array.isArray(entries) ? entries : []).map(normalizeEntry);
}

function buildDisplayName(versionCtx, name, catalog) {
  const displayTag =
    versionCtx?.buildTag ||
    getBuildDisplayTag(getBuildEntries(versionCtx?.buildId, catalog)) ||
    canonicalVersion(versionCtx?.version);
  return `${displayTag}-${normalizeProfileName(name)}`;
}

function createProfileRecord({ versionCtx, catalog, name, entries }) {
  const normalizedName = normalizeProfileName(name);
  return {
    id: `locp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    buildId: versionCtx?.buildId || null,
    branchHints: Array.isArray(versionCtx?.branchHints)
      ? versionCtx.branchHints.slice()
      : [],
    mode: versionCtx?.profile || "legacy",
    name: normalizedName,
    displayName: buildDisplayName(versionCtx, normalizedName, catalog),
    entries: entriesSnapshotFromList(entries),
    updatedAt: new Date().toISOString(),
  };
}

function getProfilesByBuildId(root, buildId) {
  const profiles = Array.isArray(root?.profiles) ? root.profiles : [];
  return profiles.filter((profile) => String(profile.buildId || "") === String(buildId || ""));
}

function getProfileById(root, profileId) {
  return Array.isArray(root?.profiles)
    ? root.profiles.find((profile) => profile.id === profileId) || null
    : null;
}

function resolveActiveProfile(root, buildId) {
  const buildKey = String(buildId || "");
  const profileId = root?.activeByBuildId?.[buildKey] || root?.activeProfileId || null;
  const explicit = getProfileById(root, profileId);
  if (explicit && String(explicit.buildId || "") === buildKey) {
    return explicit;
  }
  const profiles = getProfilesByBuildId(root, buildId);
  return profiles[0] || null;
}

function setActiveProfile(root, buildId, profileId) {
  const buildKey = String(buildId || "");
  root.activeProfileId = profileId || null;
  if (profileId) {
    root.activeByBuildId[buildKey] = profileId;
  } else {
    delete root.activeByBuildId[buildKey];
  }
}

function getLastGeneratedProfile(root, buildId) {
  const buildKey = String(buildId || "");
  const profileId = root?.lastGeneratedByBuildId?.[buildKey] || null;
  const explicit = getProfileById(root, profileId);
  if (explicit && String(explicit.buildId || "") === buildKey) {
    return explicit;
  }
  return null;
}

function setLastGeneratedProfile(root, buildId, profileId) {
  const buildKey = String(buildId || "");
  if (!profileId) {
    delete root.lastGeneratedByBuildId[buildKey];
    return;
  }
  root.lastGeneratedByBuildId[buildKey] = profileId;
}

function resolveInitialProfile(root, buildId) {
  const profiles = getProfilesByBuildId(root, buildId);
  if (profiles.length === 0) return null;
  const lastGenerated = getLastGeneratedProfile(root, buildId);
  if (profiles.length > 1 && lastGenerated) return lastGenerated;
  return resolveActiveProfile(root, buildId) || lastGenerated || profiles[0];
}

function ensureDefaultProfile({ store: root, versionCtx, catalog }) {
  const ensured = ensureProfilesRoot(root);
  const existing = getProfilesByBuildId(ensured, versionCtx?.buildId);
  if (existing.length > 0) {
    const active = resolveActiveProfile(ensured, versionCtx?.buildId);
    if (active) setActiveProfile(ensured, versionCtx?.buildId, active.id);
    return active || existing[0];
  }

  const profile = createProfileRecord({
    versionCtx,
    catalog,
    name: "Default",
    entries: [],
  });
  ensured.profiles.push(profile);
  setActiveProfile(ensured, versionCtx?.buildId, profile.id);
  return profile;
}

function updateProfileFromEntries(profile, versionCtx, catalog, entries, name) {
  if (!profile) return null;
  profile.mode = versionCtx?.profile || profile.mode;
  profile.buildId = versionCtx?.buildId || profile.buildId;
  profile.branchHints = Array.isArray(versionCtx?.branchHints)
    ? versionCtx.branchHints.slice()
    : profile.branchHints || [];
  if (name) profile.name = normalizeProfileName(name);
  profile.displayName = buildDisplayName(versionCtx, profile.name, catalog);
  profile.entries = entriesSnapshotFromList(entries);
  profile.updatedAt = new Date().toISOString();
  return profile;
}

function createVersionContext({ version, catalog }) {
  return resolveVersionProfile({ version, items: [], catalog });
}

function cloneProfileEntries(sourceProfile) {
  return entriesSnapshotFromList(sourceProfile?.entries);
}

module.exports = {
  loadStore,
  getStore,
  saveStore,
  ensureProfilesRoot,
  normalizeProfileName,
  normalizeEntry,
  validateEntries,
  entriesSnapshotFromList,
  buildDisplayName,
  createProfileRecord,
  getProfilesByBuildId,
  getProfileById,
  resolveActiveProfile,
  setActiveProfile,
  getLastGeneratedProfile,
  setLastGeneratedProfile,
  resolveInitialProfile,
  ensureDefaultProfile,
  updateProfileFromEntries,
  createVersionContext,
  cloneProfileEntries,
};
