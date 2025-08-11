# 使用指南

> 適用對象: 一般玩家 / 伺服器主  
> 文件可能隨版本快速更新，**以本專案 GitHub Releases 的最新說明為準**。

---

## 1. 介面導覽

- **上方狀態列**: 顯示 _管理後台 / SteamCMD / 7DaysToDieServer / Telnet_ 狀態
- **主要卡片區**:
  - **SteamCMD**: 安裝/更新遊戲伺服器
  - **7 Days To Die Dedicated Server**: 啟動/關閉、Telnet 指令、編輯 `serverconfig.xml`
  - **管理後台**: 查看管理後台設定檔
  - **存檔管理**: 匯出、匯入備份
- **下方 Console**: 依分頁顯示 system / steamcmd / game / telnet / backup 日誌

> 首次載入或後端未連線時，頁面會出現保護性「遮罩」，避免在未就緒狀態下操作。

---

## 2. 安裝 / 更新遊戲伺服器(SteamCMD)

1. 在 **SteamCMD** 區塊選擇版本(建議使用 `Stable (public)`)。
2. 按 **📥 安裝 / 更新**。
3. 觀察 `steamcmd` 主控台分頁，等待完成訊息。

> 若你更改了版本，需再次安裝對應版本後才能啟動伺服器。

---

## 3. 啟動、關閉與 Telnet

- **啟動伺服器**: 按 **▶️ 啟動伺服器**。  
  首次啟動前建議先按 **📝 檢視 / 編輯 serverconfig.xml** 做基本檢查:
  - `TelnetEnabled = true`
  - `TelnetPassword` 非空
  - `ServerPort` / `TelnetPort` 未被占用(頁面會檢查)
- **關閉伺服器**: 按 **⏹️ 關閉伺服器**。
- **強制結束**: 按 **⚠️ 強制結束**(僅在異常時使用)。
- **Telnet 指令**:
  - 在輸入框輸入指令，或使用快速按鈕: `version`、`listplayers`、`getgamepref`。
  - 結果會出現在 **telnet** 主控台分頁。

---

## 4. 存檔管理(匯出/匯入)

### 4.1 匯出

- **僅匯出選擇的世界**  
  在「遊戲選擇」挑選 _GameWorld / GameName_ → 按 **📤 僅備份所選世界**。  
  產生 ZIP 檔會放在: `public/saves/`。

- **完整備份全部存檔**  
  按 **💾 備份完整存檔**。  
  產生 ZIP 檔會放在: `public/saves/`。

### 4.2 匯入(從備份或自行上傳)

- **從管理後台備份匯入**  
  在下拉選單選擇 ZIP → 按 **📥 從備份匯入**。

- **上傳 ZIP 並匯入**  
  選擇本機 ZIP → 按 **📤 上傳並匯入**。

> **匯入前自動備份**:  
> 系統會自動建立下列命名的安全備份(存於 `public/saves/`):
>
> - 完整備份: `AutoSaves-{time}.zip`
> - 單一世界: `AutoSaves-{WORLDNAME}-{GAMENAME}-{time}.zip`

### 4.3 ZIP 結構規範(重要)

- **完整匯出(全部存檔)**  
   ZIP 內需是:  
  Saves/
  <GameWorld>/
  <GameName>/
  ...檔案...

也就是 `zip/Saves/GAMEWORLD/GAMENAME/...`

- **單獨世界匯出**  
  ZIP 內需是:  
  <GameWorld>/
  <GameName>/
  ...檔案...

也就是 `zip/GAMEWORLD/GAMENAME/...`

> 匯入時，系統會比對 ZIP 結構；不符合者會被拒絕。  
> 匯入過程會**直接對目標目錄進行操作**，不經暫存資料夾。

---

## 5. 常見問題

- **畫面被遮罩無法操作？**  
  代表後端未連線或初次輪詢尚未就緒；等狀態列顯示「管理後台: OK」後即可。
- **SteamCMD 日誌輸出很慢？**  
  下載量大或網路較慢時，更新訊息會延遲；請耐心等待完成訊息。
- **匯入 ZIP 失敗？**  
  請確認你的 ZIP 內層級符合上方「ZIP 結構規範」。

---

## 6. 安全建議

- 請務必設定 **強度足夠** 的 `TelnetPassword`。
- 若伺服器對外，請限制可連線來源或使用防火牆規則。
- 定期備份: 習慣性在大改前手動按一次「💾 備份完整存檔」。
