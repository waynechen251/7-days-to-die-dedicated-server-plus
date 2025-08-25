const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const archiver = require("archiver");
const extract = require("extract-zip");
const yauzl = require("yauzl");

function esc(s) {
  return String(s);
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function wrapArchive(promise) {
  return promise.then(() => ({ stdout: "", stderr: "" }));
}

function createArchive(dst) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(dst);
    const archive = archiver("zip", { zlib: { level: 9 } });
    let finished = false;

    function done(err) {
      if (finished) return;
      finished = true;
      if (err) reject(err);
      else resolve();
    }

    output.on("close", () => done());
    output.on("error", done);
    archive.on("error", done);

    archive.pipe(output);
    resolve({ archive, finalize: () => archive.finalize() });
  });
}

function zipDirectory(srcDir, outZip) {
  const src = path.resolve(srcDir);
  const dst = path.resolve(outZip);
  ensureDir(path.dirname(dst));
  return wrapArchive(
    (async () => {
      const { archive, finalize } = await createArchive(dst);
      archive.directory(src, path.basename(src));
      await finalize();
    })()
  );
}

function zipDirectoryContents(srcDir, outZip) {
  const src = path.resolve(srcDir);
  const dst = path.resolve(outZip);
  ensureDir(path.dirname(dst));
  return wrapArchive(
    (async () => {
      const { archive, finalize } = await createArchive(dst);
      archive.directory(src, false);
      await finalize();
    })()
  );
}

async function walkDir(base) {
  const entries = [];
  async function recur(dir) {
    const rel = path.relative(base, dir);
    const dirents = await fsp.readdir(dir, { withFileTypes: true });
    if (dirents.length === 0) {
      entries.push({ type: "dir", rel });
    }
    let hasFileInside = false;
    for (const d of dirents) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        await recur(full);
      } else if (d.isFile()) {
        hasFileInside = true;
        const relFile = path.relative(base, full);
        entries.push({ type: "file", rel: relFile, full });
      }
    }
  }
  await recur(base);
  return entries;
}

function addEntriesPrefixed(archive, baseDir, prefix) {
  return walkDir(baseDir).then((entries) => {
    for (const e of entries) {
      const internalPath = prefix
        ? path.posix.join(prefix, e.rel.split(path.sep).join("/"))
        : e.rel.split(path.sep).join("/");
      if (e.type === "file") {
        archive.file(path.join(baseDir, e.rel), { name: internalPath });
      } else if (e.type === "dir") {
        archive.append("", {
          name: internalPath.endsWith("/") ? internalPath : internalPath + "/",
        });
      }
    }
  });
}

function zipSavesRoot(savesRoot, outZip) {
  const src = path.resolve(savesRoot);
  const dst = path.resolve(outZip);
  ensureDir(path.dirname(dst));
  return wrapArchive(
    (async () => {
      const { archive, finalize } = await createArchive(dst);
      await addEntriesPrefixed(archive, src, "Saves");
      await finalize();
    })()
  );
}

function zipSingleWorldGame(savesRoot, world, name, outZip) {
  const gameDir = path.resolve(savesRoot, world, name);
  if (!fs.existsSync(gameDir)) throw new Error("來源存檔不存在");
  const dst = path.resolve(outZip);
  ensureDir(path.dirname(dst));
  return wrapArchive(
    (async () => {
      const { archive, finalize } = await createArchive(dst);
      const prefix = path.posix.join(world, name);
      await addEntriesPrefixed(archive, gameDir, prefix);
      await finalize();
    })()
  );
}

function unzipArchive(zipPath, destDir) {
  const zip = path.resolve(zipPath);
  const dst = path.resolve(destDir);
  ensureDir(dst);
  return wrapArchive(
    (async () => {
      await extract(zip, { dir: dst });
    })()
  );
}

async function inspectZip(zipPath) {
  const zip = path.resolve(zipPath);
  const entries = await new Promise((resolve, reject) => {
    const list = [];
    yauzl.open(zip, { lazyEntries: true }, (err, zf) => {
      if (err) return reject(err);
      zf.readEntry();
      zf.on("entry", (entry) => {
        const name = entry.fileName.replace(/\\/g, "/");
        list.push(name);
        zf.readEntry();
      });
      zf.on("end", () => {
        zf.close();
        resolve(list);
      });
      zf.on("error", reject);
    });
  });

  const pairs = [];
  for (const p of entries) {
    const m = p.match(/^([^/]+)\/?([^/]*)/);
    if (m) pairs.push({ first: m[1], second: m[2] });
  }
  const tops = [...new Set(pairs.map((p) => p.first))];
  let out = { type: "unknown", world: null, name: null };
  if (tops.length === 1) {
    const t = String(tops[0]);
    if (t.toLowerCase() === "saves") {
      out.type = "full";
    } else {
      out.type = "world";
      out.world = t;
      const seconds = [
        ...new Set(
          pairs.filter((p) => p.first === t && p.second).map((p) => p.second)
        ),
      ];
      if (seconds.length === 1) out.name = seconds[0];
    }
  }
  return out;
}

module.exports = {
  zipDirectory,
  zipDirectoryContents,
  zipSavesRoot,
  zipSingleWorldGame,
  unzipArchive,
  inspectZip,
};
