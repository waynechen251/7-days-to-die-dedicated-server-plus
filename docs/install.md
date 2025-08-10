# 安裝指南

## 適用對象:

- 一般玩家
- 伺服器主

---

## 1. 系統需求

- **作業系統**: Windows 10/11(64-bit), Windows Server 2019/2022
- **磁碟空間**: 至少 20 GB(含遊戲伺服器與備份)
- **網路**: 口袋深度決定了你的網路上限

---

## 2. 取得程式並使用

### 使用 Inno Setup 安裝包

1. 前往 GitHub Releases 下載最新版本的壓縮檔: **[7DTD-DS-P-Setup](https://github.com/waynechen251/7-days-to-die-dedicated-server-plus/releases)**  
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

## 3. 檔案結構(安裝後應看到)

7DTD-DS-P  
├─ dependencies # 第三方依賴  
├─ logs # 日誌檔案  
├─ nssm # 空目錄忘記刪掉了=\_=  
├─ public # 管理後台 Web 介面與存檔備份目錄  
├─ scripts # 安裝腳本  
├─ steamcmd # 需要有 steamcmd.exe  
└─ (其他檔案)  
![alt text](images/image-10.png)

> 安裝/更新遊戲伺服器時，會將檔案放到 `./7DaysToDieServer/`。

---

## 4. 首次啟動

1. **開啟管理後台**

   ![alt text](images/image-11.png)

2. **下載或更新遊戲伺服器(必要)**

   **SteamCMD**

   - 頁面上的 **SteamCMD** 區塊，選擇版本，點擊「安裝 / 更新」。  
     ![alt text](images/image-12.png)
   - 看到「✅ 安裝 / 更新結束，Exit Code: 0」字樣即完成。  
     ![alt text](images/image-13.png)

3. **檢查與設定 serverconfig.xml**

   - 在頁面點「📝 檢視 / 編輯 serverconfig.xml」。  
     ![alt text](images/image-14.png)
   - 必填值
     - `ServerPort`: 預設 26900 (七日殺伺服器玩家連線通訊埠)
     - `TelnetEnabled`: True (啟用 Telnet 使管理後台能夠操作)
     - `TelnetPort`: 預設 8081 (Telnet 遠端管理通訊埠)
     - `TelnetPassword`: 設定一個非空密碼 (Telnet 遠端管理密碼)
   - 建議值:
     - `EACEnabled`: False (啟用 EAC 時無法使用模組)
   - 完成設定後點擊「保存後啟動」。  
     ![alt text](images/image-15.png)

4. **啟動伺服器**
   - 下方 Console 會即時顯示日誌；等到遊戲伺服器完成啟動即可使用。  
     ![alt text](images/image-16.png)

---

## 5. 防火牆與連線

- 若要讓外部玩家加入你的伺服器，請於 Windows 防火牆/路由器開啟:
  - `ServerPort`(遊戲連線)
- 具體 Port 數值請以你的 `serverconfig.xml` 為準。

---

## 6. 常見問題

- **管理後台畫面被遮罩、按鈕無法操作？**  
  首次開啟或後端未連線時，頁面會**上鎖**避免誤操作；等上方狀態管理後台綠色後會解鎖。
- **安裝/更新看起來很慢？**  
  SteamCMD 本身輸出日誌會慢一些，如果上方狀態管理的 SteamCMD 是綠色的，代表仍在執行，請耐心等待完成訊息。
