# 貢獻指南 - 7DTD Dedicated Server Plus

感謝您對本專案的興趣！本文檔說明如何參與貢獻。

---

## 開發環境設置

### 系統需求

- Windows 10/11 或 Windows Server 2019/2022
- Node.js 18.x 或更高版本
- Git

### 安裝步驟

```bash
# Clone 專案
git clone https://github.com/waynechen251/7-days-to-die-dedicated-server-plus.git
cd 7-days-to-die-dedicated-server-plus

# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
```

### 目錄結構

```
src/web/           # 主要程式碼
├── server.js      # 後端入口
├── lib/           # 後端模組
└── public/        # 前端資源
docs/              # 文檔
├── plans/         # 執行計畫
└── ARCHITECTURE.md
```

---

## 代碼風格

### JavaScript (後端)

```javascript
// CommonJS 模組
const express = require("express");

// 2 空格縮排
function example() {
  const value = "example";
  return value;
}

// 雙引號字串
const name = "7DTD";

// 模組匯出
module.exports = example;
```

### JavaScript (前端)

```javascript
// IIFE 模式
(function (w) {
  const App = (w.App = w.App || {});

  function init() {
    // 初始化
  }

  App.moduleName = { init };
})(window);
```

### 編輯器配置

專案包含 `.editorconfig`，請確保您的編輯器支援：
- [VS Code EditorConfig 擴充](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)

---

## 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 穩定版本，用於發布 |
| `dev` | 開發分支，新功能在此整合 |
| `feature/*` | 功能分支 |
| `bugfix/*` | 修復分支 |

### 開發流程

```bash
# 從 dev 建立功能分支
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# 開發完成後
git add .
git commit -m "feat: 新增 XX 功能"
git push origin feature/my-feature

# 發起 Pull Request 到 dev
```

---

## Commit 訊息規範

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<類型>: <描述>

[可選的內文]
```

### 類型

| 類型 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修復 bug |
| `docs` | 文檔變更 |
| `style` | 格式調整 (不影響邏輯) |
| `refactor` | 重構 |
| `perf` | 效能優化 |
| `test` | 測試相關 |
| `chore` | 雜項 (建置、工具等) |

### 範例

```bash
feat: 新增伺服器 uptime 顯示
fix: 修復 Telnet 連線中斷問題
docs: 更新安裝指南
refactor: 重構 processManager 模組
```

---

## Pull Request 指南

### PR 標題

使用與 commit 相同的格式：

```
feat: 新增伺服器 uptime 顯示
```

### PR 內容

請包含以下資訊：

```markdown
## 變更說明
簡述這個 PR 做了什麼

## 變更類型
- [ ] 新功能
- [ ] Bug 修復
- [ ] 文檔更新
- [ ] 重構
- [ ] 其他

## 測試方式
說明如何測試這個變更

## 截圖 (如適用)
UI 變更請附截圖
```

---

## i18n 翻譯貢獻

### 新增語言 (New Language)

1. 在 `src/web/public/locales/` 新增語言檔 (例如 `ja.json`)
2. 在 `src/web/public/locales/manifest.json` 加入新語言設定：
   ```json
   { "code": "ja", "name": "日本語" }
   ```

### 新增翻譯 Key

1. 先在 `src/web/public/locales/zh-TW.json` 新增 key
2. 同步更新其他語言的 json 檔

### 翻譯檔案結構

```json
{
  "section": {
    "key": "翻譯文字"
  }
}
```

### HTML 使用方式

```html
<span data-i18n="section.key"></span>
```

---

## AI 輔助開發 (Claude + Gemini 模式)

本專案支援使用 AI 輔助開發的工作流：

### Claude 的角色
- 需求分析
- 架構設計
- 產出執行計畫文件 (`docs/plans/`)

### Gemini 的角色
- 按照計畫執行代碼變更

### 計畫文件

位置: `docs/plans/YYYYMMDD-任務名稱.md`
模板: `docs/plans/TEMPLATE.md`

如果您使用 AI 輔助，請遵循此工作流以確保變更的可追蹤性。

---

## 問題回報

### Bug 回報

請使用 [GitHub Issues](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/issues) 並包含：

1. **環境資訊**: Windows 版本、Node.js 版本
2. **重現步驟**: 詳細的操作步驟
3. **預期行為**: 您期望發生什麼
4. **實際行為**: 實際發生什麼
5. **錯誤訊息**: Console 錯誤或日誌 (如有)
6. **截圖**: UI 問題請附截圖

### 功能建議

歡迎在 Issues 提出功能建議，請說明：

1. **使用場景**: 為什麼需要這個功能
2. **預期行為**: 功能應該如何運作
3. **替代方案**: 是否有其他解決方法

---

## 授權

本專案採用 [GPL-3.0](LICENSE) 授權。提交 PR 即表示您同意以此授權釋出您的貢獻。

---

## 聯絡方式

- GitHub Issues: [回報問題](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/issues)
- 巴哈姆特: [討論串](https://forum.gamer.com.tw/Co.php?bsn=24608&sn=6631)
