const STEAMCMD_API_URL = "https://api.steamcmd.net/v1/info/294420";
const API_TIMEOUT = 5000;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Static fallback versions
const FALLBACK_VERSIONS = [
  { value: "public", label: "Stable (public)" },
  { value: "latest_experimental", label: "Unstable build" },
  { value: "v2.5", label: "Version 2.5 Stable" },
  { value: "v2.4", label: "Version 2.4 Stable" },
  { value: "v2.3", label: "Version 2.3 Stable" },
  { value: "v2.2", label: "Version 2.2 Stable" },
  { value: "v2.1", label: "Version 2.1 Stable" },
  { value: "v2.0", label: "Version 2.0 Stable" },
  { value: "v1.4", label: "Version 1.4 Stable" },
  { value: "alpha21.2", label: "Alpha 21.2 Stable" },
  { value: "alpha20.7", label: "Alpha 20.7 Stable" },
  { value: "alpha19.6", label: "Alpha 19.6 Stable" },
  { value: "alpha18.4", label: "Alpha 18.4 Stable" },
  { value: "alpha17.4", label: "Alpha 17.4 Stable" },
  { value: "alpha16.4", label: "Alpha 16.4 Stable" },
  { value: "alpha15.2", label: "Alpha 15.2 Stable" },
  { value: "alpha14.7", label: "Alpha 14.7 Stable" },
  { value: "alpha13.8", label: "Alpha 13.8 Stable" },
  { value: "alpha12.5", label: "Alpha 12.5 Stable" },
  { value: "alpha11.6", label: "Alpha 11.6 Stable" },
  { value: "alpha10.4", label: "Alpha 10.4 Stable" },
  { value: "alpha9.3", label: "Alpha 9.3 Stable" },
  { value: "alpha8.8", label: "Alpha 8.8 Stable" },
];

// In-memory cache
let cache = {
  data: null,
  timestamp: 0,
};

/**
 * Parse version string for sorting
 * Returns { type: 'public'|'experimental'|'version'|'alpha', major, minor }
 */
function parseVersion(branchName) {
  if (branchName === "public") {
    return { type: "public", major: Infinity, minor: Infinity };
  }
  if (branchName === "latest_experimental") {
    return { type: "experimental", major: Infinity, minor: Infinity };
  }

  // Match vX.Y pattern
  const vMatch = branchName.match(/^v(\d+)\.(\d+)$/);
  if (vMatch) {
    return {
      type: "version",
      major: parseInt(vMatch[1], 10),
      minor: parseInt(vMatch[2], 10),
    };
  }

  // Match alphaX.Y pattern
  const alphaMatch = branchName.match(/^alpha(\d+)\.(\d+)$/);
  if (alphaMatch) {
    return {
      type: "alpha",
      major: parseInt(alphaMatch[1], 10),
      minor: parseInt(alphaMatch[2], 10),
    };
  }

  // Unknown format, sort to bottom
  return { type: "other", major: -Infinity, minor: -Infinity };
}

/**
 * Compare two versions for sorting (descending order)
 */
function compareVersions(a, b) {
  const pa = parseVersion(a.value);
  const pb = parseVersion(b.value);

  // Type priority: public > experimental > version > alpha > other
  const typePriority = {
    public: 5,
    experimental: 4,
    version: 3,
    alpha: 2,
    other: 1,
  };

  if (typePriority[pa.type] !== typePriority[pb.type]) {
    return typePriority[pb.type] - typePriority[pa.type];
  }

  // Same type, sort by major then minor (descending)
  if (pa.major !== pb.major) {
    return pb.major - pa.major;
  }
  return pb.minor - pa.minor;
}

/**
 * Convert branch name to display label
 */
function branchToLabel(branchName, branchInfo) {
  if (branchName === "public") {
    return "Stable (public)";
  }
  if (branchName === "latest_experimental") {
    return "Unstable build";
  }

  // Use description if available
  if (branchInfo && branchInfo.description) {
    return branchInfo.description;
  }

  // Match vX.Y pattern
  const vMatch = branchName.match(/^v(\d+)\.(\d+)$/);
  if (vMatch) {
    return `Version ${vMatch[1]}.${vMatch[2]} Stable`;
  }

  // Match alphaX.Y pattern
  const alphaMatch = branchName.match(/^alpha(\d+)\.(\d+)$/);
  if (alphaMatch) {
    return `Alpha ${alphaMatch[1]}.${alphaMatch[2]} Stable`;
  }

  return branchName;
}

/**
 * Fetch versions from SteamCMD API
 */
async function fetchVersionsFromAPI() {
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

    const versions = Object.entries(branches).map(([name, info]) => ({
      value: name === "public" ? "public" : name,
      label: branchToLabel(name, info),
      buildId: info.buildid || null,
      timeupdated: info.timeupdated || null,
    }));

    // Sort versions
    versions.sort(compareVersions);

    return versions;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

module.exports = function registerVersionsRoutes(app, ctx) {
  const { http, log, error } = ctx;

  app.get("/api/versions", async (req, res) => {
    const now = Date.now();

    // Check cache
    if (cache.data && now - cache.timestamp < CACHE_TTL) {
      return http.respondJson(
        res,
        { ok: true, source: "cache", versions: cache.data },
        200
      );
    }

    try {
      const versions = await fetchVersionsFromAPI();
      cache.data = versions;
      cache.timestamp = now;
      log(`[versions] Fetched ${versions.length} versions from SteamCMD API`);
      return http.respondJson(res, { ok: true, source: "api", versions }, 200);
    } catch (err) {
      error(`[versions] API fetch failed: ${err.message}, using fallback`);
      return http.respondJson(
        res,
        { ok: true, source: "fallback", versions: FALLBACK_VERSIONS },
        200
      );
    }
  });
};
