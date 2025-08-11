(function (w) {
  const App = (w.App = w.App || {});
  let es = null;

  function connectSSE() {
    if (es) es.close();
    es = new EventSource(
      `/api/stream?topics=system,steamcmd,game,telnet,backup&replay=1000`
    );
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data);
      App.console.appendStamped(e.topic, e.text, e.ts);
    };
    es.addEventListener("ping", () => {});
    es.onerror = () => setTimeout(connectSSE, 2000);
  }

  App.sse = { connectSSE };
})(window);
