const GITHUB_API_URL =
  "https://api.github.com/repos/waynechen251/7-days-to-die-dedicated-server-plus/releases/latest";
const API_TIMEOUT = 5000;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

let cache = {
  data: null,
  timestamp: 0,
};

function parseVersion(versionStr) {
  const str = String(versionStr).replace(/^v/i, "");
  const parts = str.split(".").map((n) => parseInt(n, 10));
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

function isNewerVersion(latest, current) {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  if (l.major !== c.major) return l.major > c.major;
  if (l.minor !== c.minor) return l.minor > c.minor;
  return l.patch > c.patch;
}

async function fetchLatestRelease() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(GITHUB_API_URL, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      tagName: data.tag_name,
      htmlUrl: data.html_url,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

module.exports = function registerUpdatesRoutes(app, ctx) {
  const { http, log, error, appVersion } = ctx;

  // 啟動時後台預取最新版本
  fetchLatestRelease()
    .then((release) => {
      cache.data = release;
      cache.timestamp = Date.now();
      log(`[updates] Latest release: ${release.tagName}`);
    })
    .catch((err) => {
      error(`[updates] Background prefetch failed: ${err.message}`);
    });

  app.get("/api/update-check", async (req, res) => {
    const now = Date.now();

    // 使用緩存若仍有效
    if (cache.data && now - cache.timestamp < CACHE_TTL) {
      const hasUpdate = isNewerVersion(cache.data.tagName, appVersion);
      return http.respondJson(
        res,
        {
          ok: true,
          currentVersion: appVersion,
          latestVersion: cache.data.tagName,
          hasUpdate,
          releaseUrl: hasUpdate ? cache.data.htmlUrl : null,
        },
        200
      );
    }

    // 緩存過期，重新拉取
    try {
      const release = await fetchLatestRelease();
      cache.data = release;
      cache.timestamp = now;
      log(`[updates] Fetched latest release: ${release.tagName}`);

      const hasUpdate = isNewerVersion(release.tagName, appVersion);
      return http.respondJson(
        res,
        {
          ok: true,
          currentVersion: appVersion,
          latestVersion: release.tagName,
          hasUpdate,
          releaseUrl: hasUpdate ? release.htmlUrl : null,
        },
        200
      );
    } catch (err) {
      error(`[updates] Fetch failed: ${err.message}`);
      return http.respondJson(
        res,
        {
          ok: true,
          currentVersion: appVersion,
          latestVersion: null,
          hasUpdate: false,
          releaseUrl: null,
        },
        200
      );
    }
  });
};
