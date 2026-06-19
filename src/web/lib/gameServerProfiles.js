const {
  canonicalVersion,
  resolveVersionProfile,
  getBuildDisplayTag,
  getBuildEntries,
} = require("./versionProfile");

function ensureProfilesRoot(CONFIG) {
  if (!CONFIG.game_server_profiles || typeof CONFIG.game_server_profiles !== "object") {
    CONFIG.game_server_profiles = {};
  }
  const root = CONFIG.game_server_profiles;
  if (!Array.isArray(root.profiles)) root.profiles = [];
  if (!root.activeByBuildId || typeof root.activeByBuildId !== "object") {
    root.activeByBuildId = {};
  }
  if (!root.lastStartedByBuildId || typeof root.lastStartedByBuildId !== "object") {
    root.lastStartedByBuildId = {};
  }
  if (!root.activeProfileId) root.activeProfileId = null;
  return root;
}

function normalizeProfileName(name) {
  return String(name || "").trim() || "Default";
}

function editableNameSet(items) {
  return new Set((Array.isArray(items) ? items : []).map((item) => item.name));
}

function profileSnapshotFromItems(items) {
  const values = {};
  const commented = {};
  (Array.isArray(items) ? items : []).forEach((item) => {
    values[item.name] = item.value;
    commented[item.name] = !!item.commented;
  });
  return { values, commented };
}

function applySnapshotToItems(items, snapshot) {
  if (!snapshot || typeof snapshot !== "object") return items;
  const values = snapshot.values || {};
  const commented = snapshot.commented || {};
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!Object.prototype.hasOwnProperty.call(values, item.name)) return item;
    return {
      ...item,
      value: values[item.name],
      commented: !!commented[item.name],
    };
  });
}

function buildDisplayName(versionCtx, name, catalog) {
  const displayTag =
    versionCtx?.buildTag ||
    getBuildDisplayTag(getBuildEntries(versionCtx?.buildId, catalog)) ||
    canonicalVersion(versionCtx?.version);
  return `${displayTag}-${normalizeProfileName(name)}`;
}

function createProfileRecord({ versionCtx, catalog, name, snapshot }) {
  const normalizedName = normalizeProfileName(name);
  return {
    id: `gsp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    buildId: versionCtx?.buildId || null,
    branchHints: Array.isArray(versionCtx?.branchHints)
      ? versionCtx.branchHints.slice()
      : [],
    mode: versionCtx?.profile || "legacy",
    name: normalizedName,
    displayName: buildDisplayName(versionCtx, normalizedName, catalog),
    values: snapshot?.values || {},
    commented: snapshot?.commented || {},
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

function getLastStartedProfile(root, buildId) {
  const buildKey = String(buildId || "");
  const profileId = root?.lastStartedByBuildId?.[buildKey] || null;
  const explicit = getProfileById(root, profileId);
  if (explicit && String(explicit.buildId || "") === buildKey) {
    return explicit;
  }
  return null;
}

function setLastStartedProfile(root, buildId, profileId) {
  const buildKey = String(buildId || "");
  if (!profileId) {
    delete root.lastStartedByBuildId[buildKey];
    return;
  }
  root.lastStartedByBuildId[buildKey] = profileId;
}

function resolveInitialProfile(root, buildId) {
  const profiles = getProfilesByBuildId(root, buildId);
  if (profiles.length === 0) return null;
  const lastStarted = getLastStartedProfile(root, buildId);
  if (profiles.length > 1 && lastStarted) return lastStarted;
  return resolveActiveProfile(root, buildId) || lastStarted || profiles[0];
}

function ensureDefaultProfile({
  CONFIG,
  versionCtx,
  catalog,
  items,
}) {
  const root = ensureProfilesRoot(CONFIG);
  const existing = getProfilesByBuildId(root, versionCtx?.buildId);
  if (existing.length > 0) {
    const active = resolveActiveProfile(root, versionCtx?.buildId);
    if (active) setActiveProfile(root, versionCtx?.buildId, active.id);
    return active || existing[0];
  }

  const profile = createProfileRecord({
    versionCtx,
    catalog,
    name: "Default",
    snapshot: profileSnapshotFromItems(items),
  });
  root.profiles.push(profile);
  setActiveProfile(root, versionCtx?.buildId, profile.id);
  return profile;
}

function updateProfileFromSnapshot(profile, versionCtx, catalog, snapshot, name) {
  if (!profile) return null;
  profile.mode = versionCtx?.profile || profile.mode;
  profile.buildId = versionCtx?.buildId || profile.buildId;
  profile.branchHints = Array.isArray(versionCtx?.branchHints)
    ? versionCtx.branchHints.slice()
    : profile.branchHints || [];
  if (name) profile.name = normalizeProfileName(name);
  profile.displayName = buildDisplayName(versionCtx, profile.name, catalog);
  profile.values = snapshot?.values || {};
  profile.commented = snapshot?.commented || {};
  profile.updatedAt = new Date().toISOString();
  return profile;
}

function mergeProfileIntoGameServer(CONFIG, profile) {
  if (!profile) return;
  if (!CONFIG.game_server || typeof CONFIG.game_server !== "object") {
    CONFIG.game_server = {};
  }
  const values = profile.values || {};
  Object.entries(values).forEach(([name, value]) => {
    CONFIG.game_server[name] = value;
  });
}

function createVersionContext({ version, items, catalog }) {
  return resolveVersionProfile({ version, items, catalog });
}

function filterSnapshotByItems(snapshot, items) {
  const allowed = editableNameSet(items);
  const values = {};
  const commented = {};
  Object.entries(snapshot?.values || {}).forEach(([name, value]) => {
    if (allowed.has(name)) values[name] = value;
  });
  Object.entries(snapshot?.commented || {}).forEach(([name, value]) => {
    if (allowed.has(name)) commented[name] = !!value;
  });
  return { values, commented };
}

module.exports = {
  ensureProfilesRoot,
  normalizeProfileName,
  profileSnapshotFromItems,
  applySnapshotToItems,
  buildDisplayName,
  createProfileRecord,
  getProfilesByBuildId,
  getProfileById,
  resolveActiveProfile,
  setActiveProfile,
  getLastStartedProfile,
  setLastStartedProfile,
  resolveInitialProfile,
  ensureDefaultProfile,
  updateProfileFromSnapshot,
  mergeProfileIntoGameServer,
  createVersionContext,
  filterSnapshotByItems,
};
