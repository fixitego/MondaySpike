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

## 前端體驗

- 跳頁有全螢幕 loading
- 固定名單男/女左右分欄且縮小
- 最終名單男/女底色區分
- 最下方顯示總人數與女生數
- Banner 固定標題 + 3 張橫向輪播

## 你需要重新部署

`gas/Code.gs` 已更新 API 與資料欄位，請重新部署 Apps Script Web App。
