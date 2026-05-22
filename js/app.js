const APP_CONFIG = {
  liffId: "2010159498-6XQaB49g",
  apiBaseUrl: "https://script.google.com/macros/s/AKfycbw8OQvzh3a4ZlokJsAFeW9XPdRKKibYOxq4dR6unOw7elkM1zjAwW1l4sk0_fPhowYW/exec"
};

const STORAGE_PREFIX = "leave_sent";
const state = {
  availableDates: [],
  dateSet: new Set(),
  fixedMembers: []
};

document.addEventListener("DOMContentLoaded", async () => {
  await initLiffSafe();

  if (isIndexPage()) {
    await initIndexPage();
    return;
  }

  if (isDatePage()) {
    await initDatePage();
  }
});

function isIndexPage() {
  return !!document.getElementById("dateList");
}

function isDatePage() {
  return !!document.getElementById("memberList");
}

async function initIndexPage() {
  const reloadBtn = document.getElementById("reloadConfigBtn");
  const goDateBtn = document.getElementById("goDateBtn");

  reloadBtn.addEventListener("click", async () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = "讀取中...";
    try {
      await loadControlConfig(true);
      renderIndexDateControls();
    } catch (error) {
      alert(`讀取設定失敗：${error.message}`);
    } finally {
      reloadBtn.disabled = false;
      reloadBtn.textContent = "重新讀取設定";
    }
  });

  goDateBtn.addEventListener("click", () => {
    const selected = getSelectedCustomDate();
    if (!selected) {
      alert("請先選擇可用日期");
      return;
    }
    goToDatePage(selected);
  });

  try {
    await loadControlConfig(false);
    renderIndexDateControls();
  } catch (error) {
    showDateListMessage(`設定讀取失敗：${escapeHtml(error.message)}`);
    disableIndexControls();
  }
}

function renderIndexDateControls() {
  const dateList = document.getElementById("dateList");
  const customDateSelect = document.getElementById("customDateSelect");

  if (!state.availableDates.length) {
    showDateListMessage("目前沒有可用日期，請到 Google Sheet 的 available_dates 補資料。");
    disableIndexControls();
    return;
  }

  dateList.innerHTML = state.availableDates
    .map(
      (item) =>
        `<button class="date-card" type="button" data-date="${item.date}" aria-label="進入 ${item.label} 報名頁">
          <span>${escapeHtml(item.label)}</span>
          <small>${escapeHtml(item.date)}</small>
        </button>`
    )
    .join("");

  dateList.onclick = (event) => {
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
    goToDatePage(selectedDate);
  };

  customDateSelect.innerHTML = state.availableDates
    .map((item) => `<option value="${item.date}">${escapeHtml(item.label)} (${escapeHtml(item.date)})</option>`)
    .join("");

  customDateSelect.disabled = false;
  document.getElementById("goDateBtn").disabled = false;
}

function disableIndexControls() {
  const customDateSelect = document.getElementById("customDateSelect");
  const goDateBtn = document.getElementById("goDateBtn");
  if (customDateSelect) {
    customDateSelect.innerHTML = `<option value="">目前無可用日期</option>`;
    customDateSelect.disabled = true;
  }
  if (goDateBtn) {
    goDateBtn.disabled = true;
  }
}

function showDateListMessage(message) {
  const dateList = document.getElementById("dateList");
  if (dateList) {
    dateList.innerHTML = `<div class="empty-state">${message}</div>`;
  }
}

function getSelectedCustomDate() {
  const select = document.getElementById("customDateSelect");
  if (!select) {
    return "";
  }
  const value = String(select.value || "").trim();
  if (!state.dateSet.has(value)) {
    return "";
  }
  return value;
}

async function initDatePage() {
  const pageTitle = document.getElementById("pageTitle");
  const pageSubTitle = document.getElementById("pageSubTitle");
  const pageError = document.getElementById("pageError");
  const date = getDateFromQuery();

  try {
    await loadControlConfig(false);
  } catch (error) {
    pageError.hidden = false;
    pageError.textContent = `無法讀取設定：${error.message}`;
    lockDatePageActions();
    return;
  }

  if (!state.dateSet.has(date)) {
    pageTitle.textContent = "日期不可用";
    pageSubTitle.textContent = `你選的日期 ${date} 不在可開放清單內。`;
    pageError.hidden = false;
    pageError.textContent = "請回上一頁，從可用日期按鈕重新進入。";
    lockDatePageActions();
    return;
  }

  pageTitle.textContent = `${date} 報名頁`;
  pageSubTitle.textContent = `日期：${date}。固定名單與可用日期均由 Google Sheet 控制。`;

  renderFixedMembers(date);
  bindExtraForm(date);
  bindRefreshFinalList(date);
  await loadFinalList(date);
}

function lockDatePageActions() {
  const memberList = document.getElementById("memberList");
  const extraSubmitBtn = document.getElementById("extraSubmitBtn");
  const refreshFinalBtn = document.getElementById("refreshFinalBtn");

  if (memberList) {
    memberList.innerHTML = `<div class="empty-state">目前無法操作此頁面</div>`;
  }
  if (extraSubmitBtn) {
    extraSubmitBtn.disabled = true;
  }
  if (refreshFinalBtn) {
    refreshFinalBtn.disabled = true;
  }
}

function renderFixedMembers(date) {
  const root = document.getElementById("memberList");

  if (!state.fixedMembers.length) {
    root.innerHTML = `<div class="empty-state">目前沒有固定名單，請到 Google Sheet 的 fixed_members 新增資料。</div>`;
    return;
  }

  root.innerHTML = state.fixedMembers
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
          <span class="member-meta">${escapeHtml(member.id)} / ${escapeHtml(member.gender)}</span>
          <span class="member-status" id="status-${member.id}">${statusText}</span>
        </div>
        <button
          class="btn"
          type="button"
          id="leave-btn-${member.id}"
          ${sent ? "disabled" : ""}
        >${btnText}</button>
      </div>`;
    })
    .join("");

  state.fixedMembers.forEach((member) => {
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
      }, 900);

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
    const data = await callApi({ action: "final_list", date });
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

async function loadControlConfig(forceReload) {
  if (!forceReload && state.availableDates.length && state.fixedMembers.length) {
    return;
  }

  const data = await callApi({ action: "config" });

  const availableDates = Array.isArray(data.availableDates) ? data.availableDates : [];
  const fixedMembers = Array.isArray(data.fixedMembers) ? data.fixedMembers : [];

  state.availableDates = availableDates
    .map((row) => {
      const date = String(row.date || "").trim();
      const label = String(row.label || row.date || "").trim();
      if (!isValidIsoDate(date)) {
        return null;
      }
      return { date, label: label || date };
    })
    .filter(Boolean);

  state.fixedMembers = fixedMembers
    .map((row) => {
      const id = String(row.memberId || "").trim();
      const name = String(row.name || "").trim();
      const gender = String(row.gender || "").trim();
      if (!id || !name) {
        return null;
      }
      return { id, name, gender: gender || "未填" };
    })
    .filter(Boolean);

  state.dateSet = new Set(state.availableDates.map((item) => item.date));
}

function goToDatePage(date) {
  location.href = `./date.html?date=${encodeURIComponent(date)}`;
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
  const d = String(p.get("date") || "").trim();
  if (!d) {
    return "";
  }
  return d;
}

function leaveStorageKey(date, memberId) {
  return `${STORAGE_PREFIX}:${date}:${memberId}`;
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
