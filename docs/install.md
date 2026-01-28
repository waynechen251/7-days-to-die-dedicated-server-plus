# 7 Days to Die Dedicated Server Plus

### 📦 [開源專案倉庫](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus.git) ｜ [GitHub Release](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/releases) ｜ [巴哈姆特](https://forum.gamer.com.tw/Co.php?bsn=24608&sn=6631)

### 🌐 說明文件： [繁體中文](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/blob/main/readme.md) ｜ [English](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/blob/main/readme.en.md)

### 🌐 安裝指南： [繁體中文](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/blob/main/docs/install.md) ｜ [English](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/blob/main/docs/install.en.md)

# 安裝指南

**快速導覽：** [系統需求](#系統需求) ｜ [安裝步驟](#取得程式並使用) ｜ [檔案結構](#檔案結構安裝後應看到) ｜ [首次啟動](#首次啟動) ｜ [故障排除](#故障排除) ｜ [解除安裝](#解除安裝)

---

## 適用對象

- 一般玩家
- 伺服器主

---

## 系統需求

| 項目     | 需求                                             |
| -------- | ------------------------------------------------ |
| 作業系統 | Windows 10/11 (64-bit), Windows Server 2019/2022 |
| 磁碟空間 | 至少 20 GB (含遊戲伺服器與備份)                  |
| 記憶體   | 至少 16 GB RAM                                   |
| 網路     | 口袋深度決定了你的網路上限                       |

---

## 取得程式並使用

### 使用 Inno Setup 安裝包

1. 前往 GitHub Releases 下載最新版本的安裝檔: **[7DTD-DS-P-Setup](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/releases)**
   ![alt text](images/image.png)

2. 啟動安裝程式
   ![alt text](images/image-1.png)
   選擇安裝介面語言後點擊確定

3. 同意授權合約
   ![alt text](images/image-2.png)
   選取我同意後進行下一步

4. 選擇安裝路徑
   ![alt text](images/image-3.png)
   建議安裝於非系統碟(C:\) 與 不含空格與非英文字元、非數字的安裝路徑
   例如: `D:\7DTD-DS-P\`

5. 選擇管理後台的 Web 介面端口
   ![alt text](images/image-4.png)
   預設為 `26901`

   > 提示 1: 若要內部區域網路可訪問管理後台，請在管理後台主機防火牆允許 `26901`。
   > 提示 2: 若要對公網開放管理後台，則需要透過路由器通訊埠轉發 `26901` 到管理後台的主機 IP。
   > 提示 3: !!!!!目前沒有任何權限管控功能，請勿將管理後台暴露於公網，除非你知道你在做什麼，反正我是不會知道!!!!!

6. 這我也不知道要說明什麼
   ![alt text](images/image-5.png)
   下一步就對了

7. 確認安裝內容
   ![alt text](images/image-6.png)
   也沒什麼好確認的，建議不要裝 C 槽，沒問題就點安裝

8. 等待安裝完成
   ![alt text](images/image-7.png)

- 過程中會安裝
  - 管理後台
  - Microsoft Visual C++ Redistributable
  - Amazon Root CA 1.crt 根信任憑證 (Epic Online Services)

9. 結束安裝
   ![alt text](images/image-8.png)
   點擊完成後，會自動打開管理後台網站。
   若沒有反應，請手動打開瀏覽器並輸入 `http://localhost:26901`。

10. 若是網站無法打開，請檢查 Windows 服務是否有正確註冊與啟動
    ![alt text](images/image-9.png)

---

## 檔案結構(安裝後應看到)

| 目錄/檔案          | 描述                                     |
| ------------------ | ---------------------------------------- |
| `7daystodieserver` | 遊戲伺服器目錄，安裝遊戲時自動建立       |
| `dependencies`     | 第三方依賴                               |
| `logs`             | 日誌檔案                                 |
| `public`           | 管理後台 Web 介面與存檔備份目錄          |
| `scripts`          | 安裝腳本                                 |
| `steamcmd`         | SteamCMD 目錄，需要有 steamcmd.exe       |
| 其他檔案           | 設定檔與執行檔                           |

![alt text](images/image-10.png)

> 安裝/更新遊戲伺服器時，會將檔案放到 `./7DaysToDieServer/`。

---

## 首次啟動

1. **開啟管理後台**

   ![alt text](images/image-11.png)

2. **下載或更新遊戲伺服器(必要)**

   **SteamCMD**

   - 頁面上的 **SteamCMD** 區塊，選擇版本，點擊「安裝 / 更新」。
     ![alt text](images/image-12.png)
   - 看到「✅ 安裝 / 更新結束，Exit Code: 0」字樣即完成。
     ![alt text](images/image-13.png)

3. **檢查與設定 serverconfig.xml**

   - 在頁面點「🛠 啟動伺服器 / 檢視 serverconfig.xml」。
     ![alt text](images/image-14.png)
   - 必填值
     - `ServerPort`: 預設 26900 (七日殺伺服器玩家連線通訊埠)
     - `TelnetEnabled`: True (啟用 Telnet 使管理後台能夠操作)
     - `TelnetPort`: 預設 8081 (Telnet 遠端管理通訊埠)
     - `TelnetPassword`: 設定一個非空密碼 (Telnet 遠端管理密碼)
   - 建議值:
     - `EACEnabled`: False (啟用 EAC 時無法使用模組)
     - `UserDataFolder`: `D:\7DTD-DS-P\Data` (伺服器使用存檔目錄，最後會新建一個 Saves 目錄，故不用多打)
   - 完成設定後點擊「保存後啟動」。
     ![alt text](images/image-15.png)

4. **存檔管理(可選)**
   ![alt text](images/image-17.png)

   - 你可以在這裡匯出伺服器存檔或匯入現有存檔 (Zip)。
   - 你也可以不要理會，直接開始一個全新的存檔，後續再透過匯出功能取回存檔。

5. **啟動伺服器**
   - 下方 Console 會即時顯示日誌；等到遊戲伺服器完成啟動即可使用。
     ![alt text](images/image-16.png)

---

## 防火牆與連線

- 若要讓外部玩家加入你的伺服器，請於 Windows 防火牆/路由器開啟:
  - `ServerPort`(遊戲連線)
- 具體 Port 數值請以你的 `serverconfig.xml` 為準。

---

## 解除安裝

### 方法一：使用 Windows 設定

1. 開啟「設定」→「應用程式」→「已安裝的應用程式」
2. 搜尋「7DTD-DS-P」
3. 點擊解除安裝

### 方法二：使用控制台

1. 開啟「控制台」→「程式和功能」
2. 找到「7 Days to Die Dedicated Server Plus」
3. 點擊解除安裝

### 手動清理（可選）

解除安裝後，以下資料夾可能需要手動刪除：
- 安裝目錄（如 `D:\7DTD-DS-P`）
- 遊戲存檔（`UserDataFolder` 設定的路徑）

---

## 故障排除

### 管理後台無法開啟

1. 確認 Windows 服務 `7DTD-DS-P` 已啟動
   - 按 `Win + R`，輸入 `services.msc`，找到服務並確認狀態為「執行中」
2. 檢查防火牆是否封鎖 26901 埠
3. 嘗試訪問 `http://127.0.0.1:26901`
4. 若服務未啟動，嘗試以系統管理員身分重新啟動服務

### 管理後台畫面被遮罩、按鈕無法操作？

首次開啟或後端未連線時，頁面會**上鎖**避免誤操作；等上方狀態管理後台綠色後會解鎖。

### SteamCMD 安裝/更新失敗

1. 檢查網路連線是否正常
2. 確認磁碟空間充足（至少 15GB 可用空間）
3. 以系統管理員身分重新執行安裝程式
4. 若持續失敗，嘗試刪除 `steamcmd` 資料夾後重新安裝

### 安裝/更新看起來很慢？

SteamCMD 本身輸出日誌會慢一些，如果上方狀態管理的 SteamCMD 是綠色的，代表仍在執行，請耐心等待完成訊息。

### 遊戲伺服器無法啟動

1. 確認 `serverconfig.xml` 設定正確
   - 特別檢查 `ServerPort`、`TelnetPort` 是否與其他程式衝突
2. 檢查 `TelnetPassword` 是否已設定（不可為空）
3. 查看 Console 日誌尋找錯誤訊息
4. 確認遊戲伺服器已正確安裝（檢查 `7daystodieserver` 資料夾）

### Telnet 連線失敗

1. 確認 `TelnetEnabled` 設定為 `True`
2. 確認 `TelnetPort` 與 `TelnetPassword` 設定正確
3. 等待伺服器完全啟動（查看 Console 日誌確認啟動完成）
4. 檢查是否有其他程式佔用 Telnet 埠

### 玩家無法連線到伺服器

1. 確認 Windows 防火牆已開啟 `ServerPort`（預設 26900）
2. 若使用路由器，確認已設定通訊埠轉發
3. 確認伺服器已完全啟動
4. 玩家連線時使用正確的 IP 與 Port

---

## 進階設定

### serverconfig.xml 常用參數

| 參數              | 預設值 | 描述                       |
| ----------------- | ------ | -------------------------- |
| `ServerName`      | -      | 伺服器名稱                 |
| `ServerPort`      | 26900  | 遊戲連線埠                 |
| `ServerMaxPlayerCount` | 8 | 最大玩家數                 |
| `GameWorld`       | -      | 地圖名稱                   |
| `GameName`        | -      | 存檔名稱                   |
| `TelnetEnabled`   | False  | 是否啟用 Telnet            |
| `TelnetPort`      | 8081   | Telnet 埠                  |
| `TelnetPassword`  | -      | Telnet 密碼（必填）        |
| `EACEnabled`      | True   | 是否啟用 Easy Anti-Cheat   |
| `UserDataFolder`  | -      | 自訂存檔路徑               |

### 自訂安裝路徑

安裝時可自訂安裝路徑，建議：
- 使用非系統碟（避免 C:\）
- 路徑不含空格與特殊字元
- 範例：`D:\7DTD-DS-P\` 或 `E:\GameServers\7DTD\`

---

## 常見問題

如有其他問題，請至 [GitHub Issues](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/issues) 回報。
