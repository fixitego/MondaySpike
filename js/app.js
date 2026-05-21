const APP_CONFIG = {
  liffId: "YOUR_LIFF_ID",
  // 將此網址改成你部署好的 Google Apps Script Web App URL
  apiBaseUrl: "YOUR_GAS_WEBAPP_URL",
  fixedMembers: [
    { id: "M001", name: "王小明", gender: "男" },
    { id: "M002", name: "林小美", gender: "女" },
    { id: "M003", name: "陳大華", gender: "男" },
    { id: "M004", name: "李佳玲", gender: "女" },
    { id: "M005", name: "吳志強", gender: "男" },
    { id: "M006", name: "蔡佩君", gender: "女" }
  ]
};

const STORAGE_PREFIX = "leave_sent";

document.addEventListener("DOMContentLoaded", () => {
  initLiffSafe();

  if (isIndexPage()) {
    initIndexPage();
    return;
  }

  if (isDatePage()) {
    initDatePage();
  }
});

function isIndexPage() {
  return !!document.getElementById("dateList");
}

function isDatePage() {
  return !!document.getElementById("memberList");
}

function initIndexPage() {
  const dateList = document.getElementById("dateList");
  const customDateInput = document.getElementById("customDate");
  const goDateBtn = document.getElementById("goDateBtn");

  const today = new Date();
  const allDates = [];

  for (let i = 0; i < 14; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    allDates.push(formatDate(d));
  }

  dateList.innerHTML = allDates
    .map(
      (date) =>
        `<button class="date-card" type="button" data-date="${date}" aria-label="進入 ${date} 報名頁">${date}</button>`
    )
    .join("");

  dateList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const btn = target.closest(".date-card");
    if (!btn) {
      return;
    }

    const selectedDate = btn.getAttribute("data-date");
    if (!selectedDate) {
      return;
    }

    location.href = `./date.html?date=${encodeURIComponent(selectedDate)}`;
  });

  customDateInput.value = formatDate(today);

  goDateBtn.addEventListener("click", () => {
    const selected = customDateInput.value;
    if (!selected) {
      alert("請先選擇日期");
      return;
    }
    location.href = `./date.html?date=${encodeURIComponent(selected)}`;
  });
}

async function initDatePage() {
  const date = getDateFromQuery();
  const pageTitle = document.getElementById("pageTitle");
  const pageSubTitle = document.getElementById("pageSubTitle");

  pageTitle.textContent = `${date} 報名頁`;
  pageSubTitle.textContent = `日期：${date}。可執行固定名單請假、額外報名與最終名單刷新。`;

  renderFixedMembers(date);
  bindExtraForm(date);
  bindRefreshFinalList(date);

  await loadFinalList(date);
}

function renderFixedMembers(date) {
  const root = document.getElementById("memberList");

  root.innerHTML = APP_CONFIG.fixedMembers
    .map((member) => {
      const key = leaveStorageKey(date, member.id);
      const sent = localStorage.getItem(key) === "1";
      const itemClass = sent ? "member-item leave" : "member-item";
      const statusText = sent ? "已送出請假" : "尚未請假";
      const btnText = sent ? "已送出" : "請假";

      return `
      <div class="${itemClass}" id="row-${member.id}">
        <div class="member-left">
          <span class="member-name">${escapeHtml(member.name)}</span>
          <span class="member-status" id="status-${member.id}">${statusText}</span>
        </div>
        <button
          class="btn"
          type="button"
          id="leave-btn-${member.id}"
          ${sent ? "disabled" : ""}
          data-member-id="${member.id}"
        >${btnText}</button>
      </div>`;
    })
    .join("");

  APP_CONFIG.fixedMembers.forEach((member) => {
    const button = document.getElementById(`leave-btn-${member.id}`);
    if (!button || button.disabled) {
      return;
    }

    button.addEventListener("click", async () => {
      const ok = window.confirm(`確定要幫 ${member.name} 送出請假嗎？\n此日期只能送出一次。`);
      if (!ok) {
        return;
      }

      button.disabled = true;
      button.textContent = "送出中...";

      try {
        await callApi({
          action: "leave",
          date,
          memberId: member.id,
          memberName: member.name,
          gender: member.gender
        });

        localStorage.setItem(leaveStorageKey(date, member.id), "1");
        markMemberLeave(member.id);
        button.textContent = "已送出";

        await loadFinalList(date);
      } catch (error) {
        button.disabled = false;
        button.textContent = "請假";
        alert(`請假送出失敗：${error.message}`);
      }
    });
  });
}

