const STEAMCMD_API_URL = "https://api.steamcmd.net/v1/info/294420";
const API_TIMEOUT = 5000;
const CACHE_TTL = 10 * 60 * 1000;
const {
  applyProfileToVersion,
  getFallbackVersionCatalog,
} = require("./versionProfile");

let cache = {
  data: null,
  timestamp: 0,
};

function parseSortKey(branchName) {
  if (branchName === "public") {
    return { type: "public", major: Infinity, minor: Infinity };
  }
  if (branchName === "latest_experimental") {
    return { type: "experimental", major: Infinity, minor: Infinity };
  }
  const versionMatch = String(branchName || "").match(/^v(\d+)\.(\d+)$/i);
  if (versionMatch) {
    return {
      type: "version",
      major: parseInt(versionMatch[1], 10),
      minor: parseInt(versionMatch[2], 10),
    };
  }
  const alphaMatch = String(branchName || "").match(/^alpha(\d+)\.(\d+)$/i);
  if (alphaMatch) {
    return {
      type: "alpha",
      major: parseInt(alphaMatch[1], 10),
      minor: parseInt(alphaMatch[2], 10),
    };
  }
  return { type: "other", major: -Infinity, minor: -Infinity };
}

function compareVersions(a, b) {
  const pa = parseSortKey(a.value);
  const pb = parseSortKey(b.value);
  const priority = {
    public: 5,
    experimental: 4,
    version: 3,
    alpha: 2,
    other: 1,
  };
  if (priority[pa.type] !== priority[pb.type]) {
    return priority[pb.type] - priority[pa.type];
  }
  if (pa.major !== pb.major) return pb.major - pa.major;
  return pb.minor - pa.minor;
}

function branchToLabel(branchName, branchInfo) {
  if (branchName === "public") return "Stable (public)";
  if (branchName === "latest_experimental") return "Unstable build";
  if (branchInfo?.description) return branchInfo.description;

  const versionMatch = String(branchName || "").match(/^v(\d+)\.(\d+)$/i);
  if (versionMatch) {
    return `Version ${versionMatch[1]}.${versionMatch[2]} Stable`;
  }
  const alphaMatch = String(branchName || "").match(/^alpha(\d+)\.(\d+)$/i);
  if (alphaMatch) {
    return `Alpha ${alphaMatch[1]}.${alphaMatch[2]} Stable`;
  }
  return branchName;
}

async function fetchVersionCatalogFromAPI() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(STEAMCMD_API_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const branches = data?.data?.["294420"]?.depots?.branches;
    if (!branches || typeof branches !== "object") {
      throw new Error("Invalid API response structure");
    }

    const versions = Object.entries(branches).map(([name, info]) =>
      applyProfileToVersion({
        value: name,
        label: branchToLabel(name, info),
        buildId: info.buildid || null,
        timeupdated: info.timeupdated || null,
      })
    );
    versions.sort(compareVersions);
    return versions;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function getCachedCatalog() {
  return cache.data || getFallbackVersionCatalog();
}

async function refreshCatalog() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) {
    return { source: "cache", versions: cache.data };
  }

  const versions = await fetchVersionCatalogFromAPI();
  cache = {
    data: versions,
    timestamp: now,
  };
  return { source: "api", versions };
}

function getFallbackCatalogResponse() {
  return {
    source: "fallback",
    versions: getFallbackVersionCatalog(),
  };
}

module.exports = {
  getCachedCatalog,
  refreshCatalog,
  getFallbackCatalogResponse,
};
