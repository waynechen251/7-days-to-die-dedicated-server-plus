const fs = require("fs");
const path = require("path");
const localizationCsv = require("./localizationCsv");

// 集中常數：兩項待驗證風險的決定點，事後依實機測試結果在此一行修正即可。
const MOD_DIR_NAME = "ServerPlus_Localization";
// 輸出檔名固定放在 Mod 根目錄（或改成 "Config/" 子目錄，依實測結果調整），
// 副檔名則依官方安裝實際格式（.csv / .txt）動態決定，見 resolveLocalizationFileName()。
const CSV_HEADERS = [
  "Key", "File", "Type", "UsedInMainMenu", "NoTranslate", "KeepLoaded",
  "english", "Context / Alternate Text", "german", "spanish", "french",
  "italian", "japanese", "koreana", "polish", "brazilian", "russian",
  "turkish", "schinese", "tchinese",
];

// 所有可編輯的語言欄位（對應 CSV_HEADERS 內的語言欄，依官方欄位順序排列）。
// 編輯器不限定繁中，逐筆 entry 可同時編輯這裡列出的任一語言。
const LANGUAGE_COLUMNS = [
  "english", "german", "spanish", "french", "italian", "japanese",
  "koreana", "polish", "brazilian", "russian", "turkish", "schinese", "tchinese",
];

function resolveModDir(GAME_DIR) {
  return path.join(GAME_DIR, "Mods", MOD_DIR_NAME);
}

// 2.6 以前官方安裝是 Localization.txt（少 KeepLoaded 欄，19 欄），
// 3.0+ 官方安裝是 Localization.csv（20 欄）。兩者內容皆為逗號分隔、
// 雙引號跳脫規則相同的 CSV 格式，差異只在副檔名與欄位集合。
function resolveLocalizationFileName(format) {
  return format === "txt" ? "Localization.txt" : "Localization.csv";
}

function resolveCsvPath(GAME_DIR, format) {
  return path.join(resolveModDir(GAME_DIR), resolveLocalizationFileName(format));
}

function resolveModInfoPath(GAME_DIR) {
  return path.join(resolveModDir(GAME_DIR), "ModInfo.xml");
}

function escapeXmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildModInfoXml({ displayName, version }) {
  return [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    "<xml>",
    `\t<Name value="${escapeXmlAttr(MOD_DIR_NAME)}" />`,
    `\t<DisplayName value="${escapeXmlAttr(displayName || MOD_DIR_NAME)}" />`,
    '\t<Description value="由 7DTD-DS-P 管理後台自動生成的翻譯優化包" />',
    '\t<Author value="7DTD-DS-P" />',
    `\t<Version value="${escapeXmlAttr(version || "1.0.0.0")}" />`,
    "</xml>",
  ].join("\n");
}

// entry 的欄位若留空，會 fallback 用官方原文（officialRow）。
// 7DTD 的增量合併是整列覆寫，若我們只填了某幾個語言、其餘留空，
// 沒有 fallback 的話會把官方其他語言的翻譯洗成空白，因此這裡一律補齊。
function entryToCsvRow(entry, officialRow, headers = CSV_HEADERS) {
  const row = {};
  headers.forEach((header) => {
    row[header] = "";
  });
  row.Key = entry.key;
  row.File = entry.file || officialRow?.File || "";
  row["Context / Alternate Text"] =
    entry.context || officialRow?.["Context / Alternate Text"] || "";
  LANGUAGE_COLUMNS.forEach((lang) => {
    row[lang] = entry.translations?.[lang] || officialRow?.[lang] || "";
  });
  return row;
}

function buildCsvRows(entries, officialRowByKey, headers = CSV_HEADERS) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.enabled !== false && String(entry?.key || "").trim())
    .map((entry) => entryToCsvRow(entry, officialRowByKey?.get(entry.key), headers));
}

// 防呆護欄：此功能絕對不能複寫官方的 Data/Config/Localization.csv
// （那份檔案不是 Mod 載入路徑，改了也不會真正影響玩家端）。
// 所有生成動作都只能寫進 Mods/ServerPlus_Localization/，這裡用顯式斷言擋下
// 任何「不小心讓寫入路徑等於官方路徑」的狀況，而不是靜默覆寫掉官方檔案。
function assertNotOfficialPath(targetPath, GAME_DIR) {
  const officialPath = path.resolve(resolveOfficialLocalizationPath(GAME_DIR));
  if (path.resolve(targetPath) === officialPath) {
    throw new Error(
      `安全防護：拒絕寫入官方語系檔 (${officialPath})，此功能只能輸出到 Mods/${MOD_DIR_NAME}/`
    );
  }
}

