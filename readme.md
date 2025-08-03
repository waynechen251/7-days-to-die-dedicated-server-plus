# 7 Days to Die Dedicated Server Plus

🌐 [繁體中文](readme.md) | [English](readme.en.md)

一套簡易的 7 Days to Die 專用伺服器管理面板與 API，支援啟動、關閉、備份存檔、Telnet 操作，以及遊戲資訊查詢。

![DEMO](demo.png)

## 功能特色

- ✅ Web 操作伺服器：啟動 / 關閉伺服器
- 💾 備份遊戲存檔（自動壓縮為 ZIP）
- 📦 列出所有備份存檔
- 🧠 Telnet 遠端發送遊戲內指令（支援版本查詢、玩家清單、伺服器設定等）
- 📂 靜態網站介面，可自行擴充

## 專案結構

```
7-days-to-die-dedicated-server-plus/
├─ public/               # 前端 Web 介面
│  └─ index.html
├─ src/
│  ├─ server.js          # 主要 API 程式碼
│  └─ server.sample.json # 設定檔範本
├─ Amazon Root CA 1.crt # 如果出現 EOS 連線失敗，請將此憑證放入信任的根憑證
├─ LICENSE
└─ README.md
```

## 安裝與使用

### 1. 安裝 Node.js (建議 v18+)

https://nodejs.org/

### 2. 安裝依賴

```
npm install
```

### 3. 建立設定檔

複製範例設定檔並根據你的伺服器環境修改：

```
cp src/web/server.sample.json src/web/server.json
```

### 設定說明（server.json）

| 欄位 | 說明 |
|------|------|
| `web.port` | Web API 的監聽埠號 |
| `web.path` | 專案路徑根目錄 |
| `web.saves` | 備份 ZIP 輸出路徑 |
| `web.zipTool` | 7z.exe 的完整路徑 |
| `web.timeZone` | 備份時間格式用時區 |
| `game_server.ip` | 伺服器 IP（通常為 127.0.0.1） |
| `game_server.port` | 遊戲連線用 Port |
| `game_server.saves` | 遊戲原始存檔位置 |
| `game_server.startBat` | 啟動伺服器的 .bat 路徑 |
| `game_server.telnetPort` | Telnet 管理埠 |
| `game_server.telnetPassword` | Telnet 密碼 |

### 4. 啟動服務

```
node src/web/server.js
```

### 5. 開啟瀏覽器

```
http://localhost:26903/
```

## 常用 API 一覽

| 路徑 | 功能 |
|------|------|
| `POST /api/start` | 啟動伺服器 |
| `POST /api/stop` | 關閉伺服器 |
| `POST /api/backup` | 備份遊戲存檔 |
| `POST /api/view-saves` | 查看所有備份 |
| `POST /api/telnet` | 發送 Telnet 指令，如 `version`, `listplayers`, `getgameprefs` 等 |

## 授權 License

本專案使用 **GPLv3** 授權。你可以自由修改與再發佈，但需保留開源並沿用 GPL 條款。