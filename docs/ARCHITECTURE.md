# 架構文檔 - 7DTD Dedicated Server Plus

本文檔描述專案的整體架構，供 Claude 和 Gemini 作為共享知識庫使用。

---

## 系統架構

```
┌─────────────────────────────────────────────────────────────────┐
│                         用戶瀏覽器                               │
│                      (Chrome, Edge, etc.)                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP / SSE
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js + Express                             │
│                      (server.js)                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Routes    │  │  EventBus   │  │   Static    │             │
│  │   (API)     │  │   (SSE)     │  │   Files     │             │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘             │
│         │                │                                       │
│         ▼                ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Process Manager                         │   │
│  │  ┌─────────────┐         ┌─────────────────────────┐    │   │
│  │  │  SteamCMD   │         │  7DaysToDieServer.exe   │    │   │
│  │  │  Process    │         │       Process           │    │   │
│  │  └─────────────┘         └─────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       檔案系統                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ server.json │  │ serverconfig│  │   Saves/    │             │
│  │   (設定)    │  │    .xml     │  │  (存檔)     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| 後端 | Node.js | JavaScript 執行環境 |
| 框架 | Express | Web 框架 |
| 前端 | 原生 JavaScript | 無框架，使用 IIFE 模組模式 |
| 即時通訊 | SSE (Server-Sent Events) | 單向即時推送 |
| 打包 | pkg | 編譯為 Windows 執行檔 |
| 進程管理 | child_process | 管理 SteamCMD 和遊戲伺服器 |

---

## 目錄結構

```
7-days-to-die-dedicated-server-plus/
├── src/
│   └── web/
│       ├── server.js               # 主程式入口
│       ├── lib/                    # 後端模組
│       │   ├── processManager.js   # 進程管理器 (SteamCMD + GameServer)
│       │   ├── steamcmd.js         # SteamCMD 操作
│       │   ├── gameServer.js       # 遊戲伺服器操作
│       │   ├── eventBus.js         # SSE 事件總線
│       │   ├── telnet.js           # Telnet 連線管理
│       │   ├── archive.js          # 壓縮/解壓縮
│       │   ├── serverConfig.js     # serverconfig.xml 處理
│       │   ├── logger.js           # 日誌模組
│       │   ├── http.js             # HTTP 回應工具
│       │   ├── time.js             # 時間格式化
│       │   ├── tailer.js           # 檔案 tail 監聽
│       │   ├── logParser.js        # 遊戲日誌解析
│       │   └── routes/             # API 路由模組
│       │       ├── network.js      # 網路相關 API
│       │       ├── config.js       # 設定相關 API
│       │       ├── saves.js        # 存檔管理 API
│       │       ├── game.js         # 遊戲操作 API
│       │       ├── install.js      # 安裝/更新 API
│       │       └── versions.js     # 版本查詢 API
│       └── public/                 # 前端靜態資源
│           ├── index.html          # 主頁面
│           ├── css/
│           │   └── style.css       # 主樣式
│           ├── js/
│           │   ├── main.js         # 前端主邏輯
│           │   ├── i18n.js         # 多語系模組
│           │   ├── stream.js       # SSE 連線
│           │   ├── modal.js        # Modal 元件
│           │   ├── console.js      # Console 輸出
│           │   ├── confirm.js      # 確認對話框
│           │   └── ...
│           └── locales/            # i18n 翻譯檔
│               ├── zh-TW.json      # 繁體中文 (預設)
│               ├── en.json         # 英文
│               └── zh-CN.json      # 簡體中文
├── docs/
│   ├── plans/                      # 執行計畫文件
│   ├── images/                     # 文檔圖片
│   ├── install.md                  # 安裝指南 (繁中)
│   ├── install.en.md               # 安裝指南 (英文)
│   └── ARCHITECTURE.md             # 本文檔
├── CLAUDE.md                       # Claude 角色定義
├── GEMINI.md                       # Gemini 角色定義
├── CONTRIBUTING.md                 # 貢獻指南
├── .editorconfig                   # 編輯器配置
├── .cursorrules                    # Cursor AI 規則
├── readme.md                       # 專案說明 (繁中)
├── readme.en.md                    # 專案說明 (英文)
├── package.json                    # Node.js 依賴
└── server.sample.json              # 設定檔範本
```

---

## 核心模組說明

### server.js

主程式入口，負責：
- 載入設定檔 (`server.json`)
- 初始化 Express 應用
- 註冊路由模組
- 啟動 HTTP 伺服器

```javascript
// 路由註冊模式
require("./lib/routes/network")(app, routeContext);
require("./lib/routes/config")(app, routeContext);
// ...
```

### processManager.js

進程管理器，提供統一的進程狀態查詢和操作介面：

```javascript
processManager.steamCmd.isRunning    // SteamCMD 是否運行
processManager.gameServer.isRunning  // 遊戲伺服器是否運行
processManager.status.get()          // 取得完整狀態
```

### eventBus.js

SSE 事件總線，負責向前端推送即時訊息：

```javascript
eventBus.push("system", { text: "訊息內容" });
eventBus.push("game", { text: "遊戲日誌" });
```

### i18n.js (前端)

多語系模組，使用 `data-i18n` 屬性和 `t()` 函數：

```javascript
App.i18n.t("key.path")              // 取得翻譯
App.i18n.t("key", { name: "值" })  // 帶參數
App.i18n.setLanguage("en")         // 切換語言
App.i18n.updateDOM()               // 更新 DOM
```

---

## API 設計

### 端點列表

| 方法 | 路徑 | 用途 |
|------|------|------|
| GET | `/api/processManager/status` | 取得進程狀態 |
| POST | `/api/processManager/game_server/kill` | 強制結束遊戲 |
| GET | `/api/serverconfig` | 讀取 serverconfig.xml |
| POST | `/api/serverconfig` | 寫入 serverconfig.xml |
| GET | `/api/saves` | 列出存檔 |
| POST | `/api/saves/export` | 匯出存檔 |
| POST | `/api/saves/import` | 匯入存檔 |
| POST | `/api/install` | 安裝/更新伺服器 |
| GET | `/api/versions` | 取得版本列表 |
| GET | `/api/stream` | SSE 連線端點 |

### 回應格式

**成功**:
```json
{
  "ok": true,
  "data": { ... }
}
```

**失敗**:
```json
{
  "ok": false,
  "error": "錯誤訊息"
}
```

---

## 前端架構

### 模組載入順序

```html
<!-- 依賴順序載入 -->
<script src="js/i18n.js"></script>
<script src="js/stream.js"></script>
<script src="js/console.js"></script>
<script src="js/confirm.js"></script>
<script src="js/modal.js"></script>
<script src="js/main.js"></script>
```

### 命名空間

所有模組掛載於 `window.App`：

```javascript
App.i18n      // 多語系
App.stream    // SSE 連線
App.console   // Console 輸出
App.confirm   // 確認對話框
App.modal     // Modal 管理
```

### i18n 屬性

| 屬性 | 用途 |
|------|------|
| `data-i18n` | 設定 textContent |
| `data-i18n-placeholder` | 設定 placeholder |
| `data-i18n-title` | 設定 title |
| `data-i18n-aria-label` | 設定 aria-label |

---

## 資料流

### 安裝/更新流程

```
用戶點擊「安裝/更新」
       │
       ▼
