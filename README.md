# MondaySpike - LIFF Mobile 報名網站

這是一個可部署在 GitHub Pages 的 LIFF 手機版報名網站。

## 核心特色

- 固定人員名單：由 Google Sheet `fixed_members` 控制
- 可開放日期清單：由 Google Sheet `available_dates` 控制
- 首頁快速按鈕 + 自訂日期下拉：都只顯示可用日期
- 自訂日期只能選清單內日期（前後端都會驗證）
- 固定名單請假：單次點擊 + 確認彈窗 + 顏色變化
- 男女固定名單有不同卡片背景樣式，整體字級縮小適配 18 人
- Banner 全寬 + 自動輪播背景圖 + Title
- 最終名單刷新按鈕為圖示型（↻）
- 最終名單只包含：未請假的固定人員 + 額外報名（補位）

## 專案檔案

- `index.html`：首頁（全寬 banner、日期入口、footer）
- `date.html`：單一日期作業頁
- `css/style.css`：排球風格樣式與圖片路徑設定
- `js/app.js`：前端邏輯（LIFF / API / UI）
- `gas/Code.gs`：Google Apps Script 後端
- `assets/images/*.svg`：預設背景圖（可直接替換）
- `sheet_templates/*.csv`：Google Sheet 範本資料

## Google Sheet 結構

系統會自動建立（若不存在）：

- `available_dates`
- `fixed_members`
- `leave_records`
- `extra_signups`
- `final_list`

### `available_dates` 欄位

- `date`：`YYYY-MM-DD`
- `label`：顯示名稱（例如：本週一）
- `enabled`：`1` 或 `true` 代表啟用

### `fixed_members` 欄位

- `memberId`：唯一 ID（例如 `M001`）
- `memberName`：姓名
- `gender`：性別
- `enabled`：`1` 或 `true` 代表啟用

## Sheet 範本（可直接匯入）

- `sheet_templates/available_dates.csv`
- `sheet_templates/fixed_members.csv`

## 圖片路徑與位置設定（程式碼內）

請改 `css/style.css` 的 `:root` 變數，全部都吃 repo 路徑：

```css
--hero-bg-image: url("../assets/images/home-banner.svg");
--hero-bg-position: center top;

--panel-dates-bg-image: url("../assets/images/panel-dates.svg");
--panel-dates-bg-position: center center;
--panel-custom-bg-image: url("../assets/images/panel-custom.svg");
--panel-custom-bg-position: right center;
--panel-members-bg-image: url("../assets/images/panel-members.svg");
--panel-members-bg-position: center top;
--panel-extra-bg-image: url("../assets/images/panel-extra.svg");
--panel-extra-bg-position: center center;
--panel-final-bg-image: url("../assets/images/panel-final.svg");
--panel-final-bg-position: center center;
--footer-bg-image: url("../assets/images/footer-bg.svg");
--footer-bg-position: center center;
```

## 部署步驟

1. 建立 Google 試算表，記下 `Spreadsheet ID`。
2. 開啟 Google Apps Script，貼上 `gas/Code.gs`。
3. 將 `Code.gs` 的 `SHEET_ID` 改成你的試算表 ID。
4. 部署 Apps Script 為 Web App：
   - Execute as: `Me`
   - Who has access: `Anyone`
5. 取得 Web App URL（通常結尾為 `/exec`）。
6. 修改 `js/app.js`：
   - `APP_CONFIG.apiBaseUrl = "你的 GAS Web App URL"`
   - `APP_CONFIG.liffId = "你的 LIFF ID"`
7. 將專案 push 到 GitHub，並在 GitHub Pages 啟用此 repo。

## 本機預覽

- `npm run dev`：開啟 `http://127.0.0.1:5500`
- `npm run dev:host`：給同網段手機測試（電腦 IP + `:5500`）

## 注意事項

- 前端 `localStorage` 會限制「同日期同人員」單次請假按鈕。
- 後端 `leave_records` 也會做重複防護。
- 若 `available_dates` 沒有該日期，前端頁面與後端 API 都會拒絕寫入。
- 目前提供的是「排球感」原創視覺底圖，不含官方版權角色素材。
