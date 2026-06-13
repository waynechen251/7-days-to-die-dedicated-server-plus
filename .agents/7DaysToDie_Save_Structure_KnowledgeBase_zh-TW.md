# 七日殺 Dedicated Server 存檔機制知識庫

用途：供伺服器管理後台、存檔管理模組與後續開發參考  
整理日期：2026-06-13  
適用範圍：PC 版 7 Days to Die，重點為 Dedicated Server 與 V1.0／V2.x 世代  
文件定位：知識庫，不是官方格式規格，也不是目前產品功能承諾

## 一、文件定位與目前產品邊界

這份文件的目的，是保留對 7 Days to Die 存檔機制有價值的背景知識，讓後續功能設計與除錯有共同語境。

它不是：

1. 遊戲官方格式文件
2. 目前產品必做功能清單
3. 任何二進位格式可安全修改的保證

目前這個管理後台，存檔管理範圍刻意收斂成兩個單位：

1. 完整備份：整個 Saves 根目錄
2. 單一存檔：一組 GameWorld + GameName

本次產品不把以下內容視為存檔管理主流程：

1. Region 重置
2. 玩家角色檔編修
3. .7rg、.ttp 等二進位內部結構修改
4. GeneratedWorlds、Mods、serverconfig.xml 一起打包成完整伺服器復原方案
5. 跨版本或跨模組環境的自動修復

這些內容若在本文件中出現，只是未來參考知識，不代表目前 UI 或 API 應直接實作。

## 二、目前產品採用的存檔管理模型

目前產品只管理兩種 scope：

1. full
2. single

定義如下：

full：代表整個 Saves 根目錄。  
single：代表一個具體的遊戲進度目錄，也就是 Saves\<GameWorld>\<GameName>\

因此目前產品中，單一存檔的基本識別單位是：

GameWorld + GameName

目前 UI 與 API 設計應遵守：

1. 完整備份與單一存檔分開顯示與操作
2. 完整備份與單一存檔各自有獨立的備份清單
3. 匯入時必須驗證 ZIP 類型是否與操作區塊一致
4. 不再用一個共用備份清單處理所有備份類型

## 三、核心名詞

UserDataFolder：使用者資料根目錄。常見內容包含 Saves、Logs、Mods、GeneratedWorlds。  
SaveGameFolder：遊戲存檔目錄覆寫值。實際優先順序要以目前伺服器版本與啟動日誌驗證。  
GameWorld：世界名稱。可能是官方世界、預生成世界、隨機世界或自訂世界。  
GameName：該世界下的遊戲進度名稱。  
Saves Root：目前後台實際管理的存檔根目錄。  
Full Backup：目前產品定義為整個 Saves Root 的 ZIP。  
Single Save Backup：目前產品定義為單一 GameWorld + GameName 的 ZIP。

## 四、路徑與定位原則

不要把存檔位置寫死成單一 Windows AppData 路徑。

常見 Windows 使用者資料根目錄：

%APPDATA%\7DaysToDie

常見 Linux 使用者資料根目錄：

~/.local/share/7DaysToDie

Dedicated Server 實際路徑可能受到以下因素影響：

1. serverconfig.xml
2. 啟動參數
3. 執行帳號
4. Docker bind mount 或 volume
5. 封裝工具的資料目錄映射

管理後台在設計上，應優先區分兩種資訊：

1. 使用者設定值
2. 伺服器實際採用的路徑

典型檢查優先順序：

1. 後台已保存的明確路徑
2. 啟動命令或容器掛載設定
3. serverconfig.xml 的 SaveGameFolder
4. serverconfig.xml 的 UserDataFolder
5. 伺服器啟動日誌中的實際路徑
6. 作業系統預設使用者資料路徑
7. 手動搜尋符合 Saves\<GameWorld>\<GameName> 結構的目錄

## 五、Saves 目錄的基本概念

典型存檔路徑：

Saves\<GameWorld>\<GameName>\

例如：

- Saves\Navezgane\MyServer\
- Saves\PREGEN8k01\Production\
- Saves\West Xuyofu County\WayneServer\

典型內容可能包含：

1. main.ttw
2. main.ttw.bak
3. main.ttw.ext
4. main.ttw.ext.bak
5. Region\
6. Player\
7. players.xml
8. blockmappings.nim
9. power.dat
10. drones.dat
11. vehicles.dat
12. 各種 .bak 與模組自訂檔案

重點：

1. 檔案清單會隨版本與模組改變
2. 不能因缺少某個常見檔案就直接判定存檔損壞
3. 未知檔案在完整備份與還原時應保留
4. 目前產品應以保留完整相對路徑為原則，而不是挑選少數已知檔案重建

## 六、完整可恢復資料與目前產品的差異

從知識角度來看，一套真正可異機恢復的伺服器遊戲資料，可能不只包含 Saves。

通常還會牽涉：

1. 原始世界資料，例如 GeneratedWorlds 或 Data\Worlds
2. Mods 與其設定
3. serverconfig.xml 或等價啟動設定
4. 遊戲版本與模組版本資訊

但目前產品的存檔管理刻意只處理：

1. 完整 Saves 備份
2. 單一 Saves\<GameWorld>\<GameName> 備份

因此要明確理解：

1. 目前 full backup 不等於完整伺服器災難復原包
2. 異機還原時，若缺少對應世界資料或 Mods，仍可能無法正常載入
3. 這不是目前產品錯誤，而是產品範圍刻意收斂的結果

## 七、目前產品的 ZIP 結構約定

