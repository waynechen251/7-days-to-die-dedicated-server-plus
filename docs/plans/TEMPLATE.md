# [任務標題]

## 元資訊

| 項目 | 值 |
|------|------|
| 建立日期 | YYYY-MM-DD |
| 狀態 | 待執行 / 執行中 / 已完成 |
| 優先級 | 高 / 中 / 低 |
| 計畫作者 | Claude |
| 執行者 | Gemini |

---

## 需求摘要

> 用 1-3 句話描述這個任務要達成什麼目標。

---

## 影響範圍

### 修改檔案
- `path/to/file1.js`
- `path/to/file2.html`

### 新增檔案
- `path/to/new-file.js`

### 刪除檔案
- (無)

---

## 前置條件

- [ ] 條件 1 (例如: 確認伺服器已停止)
- [ ] 條件 2 (例如: 確認依賴已安裝)

---

## 執行步驟

### 步驟 1: [步驟描述]

**檔案**: `path/to/file.js`
**操作**: 新增 / 修改 / 刪除

**變更內容**:

```javascript
// 在第 XX 行後新增
const newCode = "example";
```

或使用 diff 格式:

```diff
- const oldCode = "old";
+ const newCode = "new";
```

**驗證**: 描述如何確認此步驟完成

---

### 步驟 2: [步驟描述]

**檔案**: `path/to/another-file.js`
**操作**: 修改

**位置標記**: 找到 `function exampleFunction()` 函數

**變更內容**:

```javascript
// 將第 XX-YY 行替換為
function exampleFunction() {
  // 新的實現
}
```

**驗證**: 描述如何確認此步驟完成

---

## 測試檢查點

- [ ] 檢查項目 1: 功能 A 正常運作
- [ ] 檢查項目 2: 沒有 console 錯誤
- [ ] 檢查項目 3: UI 顯示正確

---

## 回滾方案

如果出現問題，執行以下步驟回滾:
1. `git checkout -- path/to/file.js`
2. 或手動還原變更

---

## 注意事項

- 特殊考量 1
- 特殊考量 2

---

## 相關資源

- 相關文檔: [連結]
- 參考代碼: `path/to/reference.js`
