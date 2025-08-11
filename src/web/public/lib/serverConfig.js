const fs = require("fs");

function readValues(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/);
  const map = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.includes("<property")) continue;
    const m = line.match(/<property\s+([^>]*?)\/>/i);
    if (!m) continue;

    const idxProp = line.indexOf("<property");
    const idxCmtStart = line.indexOf("<!--");
    const isCommented =
      idxCmtStart !== -1 && idxCmtStart < idxProp && line.includes("-->");

    const attrStr = m[1];

    const nameM = attrStr.match(/name\s*=\s*"([^"]*)"/i);
    const valueM = attrStr.match(/value\s*=\s*"([^"]*)"/i);
    if (!nameM) continue;
    const name = nameM[1];
    const value = valueM ? valueM[1] : "";

    let comment = "";
    const after = rawLine.split(/\/>/)[1] || "";
    const inlineDocMatch = after.match(/<!--(.*?)-->/);
    if (inlineDocMatch) comment = inlineDocMatch[1].trim();

    const existing = map.get(name);
    if (!existing) {
      map.set(name, { name, value, commented: isCommented, comment });
    } else {
      if (existing.commented && !isCommented) {
        map.set(name, {
          name,
          value,
          commented: false,
          comment: comment || existing.comment,
        });
      }
    }
  }

  return {
    items: Array.from(map.values()),
  };
}

function writeValues(filePath, updates) {
  let txt = fs.readFileSync(filePath, "utf-8");
  let changed = [];
  function escReg(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  }
  for (const [name, value] of Object.entries(updates || {})) {
    const nameEsc = escReg(name);
    const re = new RegExp(
      `(<property\\s+[^>]*name="${nameEsc}"[^>]*value=")([^"]*)(")([^>]*\\/>)`,
      "i"
    );
    if (re.test(txt)) {
      txt = txt.replace(re, (_m, p1, _old, p3, p4) => {
        return `${p1}${value}${p3}${p4}`;
      });
      changed.push(name);
    }
  }
  if (changed.length) {
    fs.writeFileSync(filePath, txt, "utf-8");
  }
  return { changed };
}

module.exports = { readValues, writeValues };
