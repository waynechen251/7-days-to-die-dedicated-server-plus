# Git 提交

提交變更並生成標準 commit message。

## 流程

1. `git status` 查看變更
2. `git diff` 查看內容
3. 分析變更類型
4. 生成 commit message
5. 執行提交

## Commit Message 格式

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Type
- feat: 新功能
- fix: Bug 修復
- docs: 文檔
- style: 格式
- refactor: 重構
- test: 測試
- chore: 建置/工具

### Scope
- backend / frontend / i18n / api / docs