function writeFileAtomic(filePath, content, GAME_DIR) {
  if (GAME_DIR) assertNotOfficialPath(filePath, GAME_DIR);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function writeModFiles({ GAME_DIR, profile, appVersion }) {
  const officialPath = resolveOfficialLocalizationPath(GAME_DIR);
  const format = officialPath.toLowerCase().endsWith(".txt") ? "txt" : "csv";
  const headers = getOfficialHeaders(officialPath);

  const modDir = resolveModDir(GAME_DIR);
  const csvPath = resolveCsvPath(GAME_DIR, format);
  const modInfoPath = resolveModInfoPath(GAME_DIR);

  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.mkdirSync(path.dirname(modInfoPath), { recursive: true });

  writeFileAtomic(
    modInfoPath,
    buildModInfoXml({ displayName: profile?.displayName, version: appVersion }),
    GAME_DIR
  );

  const officialRowByKey = getOfficialCsvRowByKeyMap(officialPath);
  const rows = buildCsvRows(profile?.entries, officialRowByKey, headers);
  const csvTmpPath = `${csvPath}.tmp`;
  assertNotOfficialPath(csvPath, GAME_DIR);
  localizationCsv.writeFile(csvTmpPath, headers, rows, { withBom: false });
  fs.renameSync(csvTmpPath, csvPath);

  return { modDir, csvPath, modInfoPath, rowCount: rows.length };
}

function removeModFiles({ GAME_DIR }) {
  const modDir = resolveModDir(GAME_DIR);
  if (fs.existsSync(modDir)) {
    fs.rmSync(modDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

// 依序檢查 3.0+ 的 Localization.csv（20 欄，含 KeepLoaded）與 2.6 以前的
// Localization.txt（19 欄，無 KeepLoaded；內容仍是逗號分隔/雙引號跳脫的 CSV 格式），
// 回傳實際安裝中存在的那一份；都不存在時回傳 .csv 路徑供下游 existsSync 防呆判斷。
function resolveOfficialLocalizationPath(GAME_DIR) {
  const csvPath = path.join(GAME_DIR, "Data", "Config", "Localization.csv");
  if (fs.existsSync(csvPath)) return csvPath;
  const txtPath = path.join(GAME_DIR, "Data", "Config", "Localization.txt");
  if (fs.existsSync(txtPath)) return txtPath;
  return csvPath;
}

const OFFICIAL_PAGE_SIZE_DEFAULT = 50;
const OFFICIAL_PAGE_SIZE_MAX = 200;

// 官方 Localization.csv 約 16MB/25502 行，逐次重新解析約需 600ms+。
// 用 mtimeMs 判斷快取是否失效（官方檔幾乎不會變動，比定時 TTL 更準確）。
let officialCsvCache = { path: null, mtimeMs: 0, rows: null, byKey: null, headers: null };

function ensureOfficialCsvCache(officialCsvPath) {
  if (!officialCsvPath || !fs.existsSync(officialCsvPath)) return null;
  const stat = fs.statSync(officialCsvPath);
  if (
    officialCsvCache.path !== officialCsvPath ||
    officialCsvCache.mtimeMs !== stat.mtimeMs
  ) {
    const { headers, rows } = localizationCsv.readFile(officialCsvPath);
    officialCsvCache = { path: officialCsvPath, mtimeMs: stat.mtimeMs, rows, byKey: null, headers };
  }
  return officialCsvCache;
}

function getOfficialCsvRows(officialCsvPath) {
  return ensureOfficialCsvCache(officialCsvPath)?.rows || null;
}

function getOfficialCsvRowByKeyMap(officialCsvPath) {
  const cache = ensureOfficialCsvCache(officialCsvPath);
  if (!cache) return new Map();
  if (!cache.byKey) {
    cache.byKey = new Map(cache.rows.map((row) => [row.Key, row]));
  }
  return cache.byKey;
}

// 取得官方檔實際的欄位標頭（含 2.6 .txt 缺少 KeepLoaded 的情況），
// 找不到官方檔時 fallback 回 3.0+ 預設的 CSV_HEADERS（例如全新安裝、官方檔尚未生成）。
function getOfficialHeaders(officialCsvPath) {
  return ensureOfficialCsvCache(officialCsvPath)?.headers || CSV_HEADERS;
}

function rowToOfficialItem(row) {
  const translations = {};
  LANGUAGE_COLUMNS.forEach((lang) => {
    translations[lang] = row[lang] || "";
  });
  return {
    key: row.Key || "",
    file: row.File || "",
    context: row["Context / Alternate Text"] || "",
    translations,
  };
}

function scanOfficialCsvKeys({ officialCsvPath, search, page, pageSize }) {
  const size = Math.min(
    OFFICIAL_PAGE_SIZE_MAX,
    Number.isInteger(pageSize) && pageSize > 0 ? pageSize : OFFICIAL_PAGE_SIZE_DEFAULT
  );

  const rows = getOfficialCsvRows(officialCsvPath);
  if (!rows) {
    return { total: 0, items: [], page: 0, pageSize: size, totalPages: 0 };
  }

  const needle = String(search || "").trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => {
        const key = String(row.Key || "").toLowerCase();
        const english = String(row.english || "").toLowerCase();
        return key.includes(needle) || english.includes(needle);
      })
    : rows;

  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(
    Math.max(0, Number.isInteger(page) && page >= 0 ? page : 0),
    totalPages - 1
  );
  const start = currentPage * size;
  const items = filtered.slice(start, start + size).map(rowToOfficialItem);

  return { total: filtered.length, items, page: currentPage, pageSize: size, totalPages };
}

function readGeneratedCsvPreview({ GAME_DIR }) {
  const csvPath = resolveCsvPath(GAME_DIR, "csv");
  if (fs.existsSync(csvPath)) return localizationCsv.readFile(csvPath);
  const txtPath = resolveCsvPath(GAME_DIR, "txt");
  if (fs.existsSync(txtPath)) return localizationCsv.readFile(txtPath);
  return null;
}

module.exports = {
  MOD_DIR_NAME,
  CSV_HEADERS,
  LANGUAGE_COLUMNS,
  resolveModDir,
  resolveLocalizationFileName,
  resolveCsvPath,
  resolveModInfoPath,
  resolveOfficialLocalizationPath,
  buildModInfoXml,
  entryToCsvRow,
  buildCsvRows,
  writeModFiles,
  removeModFiles,
  getOfficialCsvRowByKeyMap,
  getOfficialHeaders,
  scanOfficialCsvKeys,
  readGeneratedCsvPreview,
};
