const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function psArgs(script) {
  return ["-NoProfile", "-NonInteractive", "-Command", script];
}
function esc(s) {
  return String(s).replace(/'/g, "''");
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * 以 PowerShell 壓縮資料夾內容(等同於 Compress-Archive -Path "<src>\*")
 * 不包含最外層資料夾本身，只收其中內容。
 */
function zipDirectory(srcDir, outZip) {
  return new Promise((resolve, reject) => {
    const src = path.resolve(srcDir);
    const dst = path.resolve(outZip);
    ensureDir(path.dirname(dst));
    const script = [
      "$ErrorActionPreference='Stop';",
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;",
      `if (Test-Path -LiteralPath '${esc(
        dst
      )}') { Remove-Item -LiteralPath '${esc(dst)}' -Force; }`,
      // 以 * 包含內容
      `Compress-Archive -Path '${esc(src)}\\*' -DestinationPath '${esc(
        dst
      )}' -CompressionLevel Optimal -Force;`,
    ].join(" ");
    const child = execFile(
      "powershell.exe",
      psArgs(script),
      { windowsHide: true },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
    child.on("error", reject);
  });
}

/**
 * 以 PowerShell 解壓縮至目標資料夾
 */
function unzipArchive(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const zip = path.resolve(zipPath);
    const dst = path.resolve(destDir);
    ensureDir(dst);
    const script = [
      "$ErrorActionPreference='Stop';",
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;",
      `Expand-Archive -LiteralPath '${esc(zip)}' -DestinationPath '${esc(
        dst
      )}' -Force;`,
    ].join(" ");
    const child = execFile(
      "powershell.exe",
      psArgs(script),
      { windowsHide: true },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
    child.on("error", reject);
  });
}

module.exports = { zipDirectory, unzipArchive };
