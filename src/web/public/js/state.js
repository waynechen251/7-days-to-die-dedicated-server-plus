(function (w) {
  const App = (w.App = w.App || {});
  const LS_KEY_READ = "console.lastRead";
  const LS_KEY_SEEN = "console.lastSeen";

  function loadLast(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...fallback };
      const obj = JSON.parse(raw);
      return { ...fallback, ...obj };
    } catch (_) {
      return { ...fallback };
    }
  }
  function save(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
    } catch (_) {}
  }

  App.state = {
    activeTab: "system",
    lastRead: loadLast(LS_KEY_READ, {
      system: 0,
      steamcmd: 0,
      game: 0,
      telnet: 0,
      backup: 0,
    }),
    lastSeen: loadLast(LS_KEY_SEEN, {
      system: 0,
      steamcmd: 0,
      game: 0,
      telnet: 0,
      backup: 0,
    }),
    persistLastRead() {
      save(LS_KEY_READ, this.lastRead);
    },
    persistLastSeen() {
      save(LS_KEY_SEEN, this.lastSeen);
    },

    current: {
      backendUp: false,
      steamRunning: false,
      gameRunning: false,
      telnetOk: false,
    },
    hasEverConnected: false,
    backupInProgress: false,

    installedVersion: "",
    hasInstalled: false,
    versionNeedsInstall: false,

    cfg: {
      original: null,
      commentedOriginal: null, // 新增: Map(name -> commented:boolean)
      locked: false,
      worldList: [],
      lastCheck: { passAll: false, results: [] },
    },

    worldMap: new Map(),
  };
})(window);
