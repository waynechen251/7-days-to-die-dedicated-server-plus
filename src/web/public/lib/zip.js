const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

/**
 * 壓縮整個資料夾到 zip（遞迴、壓縮）
 * @param {string} srcDir 要壓縮的資料夾
 * @param {string} destZipPath 目標 zip 路徑
 * @returns {Promise<void>}
 */
function zipDirectory(srcDir, destZipPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destZipPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const output = fs.createWriteStream(destZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => resolve());
    output.on("error", reject);

    archive.on("warning", (err) => {
      if (err?.code === "ENOENT") console.warn(err);
      else reject(err);
    });
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

module.exports = { zipDirectory };
