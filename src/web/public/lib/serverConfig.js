const fs = require("fs");
const path = require("path");

function readValues(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf-8").replace(/^\uFEFF/, "");
  const items = [];
  const re =
    /<property\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*\/?>/gi;
  let m;
  while ((m = re.exec(xml))) {
    items.push({ name: m[1], value: xmlDecode(m[2]) });
  }
  return { xml, items };
}

function writeValues(xmlPath, updates = {}) {
  let xml = fs.readFileSync(xmlPath, "utf-8").replace(/^\uFEFF/, "");
  const changed = [];

  for (const [rawName, rawVal] of Object.entries(updates)) {
    const name = String(rawName);
    const val = xmlEncode(String(rawVal));

    const re1 = new RegExp(
      `(<property\\b[^>]*\\bname\\s*=\\s*"${escapeReg(
        name
      )}"[^>]*\\bvalue\\s*=\\s*")([^"]*)(")`,
      "i"
    );
    const re2 = new RegExp(
      `(<property\\b[^>]*\\bvalue\\s*=\\s*")[^"]*("(?=[^>]*\\bname\\s*=\\s*"${escapeReg(
        name
      )}"))`,
      "i"
    );

    if (re1.test(xml)) {
      xml = xml.replace(re1, `$1${val}$3`);
      changed.push(name);
      continue;
    }
    if (re2.test(xml)) {
      xml = xml.replace(re2, `$1${val}$2`);
      changed.push(name);
      continue;
    }
  }

  if (changed.length) fs.writeFileSync(xmlPath, xml, "utf-8");
  return { changed };
}

function xmlEncode(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function xmlDecode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
function escapeReg(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

module.exports = { readValues, writeValues };
