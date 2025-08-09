const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function tailFile(filePath, onLine, options = {}) {
  const fromBeginning = !!options.fromBeginning;
  const pollIntervalMs = options.pollIntervalMs || 500;

  let stopped = false;
  let stopFn = null;

  const tryExternal = () => {
    if (process.platform === "win32") {
      const psCmd = buildPowershellTailCommand(filePath, fromBeginning);
      const child = spawn("powershell.exe", psCmd, { windowsHide: true });

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
    } else {
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

  tryExternal();

  return () => {
    stopped = true;
    if (typeof stopFn === "function") {
      try {
        stopFn();
      } catch (_) {}
    }
  };

  function safeEmit(line) {
    try {
      onLine(String(line));
    } catch (_) {}
  }
}

function buildPowershellTailCommand(filePath, fromBeginning) {
  const esc = (s) => String(s).replace(/'/g, "''");
  const p = path.resolve(filePath);
  const setEncoding = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;";
  const tailArg = fromBeginning ? "-Tail 9999999" : "-Tail 0";
  const script = `${setEncoding} Get-Content -Path '${esc(
    p
  )}' -Wait ${tailArg} -Encoding UTF8`;
  return ["-NoProfile", "-NonInteractive", "-Command", script];
}
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
        return;
      }
      if (pos === 0) {
        pos = fromBeginning ? 0 : st.size;
      }
      if (st.size < pos) {
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
