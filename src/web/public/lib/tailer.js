const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * 追蹤檔案新增的內容（預設從結尾開始，類似 tail -f）
 * @param {string} filePath
 * @param {(line:string)=>void} onLine
 * @param {{ fromBeginning?: boolean, pollIntervalMs?: number }} [options]
 * @returns {() => void} 停止追蹤的函式
 */
function tailFile(filePath, onLine, options = {}) {
  const fromBeginning = !!options.fromBeginning; // 預設 false：從結尾開始
  const pollIntervalMs = options.pollIntervalMs || 500;

  let stopped = false;
  let stopFn = null;

  // 以外部工具優先（較穩定）：Windows 用 PowerShell，其它平台用 tail -F
  const tryExternal = () => {
    if (process.platform === "win32") {
      const psCmd = buildPowershellTailCommand(filePath, fromBeginning);
      const child = spawn("powershell.exe", psCmd, { windowsHide: true });

      let buf = "";
      const flush = () => {
        if (!buf) return;
        const parts = buf.split(/\r?\n/);
        // 最後一段可能是殘缺行，先保留在 buf
        buf = parts.pop() || "";
        for (const line of parts) safeEmit(line);
      };

      child.stdout.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        flush();
      });
      child.stderr.on("data", () => {
        // 忽略噪音；若整體失敗會走 close 分支
      });
      child.on("close", (code) => {
        flush();
        if (!stopped && code !== 0) {
          // 外部方式失敗，改用輪詢
          stopFn = startPollingTail(filePath, onLine, {
            fromBeginning,
            pollIntervalMs,
          });
        }
      });
      child.on("error", () => {
        // 直接 fallback
        stopFn = startPollingTail(filePath, onLine, {
          fromBeginning,
          pollIntervalMs,
        });
      });

      stopFn = () => {
        stopped = true;
        try {
          child.kill("SIGTERM");
        } catch (_) {}
      };
      return true;
    } else {
      // *nix / macOS
      // -n 0 從結尾開始，-F 追蹤檔案並處理移動/重建
      const args = fromBeginning
        ? ["-n", "+1", "-F", filePath]
        : ["-n", "0", "-F", filePath];
      const child = spawn("tail", args);

      let buf = "";
      const flush = () => {
        if (!buf) return;
        const parts = buf.split(/\r?\n/);
        buf = parts.pop() || "";
        for (const line of parts) safeEmit(line);
      };

      child.stdout.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        flush();
      });
      child.stderr.on("data", () => {});
      child.on("close", (code) => {
        flush();
        if (!stopped && code !== 0) {
          stopFn = startPollingTail(filePath, onLine, {
            fromBeginning,
            pollIntervalMs,
          });
        }
      });
      child.on("error", () => {
        stopFn = startPollingTail(filePath, onLine, {
          fromBeginning,
          pollIntervalMs,
        });
      });

      stopFn = () => {
        stopped = true;
        try {
          child.kill("SIGTERM");
        } catch (_) {}
      };
      return true;
    }
  };

  // 先試外部工具，不行才 fallback
  tryExternal();

  return () => {
    stopped = true;
    if (typeof stopFn === "function") {
      try {
        stopFn();
      } catch (_) {}
    }
  };

  // ---- helpers ----

  function safeEmit(line) {
    try {
      onLine(String(line));
    } catch (_) {}
  }
}

/**
 * Windows 用 PowerShell tail 命令
 * 以 UTF-8 輸出，-Wait 持續等待新內容
 */
function buildPowershellTailCommand(filePath, fromBeginning) {
  // 單引號轉義
  const esc = (s) => String(s).replace(/'/g, "''");
  const p = path.resolve(filePath);
  const setEncoding = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;";
  const tailArg = fromBeginning ? "-Tail 9999999" : "-Tail 0";
  // 指定 UTF8 讀取，避免中文亂碼
  const script = `${setEncoding} Get-Content -Path '${esc(
    p
  )}' -Wait ${tailArg} -Encoding UTF8`;
  return ["-NoProfile", "-NonInteractive", "-Command", script];
}

/**
 * 純 Node 輪詢 tail（任何平台皆可用）
 * 透過 stat 檢查大小變化，讀取增量區塊
 */
function startPollingTail(filePath, onLine, { fromBeginning, pollIntervalMs }) {
  let pos = 0;
  let timer = null;
  let reading = false;
  let stopped = false;
  let leftover = "";

  const readChunk = (start, end) =>
    new Promise((resolve) => {
      const stream = fs.createReadStream(filePath, {
        encoding: "utf8",
        start,
        end: end > start ? end - 1 : end,
      });
      stream.on("data", (chunk) => {
        leftover += chunk;
        const parts = leftover.split(/\r?\n/);
        leftover = parts.pop() || "";
        for (const line of parts) {
          try {
            onLine(line);
          } catch (_) {}
        }
      });
      stream.on("error", () => resolve());
      stream.on("end", () => resolve());
    });

  const tick = async () => {
    if (reading || stopped) return;
    reading = true;
    try {
      const st = await statSafe(filePath);
      if (!st) {
        // 檔案暫時不存在
        return;
      }
      if (pos === 0) {
        pos = fromBeginning ? 0 : st.size; // 初始定位
      }
      if (st.size < pos) {
        // 可能被截斷/重建
        pos = fromBeginning ? 0 : st.size;
      } else if (st.size > pos) {
        const start = pos;
        const end = st.size;
        await readChunk(start, end);
        pos = end;
      }
    } finally {
      reading = false;
    }
  };

  timer = setInterval(tick, pollIntervalMs);
  // 立即跑一次，避免等下一個 interval
  tick();

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

function statSafe(p) {
  return new Promise((resolve) => {
    fs.stat(p, (err, st) => resolve(err ? null : st));
  });
}

module.exports = { tailFile };