function markMemberLeave(memberId) {
  const row = document.getElementById(`row-${memberId}`);
  const status = document.getElementById(`status-${memberId}`);
  if (row) {
    row.classList.add("leave");
  }
  if (status) {
    status.textContent = "已送出請假";
  }
}

function bindExtraForm(date) {
  const form = document.getElementById("extraForm");
  const submitBtn = document.getElementById("extraSubmitBtn");
  const nameInput = document.getElementById("extraName");
  const genderInput = document.getElementById("extraGender");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const gender = genderInput.value;

    if (!name || !gender) {
      alert("請填寫姓名與性別");
      return;
    }

    const ok = window.confirm(`確認送出額外報名？\n姓名：${name}\n性別：${gender}\n日期：${date}`);
    if (!ok) {
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中...";

    try {
      await callApi({
        action: "extra_signup",
        date,
        name,
        gender
      });

      form.reset();
      submitBtn.textContent = "送出成功";
      setTimeout(() => {
        submitBtn.textContent = "送出額外報名";
        submitBtn.disabled = false;
      }, 1000);

      await loadFinalList(date);
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出額外報名";
      alert(`額外報名送出失敗：${error.message}`);
    }
  });
}

function bindRefreshFinalList(date) {
  const btn = document.getElementById("refreshFinalBtn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "刷新中...";

    try {
      await loadFinalList(date);
    } finally {
      btn.disabled = false;
      btn.textContent = "刷新名單";
    }
  });
}

async function loadFinalList(date) {
  const tbody = document.getElementById("finalListBody");
  tbody.innerHTML = `<tr><td colspan="4">載入中...</td></tr>`;

  try {
    const data = await callApi({
      action: "final_list",
      date
    });

    const records = Array.isArray(data.records) ? data.records : [];

    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="4">目前沒有資料</td></tr>`;
      return;
    }

    tbody.innerHTML = records
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.name || "")}</td>
        <td>${escapeHtml(r.gender || "")}</td>
        <td>${escapeHtml(r.source || "")}</td>
        <td>${escapeHtml(r.status || "")}</td>
      </tr>`
      )
      .join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="4">載入失敗：${escapeHtml(error.message)}</td></tr>`;
  }
}

async function callApi(params) {
  ensureApiConfigured();

  const url = buildApiUrl(params);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.message || "API 回傳失敗");
  }

  return result;
}

function buildApiUrl(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    query.set(key, value == null ? "" : String(value));
  });
  return `${APP_CONFIG.apiBaseUrl}?${query.toString()}`;
}

function ensureApiConfigured() {
  if (!APP_CONFIG.apiBaseUrl || APP_CONFIG.apiBaseUrl.includes("YOUR_GAS_WEBAPP_URL")) {
    throw new Error("請先在 js/app.js 設定 APP_CONFIG.apiBaseUrl");
  }
}

async function initLiffSafe() {
  if (!window.liff) {
    return;
  }

  if (!APP_CONFIG.liffId || APP_CONFIG.liffId.includes("YOUR_LIFF_ID")) {
    return;
  }

  try {
    await window.liff.init({ liffId: APP_CONFIG.liffId });
    if (window.liff.isLoggedIn()) {
      const profile = await window.liff.getProfile();
      const nameInput = document.getElementById("extraName");
      if (nameInput && !nameInput.value) {
        nameInput.value = profile.displayName || "";
      }
    }
  } catch (error) {
    console.warn("LIFF init failed:", error);
  }
}

function getDateFromQuery() {
  const p = new URLSearchParams(location.search);
  const d = p.get("date");
  if (!d) {
    return formatDate(new Date());
  }
  return d;
}

function leaveStorageKey(date, memberId) {
  return `${STORAGE_PREFIX}:${date}:${memberId}`;
}

function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = `${dateObj.getMonth() + 1}`.padStart(2, "0");
  const d = `${dateObj.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
