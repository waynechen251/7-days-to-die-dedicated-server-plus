# AI Agent 指南 - 7DTD Dedicated Server Plus

本檔案是此專案所有 AI Agent 的共用知識來源。

## 專案概述

這是一個 Windows 平台的七日殺 (7 Days to Die) 專用伺服器管理工具。後端使用 Node.js + Express，前端使用原生 JavaScript，最終可透過 pkg 打包為單一執行檔。

參考文件：
- 詳細架構與 API：`docs/ARCHITECTURE.md`
- 開發流程與貢獻方式：`CONTRIBUTING.md`
- 格式規則：`.editorconfig`

## 技術棧

| 層級 | 技術 |
|------|------|
| 後端 | Node.js + Express |
| 前端 | 原生 JavaScript (無框架) |
| 打包 | pkg (單一執行檔) |
| 進程管理 | 自製 processManager |
| 即時通訊 | SSE (Server-Sent Events) |

## 基本代碼風格

### 後端

- 使用 CommonJS 模組系統（`require` / `module.exports`）
- 2 空格縮排
- 字串使用雙引號 `"`
- 使用 `const` / `let`，避免 `var`
- 日誌統一使用 `log()` 與 `error()`

### 前端

- 使用 IIFE 模式封裝模組
- 掛載到 `window.App` 命名空間
- 2 空格縮排
- 不使用 ES6 模組

### HTML / CSS / i18n

- HTML 使用 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title`
- CSS 保持現有拆分方式，避免把樣式集中回單一大檔
- 翻譯檔位於 `src/web/public/locales/`，預設語系為 `zh-TW`
- 若新增可翻譯文案，統一併入既有 `src/web/public/locales/zh-TW.json`、`en.json`、`zh-CN.json`
- 不要自行新增額外語系目錄或平行語系檔（例如 `locales/sandbox/*.json`）

## 必知限制

### pkg 路徑處理

`server.js` 使用以下模式決定執行根目錄：

```javascript
const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();
```

- 任何外部檔案路徑都必須從 `baseDir` 衍生
- 不要用 `__dirname` 指向 `server.json`、`users.json`、遊戲目錄或備份目錄
- 若修改設定檔或帳戶檔讀寫邏輯，要保留 BOM 去除（`.replace(/^\uFEFF/, "")`）

### 設定檔與資料遷移

- 設定檔優先讀取 `server.json`，不存在時退回 `server.sample.json`
- 現有程式會把 `game_server.saves` 遷移到 `game_server.UserDataFolder`
- 若變更設定 schema，要同步檢查 `server.sample.json` 與遷移邏輯是否仍正確

### 路由註冊模式

- 路由檔必須匯出 `module.exports = function (app, ctx) {}`
- 共享依賴全部來自 `server.js` 的 `routeContext`
- 取設定時用 `ctx.getConfig()`，不要快取 `CONFIG` 副本
- 新增路由後，必須在 `server.js` 內註冊 `require("./lib/routes/xxx")(app, routeContext)`

### HTTP 回應模式

- API 回應優先使用 `http.sendOk()`、`http.sendErr()` 或 `http.respondJson()`
- 不要在一般 API 路由中直接 `res.json()`，除非你明確要繞過既有格式
- 長時間輸出使用 `http.writeStamped(res, line)`

### 認證與權限

- `/api` 路由會經過 `auth.requireAuth` 與 `auth.checkPermission`
- SSE 端點 `/api/stream` 是例外，認證在 `eventBus.sseHandler()` 內自行處理
- 角色分為 `admin`、`operator`、`viewer`
- `viewer` 只能做 GET；`operator` 仍有額外限制，修改權限相關功能時要先讀 `lib/auth.js` 與 `lib/routes/auth.js`

### processManager 使用

- `processManager.gameServer.isRunning`、`processManager.steamCmd.isRunning` 可直接判斷狀態
- `onlinePlayers`、`fps`、`heapMB`、`maxMB`、`chunks` 等值可能為 `null`
- `checkTelnet()` 這類方法是 async，不能當同步值使用

### eventBus 使用

- 允許的 topic 只有 `system`、`steamcmd`、`game`、`telnet`、`backup`
- 每個 topic 緩衝上限 1000 筆，超出會丟掉最舊事件
- 長時間操作應持續 push 進度，不要只在結尾回一次結果

### 前端模組載入順序

- 前端模組不是 ESM，而是依賴 `index.html` 內的 `<script defer>` 順序
- `bootstrap.js` 是初始化入口，必須維持最後載入
- 新增前端模組時，先確認它依賴哪些 `window.App` 模組，再插入正確位置

### i18n 與 UI 變更

- 新增文案或 UI 功能時，預設同步更新 `zh-TW`、`en`、`zh-CN`
- 不要把可翻譯內容直接硬寫在 HTML 或前端 JS 中，除非是除錯輸出或純技術字串
- `SandboxCode` 相關翻譯目前也統一放在三個主語系檔中，鍵位於 `modal.serverconfig.sandbox.*`

### SandboxCode 實作邊界

- `Assembly-CSharp` 僅供比對官方規則，不可作為執行期依賴
- 執行期 `SandboxCode` schema 來源為 `src/web/lib/data/sandbox-schema.json`
- 後端編解碼實作位於 `src/web/lib/sandboxCode.js`
- API 位於 `src/web/lib/routes/sandbox.js`，目前提供：
  - `GET /api/sandbox/schema`
  - `POST /api/sandbox/decode`
  - `POST /api/sandbox/encode`
- 前端 `SandboxCode` UI 目前併入 `serverconfig.xml` modal，且必須與 `SandboxCode` 欄位本身直接綁定

## 修改原則

- 每次修改都優先做最小且聚焦的變更，避免順手重構無關區域
- 修改前先閱讀既有實作，沿用現有模式，不自行發明新抽象
- 若某份知識已經存在於原始碼或架構文檔，優先引用，不要再複製一份規則
- 任何會影響 Windows、pkg、auth、processManager、eventBus 的修改，都要先確認對應原始碼限制

## 禁止事項

- 不引入前端框架
- 不破壞既有 IIFE + `window.App` 模式
- 不忽略 Windows 平台前提
