const fs = require("fs");
const readline = require("readline");

function tailFile(file, onLine) {
  let pos = 0;
  let watching = true;

  function readFrom(start) {
    try {
      const stream = fs.createReadStream(file, { encoding: "utf8", start });
      const rl = readline.createInterface({ input: stream });
      rl.on("line", (line) => onLine(line));
    } catch (_) {}
  }

  function statAndRead() {
    if (!watching) return;
    fs.stat(file, (err, st) => {
      if (err) return;
      if (st.size > pos) {
        readFrom(pos);
        pos = st.size;
      }
    });
  }

  const watcher = fs.watch(file, { persistent: true }, statAndRead);
  statAndRead();

  return () => {
    watching = false;
    try {
      watcher.close();
    } catch (_) {}
  };
}

module.exports = { tailFile };
