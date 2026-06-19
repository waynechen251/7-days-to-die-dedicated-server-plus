function canonicalVersion(version) {
  const raw = String(version || "").trim().toLowerCase();
  return raw === "" ? "public" : raw;
}

const FALLBACK_VERSION_ENTRIES = [
  { value: "public", label: "Stable (public)", buildId: "22422094" },
  { value: "latest_experimental", label: "Unstable build", buildId: "23705258" },
  { value: "v2.6", label: "Version 2.6 Stable", buildId: "22422094" },
  { value: "v2.5", label: "Version 2.5 Stable", buildId: "21600865" },
  { value: "v2.4", label: "Version 2.4 Stable", buildId: "20371871" },
  { value: "v2.3", label: "Version 2.3 Stable", buildId: "19878685" },
  { value: "v2.0", label: "Version 2.0 Stable", buildId: "19002068" },
  { value: "v1.4", label: "Version 1.4 Stable", buildId: "17990043" },
  { value: "alpha21.2", label: "Alpha 21.2 Stable", buildId: "12966454" },
  { value: "alpha20.7", label: "Alpha 20.7 Stable", buildId: "10740013" },
  { value: "alpha19.6", label: "Alpha 19.6 Stable", buildId: "7108526" },
  { value: "alpha18.4", label: "Alpha 18.4 Stable", buildId: "4714812" },
  { value: "alpha17.4", label: "Alpha 17.4 Stable", buildId: "3848769" },
  { value: "alpha16.4", label: "Alpha 16.4 Stable", buildId: "2222523" },
  { value: "alpha15.2", label: "Alpha 15.2 Stable", buildId: "1642899" },
  { value: "alpha14.7", label: "Alpha 14.7 Stable", buildId: "1189196" },
  { value: "alpha13.8", label: "Alpha 13.8 Stable", buildId: "963565" },
  { value: "alpha12.5", label: "Alpha 12.5 Stable", buildId: "745252" },
  { value: "alpha11.6", label: "Alpha 11.6 Stable", buildId: "658147" },
  { value: "alpha10.4", label: "Alpha 10.4 Stable", buildId: "480993" },
  { value: "alpha9.3", label: "Alpha 9.3 Stable", buildId: "385244" },
  { value: "alpha8.8", label: "Alpha 8.8 Stable", buildId: "334790" },
];

function parseNumericBranch(branch) {
  const match = String(branch || "").match(/^v(\d+)(?:\.(\d+))?$/i);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2] || "0", 10),
  };
}

function getBranchKind(branch) {
  const normalized = canonicalVersion(branch);
  if (normalized === "public") return { kind: "public", major: Infinity, minor: Infinity };
  if (normalized === "latest_experimental") {
    return { kind: "experimental", major: Infinity, minor: Infinity };
  }

  const parsed = parseNumericBranch(normalized);
  if (parsed) return { kind: "version", ...parsed };

  const alphaMatch = normalized.match(/^alpha(\d+)\.(\d+)$/i);
  if (alphaMatch) {
    return {
      kind: "alpha",
      major: parseInt(alphaMatch[1], 10),
      minor: parseInt(alphaMatch[2], 10),
    };
  }

  return { kind: "other", major: -Infinity, minor: -Infinity };
}

function compareBranchPreference(a, b) {
  const pa = getBranchKind(a);
  const pb = getBranchKind(b);
  const priority = {
    version: 5,
    public: 4,
    experimental: 3,
    alpha: 2,
    other: 1,
  };

  if (priority[pa.kind] !== priority[pb.kind]) {
    return priority[pb.kind] - priority[pa.kind];
  }
  if (pa.major !== pb.major) return pb.major - pa.major;
  return pb.minor - pa.minor;
}

function hasSandboxCode(items) {
  return Array.isArray(items)
    ? items.some((item) => String(item?.name || "") === "SandboxCode")
    : false;
}

function makeProfile(profile, source, version, extra = {}) {
  return {
    version,
    profile: "legacy",
    configMode: "legacy",
    startPolicy: "normal",
    source,
    isV3: false,
    isLegacy: true,
    ...extra,
  };
}

function resolveBranchProfile(version) {
  const normalized = canonicalVersion(version);
  return makeProfile("legacy", "branch", normalized);
}

function applyProfileToVersion(versionEntry) {
  const base = versionEntry || {};
  const normalized = canonicalVersion(base.value);
  const profile = resolveBranchProfile(normalized);
  return {
    ...base,
    value: normalized,
    buildId: base.buildId == null ? null : String(base.buildId),
    profile: profile.profile,
    configMode: profile.configMode,
    startPolicy: profile.startPolicy,
  };
}

function getFallbackVersionCatalog() {
  return FALLBACK_VERSION_ENTRIES.map(applyProfileToVersion);
}

function findVersionEntry(version, catalog) {
  const normalized = canonicalVersion(version);
  const source = Array.isArray(catalog) && catalog.length ? catalog : getFallbackVersionCatalog();
  return source.find((entry) => canonicalVersion(entry.value) === normalized) || null;
}

function getBuildEntries(buildId, catalog) {
  if (!buildId) return [];
  const source = Array.isArray(catalog) && catalog.length ? catalog : getFallbackVersionCatalog();
  return source.filter((entry) => String(entry.buildId || "") === String(buildId));
}

function getPreferredBuildEntry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries
    .slice()
    .sort((a, b) => compareBranchPreference(a.value, b.value))[0];
}

function getBuildDisplayTag(entries) {
  const preferred = getPreferredBuildEntry(entries);
  if (!preferred) return "";
  const parsed = parseNumericBranch(preferred.value);
  if (parsed) return `v${parsed.major}.${parsed.minor}`;
  if (preferred.value === "public") return "public";
  if (preferred.value === "latest_experimental") return "experimental";
  return preferred.value;
}

function getBuildDisplayLabel(entries, fallbackEntry) {
  const preferred = getPreferredBuildEntry(entries);
  if (preferred?.label) return preferred.label;
  if (fallbackEntry?.label) return fallbackEntry.label;
  return preferred?.value || fallbackEntry?.value || "";
}

function resolveVersionProfile({ version, items, catalog } = {}) {
  const normalized = canonicalVersion(version);
  const sourceCatalog =
    Array.isArray(catalog) && catalog.length ? catalog : getFallbackVersionCatalog();
  const branchProfile = resolveBranchProfile(normalized);
  const sandboxDetected = hasSandboxCode(items);
  const selectedEntry = findVersionEntry(normalized, sourceCatalog);
  const buildId = selectedEntry?.buildId || null;
  const buildEntries = getBuildEntries(buildId, sourceCatalog);
  const buildLabel = getBuildDisplayLabel(buildEntries, selectedEntry);
  const buildTag = getBuildDisplayTag(buildEntries);
  const branchHints = buildEntries.map((entry) => canonicalVersion(entry.value));

  return {
    ...branchProfile,
    buildId,
    buildLabel,
    buildTag,
    branchHints,
    sandboxDetected,
  };
}

module.exports = {
  FALLBACK_VERSION_ENTRIES,
  canonicalVersion,
  parseNumericBranch,
  hasSandboxCode,
  resolveBranchProfile,
  resolveVersionProfile,
  applyProfileToVersion,
  getFallbackVersionCatalog,
  findVersionEntry,
  getBuildEntries,
  getPreferredBuildEntry,
  getBuildDisplayLabel,
  getBuildDisplayTag,
};
