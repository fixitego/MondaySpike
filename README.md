# MondaySpike - LIFF Mobile 報名網站

## 本地測試模式

- `js/app.js` 可切換：
  - `apiMode: "live"`：串 Google Apps Script
  - `apiMode: "mock"`：不用 Google Sheet，前端假資料即可完整測試版面與流程

## 後端安全與權限（寫死在 Code）

在 `gas/Code.gs` 可直接改：

- `ALLOW_USER_EDIT`：是否允許使用者送請假/額外報名/取消
- `ENABLE_MANUAL_SETTLEMENT_TRIGGER`：是否允許手動觸發結算
- `SETTLEMENT_TRIGGER_TOKEN`：手動觸發結算碼（前端會提示輸入）
- `ADMIN_LINE_USER_IDS`：可免輸入結算碼的 LINE 使用者 ID 白名單

LIFF 會在請假、額外報名、觸發結算時帶入：
- `lineUserId`
- `lineDisplayName`

若 `lineUserId` 在 `ADMIN_LINE_USER_IDS` 內，可直接觸發結算；若不是管理員，仍可輸入 `SETTLEMENT_TRIGGER_TOKEN` 觸發。

## 主要規則

- 結算前：最終名單只看固定名單（扣掉請假）
- 結算後：才會套用額外報名補位
- 最終名單限制：總人數上限 18、女生上限 9

## 額外報名

支援三種：
- `MALE`：男 1
- `FEMALE`：女 1
- `PAIR`：一男一女

欄位：
- 姓名（依類型動態必填）
- 備註
- `pairMustTogether`（一男一女需同進同退，否則放棄）

且支援取消：
- 額外報名列表每筆都有「取消」按鈕
- 點擊會有確認彈窗

## 結算控制表

`settlement_control`：
- `date`
- `settleAt(YYYY-MM-DD HH:mm)`
- `settled(0/1)`
- `settledAt`
- `triggerNote`

## LINE Bot 推播最終名單

需要 LINE Official Account + Messaging API Channel，個人 LINE 帳號不能當 Bot 使用。

設定步驟：
- 在 Apps Script 專案設定的 Script Properties 新增 `LINE_CHANNEL_ACCESS_TOKEN`
- 可選：新增 `LINE_DEFAULT_GROUP_ID`
- LINE Developers 的 Messaging API Webhook URL 設成 Apps Script Web App URL
- 把 Bot 加到群組後，在群組傳「報名」，GAS 會把群組來源記到 `line_groups`
- `line_groups.sourceId` 就是 groupId，可填到 `LINE_DEFAULT_GROUP_ID`

推送某日期最終名單：

```text
GAS_WEB_APP_URL?action=push_final_list&date=2026-06-08&token=fixitego
```

也可指定群組：

```text
GAS_WEB_APP_URL?action=push_final_list&date=2026-06-08&groupId=GROUP_ID&token=fixitego
```

群組內輸入「報名」時，Bot 會回覆一則 Flex Message，按鈕會開啟 LIFF 報名頁。

## 前端體驗

- 跳頁有全螢幕 loading
- 固定名單男/女左右分欄且縮小
- 最終名單男/女底色區分
- 最下方顯示總人數與女生數
- Banner 固定標題 + 3 張橫向輪播

## 你需要重新部署

`gas/Code.gs` 已更新 API 與資料欄位，請重新部署 Apps Script Web App。

## 載入速度與快取

- GitHub Pages 只負責靜態檔案，不能直接當資料庫寫入。
- 目前已關閉前端設定快取與 GAS `CacheService` 快取，方便測試時立即反映 Google Sheet 內容。
- 日期頁使用單一 `page_data` API 一次取得最終名單、額外報名、結算狀態與異動紀錄。
- 手動修改 Google Sheet 後，重新整理頁面就會重新向 GAS 讀取最新資料。
