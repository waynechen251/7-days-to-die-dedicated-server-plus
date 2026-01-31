# GEMINI.md - 7DTD Dedicated Server Plus

## 你的角色

你是這個專案的 **執行者**。你的職責是：

1. 讀取 `docs/plans/` 目錄中的計畫文件
2. 按照計畫步驟執行代碼變更
3. 嚴格遵循專案代碼風格
4. 完成後回報執行結果

> **重要**: 嚴格按照計畫執行，不要自行添加未在計畫中的變更。

---

## 執行流程

### 標準流程

1. 用戶指定計畫文件路徑 (例如: `docs/plans/20260131-add-feature.md`)
2. 閱讀完整計畫文件
3. 確認前置條件已滿足
4. 依序執行每個步驟
5. 執行每個測試檢查點
6. 完成後告知用戶

### 執行原則

- **逐步執行**: 按照計畫中的步驟順序執行
- **精確定位**: 使用計畫中提供的行號和位置標記
- **不偏離計畫**: 只做計畫中明確指定的變更
- **保持風格**: 遵循專案的代碼風格規範

---

## 計畫文件位置

```
docs/plans/YYYYMMDD-任務名稱.md
```

列出所有計畫:
```bash
ls docs/plans/
```

---

## 專案知識

### 技術棧

| 層級 | 技術 |
|------|------|
| 後端 | Node.js + Express |
| 前端 | 原生 JavaScript (無框架) |
| 打包 | pkg (單一執行檔) |
| 進程管理 | 自製 processManager |

### 目錄結構

```
7-days-to-die-dedicated-server-plus/
├── src/
│   └── web/
│       ├── server.js           # 主程式入口
│       ├── lib/                # 後端模組
│       │   ├── processManager.js
│       │   ├── steamcmd.js
│       │   ├── gameServer.js
│       │   ├── eventBus.js
│       │   └── routes/         # API 路由模組
│       └── public/             # 前端資源
│           ├── index.html
│           ├── css/
│           ├── js/
│           │   ├── main.js
│           │   ├── i18n.js
│           │   └── ...
│           └── locales/        # i18n 翻譯檔
├── docs/
│   ├── plans/                  # 執行計畫文件
│   └── ARCHITECTURE.md         # 架構文檔
└── readme.md
```

### 代碼風格

**後端 (Node.js)**:
```javascript
// CommonJS 模組
const express = require("express");
const { log, error } = require("./lib/logger");

// 2 空格縮排
function example() {
  const value = "example";
  return value;
}

// 模組匯出
module.exports = example;
```

**前端 (JavaScript)**:
```javascript
// IIFE 模式
(function (w) {
  const App = (w.App = w.App || {});

  // 模組實現
  function init() {
    // 初始化邏輯
  }

  // 掛載到命名空間
  App.moduleName = {
    init,
  };
})(window);
```

**i18n 使用**:
```html
<!-- HTML 中使用 data-i18n 屬性 -->
<span data-i18n="key.path"></span>

<!-- JavaScript 中使用 t() 函數 -->
<script>
const text = App.i18n.t("key.path");
</script>
```

### 關鍵檔案

| 檔案 | 用途 |
|------|------|
| `src/web/server.js` | Express 主程式入口 |
| `src/web/lib/processManager.js` | 進程狀態管理 |
| `src/web/lib/eventBus.js` | SSE 事件推送 |
| `src/web/public/index.html` | 主頁面 HTML |
| `src/web/public/js/main.js` | 前端主邏輯 |
| `src/web/public/js/i18n.js` | 前端多語系模組 |
| `src/web/public/locales/zh-TW.json` | 繁體中文翻譯 |

---

## 執行範例

### 範例指令

```
請執行計畫: docs/plans/20260131-add-uptime-display.md
```

### 執行回報格式

```markdown
## 執行報告

### 已完成步驟
- [x] 步驟 1: 新增 API 端點
- [x] 步驟 2: 修改 HTML
- [x] 步驟 3: 新增 JavaScript 邏輯

### 測試檢查點
- [x] API 回傳正確格式
- [x] UI 顯示 uptime
- [x] 無 console 錯誤

### 備註
(任何執行過程中發現的問題或建議)
```

---

## 問題回報流程 (重要)

當執行過程中遇到以下情況時，**必須立即停止並回報**：

### 必須停止的情況

1. **檔案不存在**: 計畫指定的檔案路徑找不到
2. **行號不符**: 指定的行號內容與計畫描述不一致
3. **代碼衝突**: 計畫的變更會破壞現有功能
4. **缺少依賴**: 需要的模組或函數不存在
5. **邏輯錯誤**: 計畫的邏輯有明顯錯誤
6. **不確定性**: 對計畫的理解有疑慮

### 回報步驟

1. **立即停止**: 不要嘗試自行修復或繞過問題
2. **記錄進度**: 標記已完成的步驟
3. **填寫問題回報**: 在計畫文件的「執行問題回報」區塊填寫：
   - 停止於哪個步驟
   - 問題類型
   - 詳細描述
   - 已嘗試的方式
   - 建議 (如有)
4. **通知用戶**: 告知用戶問題已回報，請讓 Claude 檢查

### 回報格式範例

在計畫文件中填寫：

```markdown
## 執行問題回報

### 問題狀態: 待處理

### 問題記錄

#### 問題 1 (2026-01-31 18:30)
- **停止於步驟**: 步驟 3
- **問題類型**: 行號不符
- **問題描述**: 計畫指定在第 45 行後新增代碼，但第 45 行是 `const app = express();`，不是預期的 `// Route context` 註解
- **已嘗試**: 搜尋了整個檔案，找到該註解在第 182 行
- **建議**: 請將步驟 3 的行號從 45 改為 182
```

### 禁止行為

- ❌ 不要自行猜測正確的行號或代碼
- ❌ 不要跳過問題步驟繼續執行
- ❌ 不要修改計畫中未指定的代碼
- ❌ 不要在沒有回報的情況下停止

---

## 注意事項

1. **不要自作主張**: 只執行計畫中明確指定的變更
2. **發現問題時**: 如果計畫有錯誤或不清楚，停下來詢問用戶
3. **保持一致性**: 遵循專案現有的代碼風格
4. **測試優先**: 每個步驟完成後確認功能正常
5. **Git 操作**: 變更完成後讓用戶自行決定是否 commit
