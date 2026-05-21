# MondaySpike - LIFF Mobile 報名網站

這是一個可部署在 GitHub Pages 的 LIFF 手機版報名網站。

## 已完成功能

- 日期入口頁：`index.html`
- 每個日期獨立頁：`date.html?date=YYYY-MM-DD`
- 固定名單請假按鈕（單次點擊 + 確認彈窗 + 顏色變化）
- 額外報名（姓名 + 性別）
- 最終名單表格（來源 Google 試算表）
- 刷新按鈕可重新拉取最終名單

## 專案檔案

- `index.html`：日期選擇頁
- `date.html`：單一日期作業頁
- `css/style.css`：樣式
- `js/app.js`：前端邏輯（LIFF / API / UI）
- `gas/Code.gs`：Google Apps Script 後端範本

## 部署步驟

1. 建立 Google 試算表，記下 `Spreadsheet ID`。
2. 開啟 Google Apps Script，貼上 `gas/Code.gs`。
3. 將 `Code.gs` 的 `SHEET_ID` 改成你的試算表 ID。
4. 依需求修改 `FIXED_MEMBERS`（固定人員名單）。
5. 部署 Apps Script 為 Web App：
   - Execute as: `Me`
   - Who has access: `Anyone`
6. 取得 Web App URL（結尾通常為 `/exec`）。
7. 修改 `js/app.js`：
   - `APP_CONFIG.apiBaseUrl = "你的 GAS Web App URL"`
   - `APP_CONFIG.liffId = "你的 LIFF ID"`
8. 將專案 push 到 GitHub，並在 GitHub Pages 啟用此 repo。

## 試算表資料表

程式會自動建立（若不存在）：

- `leave_records`
- `extra_signups`
- `final_list`

## 注意事項

- 前端 `localStorage` 會鎖定「同日期同人員」僅單次請假點擊。
- 後端也有重複防護（同日期 + 同 memberId 不重複寫入）。
- 你可以直接在 `js/app.js` 修改 `fixedMembers` 名單與天數範圍。
