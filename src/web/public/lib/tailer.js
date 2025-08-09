const fs = require("fs");
const path = require("path");
const readline = require("readline");

/** 追蹤檔案新增內容；回傳關閉函式 */
function tailFile(file, onLine) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const baseLower = base.toLowerCase();

  let pos = 0;
  let watching = true;
  let watcher = null;
  let initialized = false;

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
      if (err) return; // 尚未存在
      if (!initialized) {
        pos = st.size; // 初次從結尾開始
        initialized = true;
        return;
      }
      if (st.size > pos) {
        readFrom(pos);
        pos = st.size;
      }
    });
  }

  try {
    watcher = fs.watch(file, { persistent: true }, statAndRead);
  } catch (e) {
    // 檔案尚未存在時退回監聽目錄
    if (e && e.code === "ENOENT") {
      watcher = fs.watch(dir, { persistent: true }, (_evt, filename) => {
        if (filename && filename.toLowerCase() === baseLower) statAndRead();
      });
    } else {
      throw e;
    }
  }

  // 啟動時先探測一次
  statAndRead();

  return () => {
    watching = false;
    try {
      watcher && watcher.close();
    } catch (_) {}
  };
}

module.exports = { tailFile };