完整備份 ZIP：根目錄以 Saves/ 開頭。

例如：

Saves/<GameWorld>/<GameName>/...

單一存檔 ZIP：根目錄以 <GameWorld>/<GameName>/ 開頭。

例如：

PREGEN8k01/Production/...

目前後端的分類邏輯應以這兩種形狀作為核心判定依據。

如果檔名可直接辨識，也可先用檔名分類，再 fallback 到 ZIP 結構檢測。

## 八、目前產品的備份命名慣例

常見完整備份命名：

- Saves-YYYYMMDDHHmmss.zip
- AutoSaves-YYYYMMDDHHmmss.zip

常見單一存檔備份命名：

- Saves-<GameWorld>-<GameName>-YYYYMMDDHHmmss.zip
- AutoSaves-<GameWorld>-<GameName>-YYYYMMDDHHmmss.zip
- DelSaves-<GameWorld>-<GameName>-YYYYMMDDHHmmss.zip

注意：

1. 檔名只是快速分類訊號，不是唯一真相
2. 舊版備份或人工放入的 ZIP 可能不符合命名規則
3. 無法判定的 ZIP 不應硬塞成 full 或 single
4. 無法判定的 ZIP 應標示為 unknown 或 legacy，避免錯誤匯入

## 九、安全操作原則

還原、刪除、覆蓋等操作都應視為高風險檔案操作。

建議原則：

1. 伺服器運行中不做破壞性存檔操作
2. 匯入前自動建立備份
3. 刪除單一存檔前先建立備份
4. 不混搭不同時間點的檔案批次
5. 驗證時盡量使用相同遊戲版本與相同 Mods
6. 匯入時驗證 ZIP scope 是否符合操作區塊
7. 不透明或未知格式 ZIP 不直接執行覆蓋還原

如果要做更嚴格的運維流程，還可以額外要求：

1. 建立操作記錄
2. 保存操作前後檔名與時間戳
3. 先在複製資料上做驗證
4. 為匯入建立可回滾點

## 十、影響存檔可用性的外部因素

即使 ZIP 結構正確，還原後仍可能失敗。常見原因包括：

1. 遊戲版本不同
2. Mods 清單不同
3. 缺少對應原始世界資料
4. SaveGameFolder / UserDataFolder 指向錯誤位置
5. 還原時伺服器仍在寫入
6. blockmappings.nim 與 Region/Mods 不一致

因此，ZIP 可解壓 不代表 存檔可正常遊玩。

## 十一、進階內部結構速查

這一節只提供背景知識，不代表目前產品應直接操作這些檔案。

main.ttw：世界層級的核心狀態檔之一，通常不應在未掌握格式前直接修改。  
Region\r.<x>.<z>.7rg：保存世界區域變更。刪除後可能造成該區域重生，但也可能帶來一致性問題。  
Player\<id>.ttp：玩家角色狀態檔。  
Player\<id>.map：玩家探索地圖資料。  
players.xml：部分版本中的玩家索引或關聯資料。  
blockmappings.nim：方塊映射相關資料，可能與版本與 Mods 強耦合。  
power.dat、drones.dat、vehicles.dat：屬於特定系統的持久化資料，是否存在與內容都可能因版本而異。

對目前產品來說，這些檔案的主要意義是：

1. 它們是單一存檔目錄的一部分
2. 完整備份與單一備份都應原樣保留它們
3. 不應在沒有解析器與驗證流程時嘗試單獨改寫

## 十二、明確不納入目前產品範圍的事項

以下主題保留為未來研究，不是本次產品實作要求：

1. Region 重置工具
2. .7rg 透明解析與寫回
3. .ttp / .map 角色資料修復工具
4. 跨版本存檔修復
5. 自動組合 GeneratedWorlds、Mods、serverconfig.xml 的完整復原工作流
6. 存檔資料庫模型與掃描索引系統
7. 更細粒度的單檔、單玩家、單 Region 管理 UI

如果未來要做上述功能，應另外立項，不要直接把這份知識文件當成既定規格。

## 十三、未來驗證與研究清單

未來若要擴大存檔能力，建議先補齊下列驗證：

1. 目前 V2.x 伺服器實際採用的 SaveGameFolder / UserDataFolder 優先順序
2. 舊版與手動 ZIP 的分類策略
3. GeneratedWorlds 與自訂世界在跨機還原時的必要條件
4. blockmappings.nim 與 Mods 差異對還原成功率的影響
5. 是否需要把版本、Mods 摘要寫入備份 metadata
6. 是否需要 unknown / legacy ZIP 的人工審核機制

## 附錄 A、Region 座標速查

這不是目前產品功能範圍，但對理解世界檔案很有幫助。

常數：

- CHUNK_SIZE = 16
- REGION_CHUNKS = 32
- REGION_SIZE = 512

由世界座標計算 Region：

regionX = floor(worldX / 512)  
regionZ = floor(worldZ / 512)

注意必須使用向負無限方向取整，不能用向 0 截斷。

例如：

- worldX = -1，regionX = -1
- worldX = -512，regionX = -1
- worldX = -513，regionX = -2

## 附錄 B、給後續開發的固定提醒

1. 先用最小 scope 實作 full 與 single，再考慮任何更細粒度能力
2. 未知檔案與未知 ZIP 預設保守處理
3. 不要把這份知識庫中的進階內容誤解為目前 UI 或 API 必做項目
4. 真正牽涉二進位格式時，應以樣本、啟動日誌與回歸測試為準
