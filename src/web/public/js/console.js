(function (w) {
  const App = (w.App = w.App || {});
  const { panes, tabBtns } = App.dom;
  const { stamp } = App.utils;
  const S = App.state;

  const lastNormLine = {
    system: "",
    steamcmd: "",
    game: "",
    telnet: "",
    backup: "",
  };

  function normalizeForDedupe(text) {
    let s = String(text || "");
    s = s.replace(/^\s*\[[^\]]+\]\s*/g, "");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  function switchTab(tab) {
    if (!panes[tab]) return;
    S.activeTab = tab;
    document
      .querySelectorAll(".console-tabs button")
      .forEach((b) => b.classList.remove("active"));
    tabBtns[tab].classList.add("active");
    tabBtns[tab].classList.remove("unread");
    document
      .querySelectorAll(".console")
      .forEach((p) => p.classList.remove("active"));
    panes[tab].classList.add("active");
    panes[tab].scrollTop = panes[tab].scrollHeight;

    S.lastRead[tab] = Date.now();
    S.persistLastRead();
    if (S.lastSeen[tab] && S.lastSeen[tab] > S.lastRead[tab]) {
      S.lastRead[tab] = S.lastSeen[tab];
      S.persistLastRead();
    }
  }

  function restoreUnreadBadges() {
    Object.keys(panes).forEach((topic) => {
      tabBtns[topic]?.classList.remove("unread");
    });
  }

  function appendLog(topic, line, ts) {
    const p = panes[topic] || panes.system;
    const nearBottom = p.scrollTop + p.clientHeight >= p.scrollHeight - 5;

    const norm = normalizeForDedupe(line);
    if (norm && lastNormLine[topic] === norm) {
      return;
    }
    lastNormLine[topic] = norm;

    p.textContent += line.endsWith("\n") ? line : line + "\n";
    if (topic === S.activeTab && nearBottom) p.scrollTop = p.scrollHeight;

    const t = Number(ts) || Date.now();
    S.lastSeen[topic] = Math.max(S.lastSeen[topic] || 0, t);
    S.persistLastSeen();
    const btn = tabBtns[topic];
    if (btn) {
      btn.classList.remove("unread");
    }
  }

  function appendStamped(topic, text, ts) {
    appendLog(topic, stamp(ts, text), ts);
  }

  App.console = { switchTab, appendLog, appendStamped, restoreUnreadBadges };
})(window);