POST /api/install
       │
       ▼
啟動 SteamCMD 進程
       │
       ├── stdout → eventBus.push("steamcmd", ...)
       │
       ▼
前端透過 SSE 接收即時輸出
       │
       ▼
SteamCMD 完成 → 更新狀態
```

### 啟動伺服器流程

```
用戶點擊「啟動伺服器」
       │
       ▼
POST /api/game/start
       │
       ▼
啟動 7DaysToDieServer.exe
       │
       ├── 監聽 output_log_dedi.txt
       │   └── eventBus.push("game", ...)
       │
       ├── 建立 Telnet 連線
       │
       ▼
前端透過 SSE 接收日誌
```

---

## 設定檔

### server.json

```json
{
  "web": {
    "port": 8080,
    "lastInstallVersion": "public"
  },
  "game_server": {
    "ServerName": "My Server",
    "TelnetPort": 8081,
    "TelnetPassword": "password",
    "UserDataFolder": "C:/Path/To/Saves"
  }
}
```

### serverconfig.xml

遊戲伺服器原生設定檔，由本工具代管編輯。

---

## 開發注意事項

1. **Windows 專用**: 進程管理使用 `taskkill`、`wmic` 等 Windows 命令
2. **pkg 打包**: 注意 `__dirname` 在打包後的行為差異
3. **UTF-8 編碼**: Windows 終端需設定 `chcp 65001`
4. **無前端框架**: 保持輕量，不引入 React/Vue/Angular
5. **SSE 連線**: 注意瀏覽器 SSE 連線數限制 (通常 6 個)
