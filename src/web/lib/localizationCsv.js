"use strict";

const fs = require("fs");

const BOM = "﻿";

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

// 解析單行 CSV，處理欄位內含逗號與雙引號跳脫（""）的狀況
function parseLine(line) {
  const result = [];
  let curVal = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          curVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        curVal += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(curVal);
      curVal = "";
    } else {
      curVal += char;
    }
  }
  result.push(curVal);
  return result;
}

// 將整份 CSV 文字解析為 { headers, rows }，rows 為依 headers 對應的物件陣列
function parse(text) {
  const raw = stripBom(String(text || "")).trim();
  if (!raw) {
    return { headers: [], rows: [] };
  }
  const lines = raw.split(/\r?\n/);
  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "") continue;
    const cols = parseLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] !== undefined ? cols[idx] : "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

function readFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parse(text);
}

// 依 CSV 規則跳脫單一欄位值：含逗號、雙引號或換行時以雙引號包覆，內部雙引號加倍
function escapeField(value) {
  const str = value === undefined || value === null ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 將 headers + rows（物件陣列）組裝為 CSV 文字（不含 BOM）
function stringify(headers, rows) {
  const lines = [headers.map(escapeField).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeField(row[header])).join(","));
  }
  return lines.join("\r\n");
}

// 寫出 CSV 檔供 7DTD 解析器讀取。
// 經比對真實 v3.0 安裝的 Data/Config/Localization.csv，官方檔案本身不帶 BOM，
// 故預設不寫 BOM；withBom 僅保留供未來個案需要時使用。
function writeFile(filePath, headers, rows, { withBom = false } = {}) {
  const csvText = stringify(headers, rows);
  fs.writeFileSync(filePath, (withBom ? BOM : "") + csvText, "utf8");
}

module.exports = {
  parseLine,
  parse,
  readFile,
  escapeField,
  stringify,
  writeFile,
};
