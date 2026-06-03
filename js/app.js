const APP_CONFIG = {
  liffId: "2010159498-6XQaB49g",
  apiBaseUrl: "https://script.google.com/macros/s/AKfycbzYd5L6yfD3TEXaKSVpqE3pULd9UH0wcGg_DtFaNwUsO6TIDJ93UrGnpyI255INIQ1W/exec",
  apiMode: "live", // live | mock
  settlementTriggerToken: "CHANGE_ME_STRONG_TOKEN"
};

const state = {
  availableDates: [],
  dateSet: new Set(),
  fixedMembers: [],
  leaveMemberIds: new Set(),
  policy: { allowUserEdit: true, allowEditPastDate: false, enableManualSettlementTrigger: true, today: "" },
  currentDate: "",
  isDateLocked: false
};

document.addEventListener("DOMContentLoaded", async () => {
  await initLiffSafe();
  if (isIndexPage()) return initIndexPage();
  if (isDatePage()) return initDatePage();
});

function isIndexPage() { return !!document.getElementById("dateList"); }
function isDatePage() { return !!document.getElementById("memberListMale"); }

async function initIndexPage() {
  const goDateBtn = document.getElementById("goDateBtn");
  goDateBtn.addEventListener("click", () => {
    const selected = getSelectedCustomDate();
    if (!selected) return uiAlert("請先選擇可用日期");
    showGlobalLoading();
    goToDatePage(selected);
  });

  try {
    showGlobalLoading();
    await loadControlConfig(false);
    renderIndexDateControls();
  } catch (error) {
    showDateListMessage(`設定讀取失敗：${escapeHtml(error.message)}`);
    disableIndexControls();
  } finally {
    hideGlobalLoading();
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

  dateList.innerHTML = state.availableDates.map((item) =>
    `<button class="date-card" type="button" data-date="${item.date}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.date)}</small></button>`
  ).join("");

  dateList.onclick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest(".date-card");
    if (!btn) return;
    const selectedDate = btn.getAttribute("data-date");
    if (!selectedDate) return;
    showGlobalLoading();
    goToDatePage(selectedDate);
  };

  customDateSelect.innerHTML = state.availableDates.map((item) =>
    `<option value="${item.date}">${escapeHtml(item.label)} (${escapeHtml(item.date)})</option>`).join("");
  customDateSelect.disabled = false;
  document.getElementById("goDateBtn").disabled = false;
}

async function initDatePage() {
  const date = getDateFromQuery();
  const pageError = document.getElementById("pageError");

  showGlobalLoading();
  try {
    await loadControlConfig(false);

    if (!state.dateSet.has(date)) {
      pageError.hidden = false;
      pageError.textContent = `日期 ${date} 不在可用清單內。`;
      lockDatePageActions();
      return;
    }

    state.currentDate = date;
    state.isDateLocked = isDatePast(date, state.policy.today) && !state.policy.allowEditPastDate;

    document.getElementById("pageTitle").textContent = `${date} 報名頁`;
    document.getElementById("pageSubTitle").textContent = state.isDateLocked
      ? `日期：${date}（已過期，僅可檢視資料）`
      : `日期：${date}`;

    renderFixedMembers(date);
    bindExtraForm(date);
    bindRefreshButtons(date);
    bindSettlementButton(date);
    bindExtraTypeBehavior();
    applyDateLockToInputs();

    await loadPageData(date);
  } catch (error) {
    pageError.hidden = false;
    pageError.textContent = `載入失敗：${error.message}`;
    lockDatePageActions();
  } finally {
    hideGlobalLoading();
  }
}

function renderFixedMembers(date) {
  const maleRoot = document.getElementById("memberListMale");
  const femaleRoot = document.getElementById("memberListFemale");
  const male = state.fixedMembers.filter((m) => m.gender === "男");
  const female = state.fixedMembers.filter((m) => m.gender === "女");

  maleRoot.innerHTML = buildMemberHtml(male, date, "male");
  femaleRoot.innerHTML = buildMemberHtml(female, date, "female");

  if (!canEditCurrentDate()) return;

  state.fixedMembers.forEach((member) => {
    const button = document.getElementById(`leave-btn-${member.id}`);
    if (!button || button.disabled) return;

    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = await uiConfirm(`確定要幫 ${member.name} 送出請假嗎？\n此日期只能送出一次。`);
      if (!ok) return;

      button.disabled = true;
      button.textContent = "送出中...";
      try {
        await callApi({ action: "leave", date, memberId: member.id, memberName: member.name, gender: member.gender });
        markMemberLeave(member.id);
        button.textContent = "已送出";
        await loadFinalList(date);
      } catch (error) {
        button.disabled = false;
        button.textContent = "請假";
        uiAlert(`請假送出失敗：${error.message}`);
      }
    });
  });
}

function buildMemberHtml(list, date, genderClass) {
  if (!list.length) return `<div class="empty-state">無資料</div>`;
  return list.map((member) => {
    const sent = state.leaveMemberIds.has(member.id);
    const itemClass = sent ? `member-item ${genderClass} leave` : `member-item ${genderClass}`;
    const disabled = sent || !canEditCurrentDate();
    return `
      <div class="${itemClass}" id="row-${member.id}">
        <div class="member-left">
          <span class="member-name">${escapeHtml(member.name)}</span>
          <span class="member-meta">${escapeHtml(member.id)} / ${escapeHtml(member.gender)}</span>
          <span class="member-status" id="status-${member.id}">${sent ? "已送出請假" : "尚未請假"}</span>
        </div>
        <button class="btn mini" type="button" id="leave-btn-${member.id}" ${disabled ? "disabled" : ""}>${sent ? "已送出" : "請假"}</button>
      </div>`;
  }).join("");
}

function bindExtraTypeBehavior() {
  const typeSel = document.getElementById("extraType");
  const maleName = document.getElementById("maleName");
  const femaleName = document.getElementById("femaleName");
  const pairCheck = document.getElementById("pairMustTogether");
  const form = document.getElementById("extraForm");
  const maleField = document.getElementById("maleField");
  const femaleField = document.getElementById("femaleField");
  const pairRuleField = document.getElementById("pairRuleField");

  const refresh = () => {
    const t = typeSel.value;
    maleName.disabled = t === "FEMALE";
    femaleName.disabled = t === "MALE";
    maleName.required = t !== "FEMALE";
    femaleName.required = t !== "MALE";
    pairCheck.disabled = t !== "PAIR";
    maleField.hidden = t === "FEMALE";
    femaleField.hidden = t === "MALE";
    pairRuleField.hidden = t !== "PAIR";
    if (t !== "PAIR") pairCheck.checked = false;

    form.classList.remove("type-male", "type-female", "type-pair");
    form.classList.add(t === "MALE" ? "type-male" : t === "FEMALE" ? "type-female" : "type-pair");
  };

  typeSel.addEventListener("change", refresh);
  refresh();
}

function bindExtraForm(date) {
  const form = document.getElementById("extraForm");
  const submitBtn = document.getElementById("extraSubmitBtn");

  if (!canEditCurrentDate()) {
    submitBtn.disabled = true;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const extraType = document.getElementById("extraType").value;
    const maleName = document.getElementById("maleName").value.trim();
    const femaleName = document.getElementById("femaleName").value.trim();
    const note = document.getElementById("extraNote").value.trim();
    const pairMustTogether = document.getElementById("pairMustTogether").checked ? "1" : "0";

    if (extraType === "MALE" && !maleName) return uiAlert("請輸入男生姓名");
    if (extraType === "FEMALE" && !femaleName) return uiAlert("請輸入女生姓名");
    if (extraType === "PAIR" && (!maleName || !femaleName)) return uiAlert("一男一女都要填");

    if (!(await uiConfirm("確認送出額外報名？"))) return;

    submitBtn.disabled = true;
    try {
      await callApi({ action: "extra_signup", date, extraType, maleName, femaleName, note, pairMustTogether });
      form.reset();
      document.getElementById("extraType").value = "MALE";
      bindExtraTypeBehavior();
      await Promise.all([loadExtraList(date), loadFinalList(date)]);
    } catch (error) {
      uiAlert(`額外報名失敗：${error.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function bindRefreshButtons(date) {
  const finalBtn = document.getElementById("refreshFinalBtn");
  const extraBtn = document.getElementById("refreshExtraBtn");
  const auditBtn = document.getElementById("refreshAuditBtn");

  finalBtn.addEventListener("click", async () => {
    finalBtn.classList.add("is-loading");
    finalBtn.disabled = true;
    await Promise.all([loadFinalList(date), loadSettlementStatus(date)]);
    finalBtn.disabled = false;
    finalBtn.classList.remove("is-loading");
  });

  extraBtn.addEventListener("click", async () => {
    extraBtn.classList.add("is-loading");
    extraBtn.disabled = true;
    await loadExtraList(date);
    extraBtn.disabled = false;
    extraBtn.classList.remove("is-loading");
  });

  auditBtn.addEventListener("click", async () => {
    auditBtn.classList.add("is-loading");
    auditBtn.disabled = true;
    await loadAuditLogs(date);
    auditBtn.disabled = false;
    auditBtn.classList.remove("is-loading");
  });
}

function bindSettlementButton(date) {
  const btn = document.getElementById("triggerSettlementBtn");
  if (!state.policy.enableManualSettlementTrigger || !canEditCurrentDate()) {
    btn.disabled = true;
    return;
  }

  btn.addEventListener("click", async () => {
    const token = await uiPrompt("請輸入結算觸發碼");
    if (!token) return;
    if (!(await uiConfirm("確定現在要觸發結算嗎？觸發後會開始用額外報名補位。"))) return;

    btn.disabled = true;
    try {
      await callApi({ action: "trigger_settlement", date, token });
      await Promise.all([loadSettlementStatus(date), loadFinalList(date)]);
    } catch (error) {
      uiAlert(`觸發結算失敗：${error.message}`);
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadSettlementStatus(date) {
  const data = await callApi({ action: "settlement_status", date });
  renderSettlementStatus(data.settlement);
}

function renderSettlementStatus(settlement) {
  const s = settlement || {};
  document.getElementById("settlementInfo").textContent = s.settled
    ? `結算狀態：已結算（${s.settledAt || ""}）`
    : `結算狀態：未結算；排程時間：${s.settleAt || "未設定"}`;
}

async function loadPageData(date) {
  const data = await callApi({ action: "page_data", date });
  applyLeaveState(data.leaveMemberIds);
  renderFixedMembers(date);
  renderFinalList(data.records);
  renderExtraList(date, data.extraRecords);
  renderSettlementStatus(data.settlement);
  renderAuditLogs(data.auditRecords);
}

function renderFinalList(records) {
  const body = document.getElementById("finalListBody");
  const summary = document.getElementById("finalSummary");
  const rows = Array.isArray(records) ? records : [];

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3">目前沒有資料</td></tr>`;
    summary.textContent = "總人數：0 / 18";
    return;
  }

  const maleRows = rows.filter((r) => r.gender === "男");
  const femaleRows = rows.filter((r) => r.gender === "女");
  const otherRows = rows.filter((r) => r.gender !== "男" && r.gender !== "女");
  const renderRow = (r, cls) =>
    `<tr class="${cls}"><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.gender)}</td><td>${escapeHtml(r.source)}</td></tr>`;

  let html = "";
  if (maleRows.length) {
    html += `<tr class="group-row"><td colspan="3">男生名單</td></tr>`;
    html += maleRows.map((r) => renderRow(r, "gender-male")).join("");
  }
  if (femaleRows.length) {
    html += `<tr class="group-row"><td colspan="3">女生名單</td></tr>`;
    html += femaleRows.map((r) => renderRow(r, "gender-female")).join("");
  }
  if (otherRows.length) {
    html += `<tr class="group-row"><td colspan="3">其他</td></tr>`;
    html += otherRows.map((r) => renderRow(r, "")).join("");
  }

  body.innerHTML = html;
  summary.textContent = `總人數：${rows.length} / 18，女生：${femaleRows.length} / 9`;
}

function renderAuditLogs(records) {
  const body = document.getElementById("auditBody");
  const rows = Array.isArray(records) ? records : [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4">目前沒有異動紀錄</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r) =>
    `<tr><td>${escapeHtml(r.time || "")}</td><td>${escapeHtml(r.kind || "")}</td><td>${escapeHtml(r.action || "")}</td><td>${escapeHtml(r.detail || "")}</td></tr>`
  ).join("");
}

async function loadExtraList(date) {
  const body = document.getElementById("extraListBody");
  body.innerHTML = `<tr><td colspan="4">載入中...</td></tr>`;

  try {
    const data = await callApi({ action: "extra_list", date });
    renderExtraList(date, data.records);
  } catch (error) {
    body.innerHTML = `<tr><td colspan="4">載入失敗：${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderExtraList(date, records) {
  const body = document.getElementById("extraListBody");
  const rows = Array.isArray(records) ? records : [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4">目前沒有資料</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r) => {
    const who = r.type === "MALE" ? r.maleName : r.type === "FEMALE" ? r.femaleName : `${r.maleName} + ${r.femaleName}`;
    const label = r.type === "MALE" ? "男" : r.type === "FEMALE" ? "女" : "一男一女";
    const rule = r.type === "PAIR" ? (r.pairMustTogether === "1" ? "（同進同退）" : "（可拆）") : "";
    const cancelBtn = canEditCurrentDate()
      ? `<button class="btn mini danger" data-cancel-signup="${escapeHtml(r.signupId)}">取消</button>`
      : "";

    return `<tr>
      <td>${label}${rule}</td>
      <td>${escapeHtml(who)}</td>
      <td>${escapeHtml(r.status || "候補")}</td>
      <td>${escapeHtml(r.note || "")} ${cancelBtn}</td>
    </tr>`;
  }).join("");

  if (canEditCurrentDate()) {
    body.querySelectorAll("[data-cancel-signup]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const signupId = btn.getAttribute("data-cancel-signup");
        if (!signupId) return;
        if (!(await uiConfirm("確定要取消這筆額外報名嗎？"))) return;
        btn.disabled = true;
        try {
          await callApi({ action: "cancel_extra_signup", date, signupId });
          await loadPageData(date);
        } catch (error) {
          uiAlert(`取消失敗：${error.message}`);
          btn.disabled = false;
        }
      });
    });
  }
}

async function loadFinalList(date) {
  const body = document.getElementById("finalListBody");
  const summary = document.getElementById("finalSummary");
  body.innerHTML = `<tr><td colspan="3">載入中...</td></tr>`;

  try {
    const data = await callApi({ action: "final_list", date });
    const rows = Array.isArray(data.records) ? data.records : [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="3">目前沒有資料</td></tr>`;
      summary.textContent = "總人數：0 / 18";
      return;
    }

    const maleRows = rows.filter((r) => r.gender === "男");
    const femaleRows = rows.filter((r) => r.gender === "女");
    const otherRows = rows.filter((r) => r.gender !== "男" && r.gender !== "女");
    const maleCount = maleRows.length;
    const femaleCount = femaleRows.length;

    const renderRow = (r, cls) =>
      `<tr class="${cls}"><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.gender)}</td><td>${escapeHtml(r.source)}</td></tr>`;

    let html = "";
    if (maleRows.length) {
      html += `<tr class="group-row"><td colspan="3">男生名單</td></tr>`;
      html += maleRows.map((r) => renderRow(r, "gender-male")).join("");
    }
    if (femaleRows.length) {
      html += `<tr class="group-row"><td colspan="3">女生名單</td></tr>`;
      html += femaleRows.map((r) => renderRow(r, "gender-female")).join("");
    }
    if (otherRows.length) {
      html += `<tr class="group-row"><td colspan="3">其他</td></tr>`;
      html += otherRows.map((r) => renderRow(r, "")).join("");
    }
    body.innerHTML = html;

    summary.textContent = `總人數：${rows.length} / 18，男生：${maleCount} 人，女生：${femaleCount} 人`;
  } catch (error) {
    body.innerHTML = `<tr><td colspan="3">載入失敗：${escapeHtml(error.message)}</td></tr>`;
    summary.textContent = "";
  }
}

async function loadAuditLogs(date) {
  const body = document.getElementById("auditBody");
  body.innerHTML = `<tr><td colspan="4">載入中...</td></tr>`;
  try {
    const data = await callApi({ action: "audit_logs", date });
    const rows = Array.isArray(data.records) ? data.records : [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4">目前沒有異動紀錄</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((r) =>
      `<tr><td>${escapeHtml(r.time || "")}</td><td>${escapeHtml(r.kind || "")}</td><td>${escapeHtml(r.action || "")}</td><td>${escapeHtml(r.detail || "")}</td></tr>`
    ).join("");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="4">載入失敗：${escapeHtml(error.message)}</td></tr>`;
  }
}

function lockDatePageActions() {
  document.getElementById("memberListMale").innerHTML = `<div class="empty-state">目前無法操作此頁面</div>`;
  document.getElementById("memberListFemale").innerHTML = `<div class="empty-state">目前無法操作此頁面</div>`;
}

function disableIndexControls() {
  const customDateSelect = document.getElementById("customDateSelect");
  const goDateBtn = document.getElementById("goDateBtn");
  if (customDateSelect) {
    customDateSelect.innerHTML = `<option value="">目前無可用日期</option>`;
    customDateSelect.disabled = true;
  }
  if (goDateBtn) goDateBtn.disabled = true;
}

function showDateListMessage(message) {
  const dateList = document.getElementById("dateList");
  if (dateList) dateList.innerHTML = `<div class="empty-state">${message}</div>`;
}

function getSelectedCustomDate() {
  const select = document.getElementById("customDateSelect");
  const value = String(select?.value || "").trim();
  return state.dateSet.has(value) ? value : "";
}

function canEditCurrentDate() {
  return !!state.policy.allowUserEdit && !state.isDateLocked;
}

function applyDateLockToInputs() {
  if (!state.isDateLocked) return;
  const ids = ["extraType", "maleName", "femaleName", "pairMustTogether", "extraNote", "extraSubmitBtn"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
}

function markMemberLeave(memberId) {
  state.leaveMemberIds.add(memberId);
  const row = document.getElementById(`row-${memberId}`);
  const status = document.getElementById(`status-${memberId}`);
  const button = document.getElementById(`leave-btn-${memberId}`);
  if (row) row.classList.add("leave");
  if (status) status.textContent = "已送出請假";
  if (button) {
    button.disabled = true;
    button.textContent = "已送出";
  }
}

async function loadControlConfig(forceReload) {
  const data = await callApi({ action: "config" });
  applyConfigData(data);
}

function applyConfigData(data) {
  state.availableDates = (Array.isArray(data.availableDates) ? data.availableDates : [])
    .map((row) => {
      const date = String(row.date || "").trim();
      const label = String(row.label || row.date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return { date, label: label || date };
    })
    .filter(Boolean);

  state.fixedMembers = (Array.isArray(data.fixedMembers) ? data.fixedMembers : [])
    .map((row) => {
      const id = String(row.memberId || "").trim();
      const name = String(row.name || "").trim();
      const gender = String(row.gender || "").trim();
      if (!id || !name) return null;
      return { id, name, gender: gender || "未填" };
    })
    .filter(Boolean);

  state.policy = data.policy || state.policy;
  state.dateSet = new Set(state.availableDates.map((d) => d.date));
}

function goToDatePage(date) {
  location.href = `./date.html?date=${encodeURIComponent(date)}`;
}

async function callApi(params) {
  if (APP_CONFIG.apiMode === "mock") {
    return mockApi(params);
  }

  ensureApiConfigured();
  const response = await fetch(buildApiUrl(params), { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.message || "API 回傳失敗");
  return result;
}

async function mockApi(params) {
  const mock = await loadMockSeed();
  const date = String(params.date || "").trim();

  if (params.action === "page_data") {
    const [finalData, extraData, settlementData] = await Promise.all([
      mockApi({ action: "final_list", date }),
      mockApi({ action: "extra_list", date }),
      mockApi({ action: "settlement_status", date })
    ]);
    return {
      ok: true,
      records: finalData.records,
      extraRecords: extraData.records,
      settlement: settlementData.settlement,
      auditRecords: [],
      leaveMemberIds: [...getMockLeaves(date)]
    };
  }

  if (params.action === "config") {
    return {
      ok: true,
      availableDates: mock.availableDates,
      fixedMembers: mock.fixedMembers,
      policy: { allowUserEdit: true, enableManualSettlementTrigger: true }
    };
  }

  if (params.action === "final_list") {
    const settled = getMockSettlement(date).settled;
    const leaves = getMockLeaves(date);
    let fixed = mock.fixedMembers
      .filter((m) => !leaves.has(m.memberId))
      .map((m) => ({ name: m.name, gender: m.gender, source: "固定名單" }));

    if (settled) {
      const extras = getMockExtras(date);
      for (const ex of extras) {
        if (fixed.length >= 18) break;
        if (ex.type === "MALE") fixed.push({ name: ex.maleName, gender: "男", source: "額外報名" });
        if (ex.type === "FEMALE") fixed.push({ name: ex.femaleName, gender: "女", source: "額外報名" });
        if (ex.type === "PAIR") {
          if (ex.pairMustTogether === "1") {
            if (fixed.length <= 16) {
              fixed.push({ name: ex.maleName, gender: "男", source: "額外報名(配對)" });
              fixed.push({ name: ex.femaleName, gender: "女", source: "額外報名(配對)" });
            }
          } else {
            fixed.push({ name: ex.maleName, gender: "男", source: "額外報名(配對-男)" });
            if (fixed.length < 18) fixed.push({ name: ex.femaleName, gender: "女", source: "額外報名(配對-女)" });
          }
        }
      }
    }

    return { ok: true, records: fixed.slice(0, 18) };
  }

  if (params.action === "extra_list") {
    return { ok: true, records: getMockExtras(date) };
  }

  if (params.action === "settlement_status") {
    return { ok: true, settlement: getMockSettlement(date) };
  }

  if (params.action === "leave") {
    addMockLeave(date, String(params.memberId || ""));
    return { ok: true };
  }

  if (params.action === "extra_signup") {
    addMockExtra({
      date,
      extraType: String(params.extraType || ""),
      maleName: String(params.maleName || ""),
      femaleName: String(params.femaleName || ""),
      note: String(params.note || ""),
      pairMustTogether: String(params.pairMustTogether || "0")
    });
    return { ok: true };
  }

  if (params.action === "cancel_extra_signup") {
    cancelMockExtra(String(params.signupId || ""));
    return { ok: true };
  }

  if (params.action === "trigger_settlement") {
    const token = String(params.token || "");
    if (token !== APP_CONFIG.settlementTriggerToken) {
      return { ok: false, message: "permission denied" };
    }
    setMockSettlement(date, true);
    return { ok: true };
  }

  return { ok: true };
}

async function loadMockSeed() {
  const [datesCsv, membersCsv] = await Promise.all([
    fetch("./sheet_templates/available_dates.csv").then((r) => r.text()),
    fetch("./sheet_templates/fixed_members.csv").then((r) => r.text())
  ]);
  const datesRows = parseCsvText(datesCsv);
  const membersRows = parseCsvText(membersCsv);

  return {
    availableDates: datesRows.filter((r) => isTruthyFlag(r.enabled)).map((r) => ({ date: r.date, label: r.label || r.date })),
    fixedMembers: membersRows
      .filter((r) => isTruthyFlag(r.enabled))
      .map((r) => ({ memberId: r.memberId, name: r.memberName, gender: r.gender || "未填" }))
  };
}

function parseCsvText(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((x) => x.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = String(cols[i] || "").trim();
    });
    return row;
  });
}

function isTruthyFlag(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function mockKey(type, date) {
  return `mock:${type}:${date}`;
}

function getMockLeaves(date) {
  return new Set(JSON.parse(localStorage.getItem(mockKey("leaves", date)) || "[]"));
}

function addMockLeave(date, memberId) {
  const set = getMockLeaves(date);
  if (memberId) set.add(memberId);
  localStorage.setItem(mockKey("leaves", date), JSON.stringify([...set]));
}

function getMockExtras(date) {
  return JSON.parse(localStorage.getItem(mockKey("extras", date)) || "[]");
}

function addMockExtra(payload) {
  const list = getMockExtras(payload.date);
  list.push({
    signupId: `MOCK-${Date.now()}`,
    type: payload.extraType,
    maleName: payload.maleName,
    femaleName: payload.femaleName,
    note: payload.note,
    pairMustTogether: payload.pairMustTogether
  });
  localStorage.setItem(mockKey("extras", payload.date), JSON.stringify(list));
}

function cancelMockExtra(signupId) {
  if (!signupId) return;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("mock:extras:"));
  keys.forEach((k) => {
    const rows = JSON.parse(localStorage.getItem(k) || "[]");
    localStorage.setItem(k, JSON.stringify(rows.filter((x) => x.signupId !== signupId)));
  });
}

function getMockSettlement(date) {
  return JSON.parse(localStorage.getItem(mockKey("settle", date)) || "{\"settled\":false,\"settleAt\":\"2026-05-25 20:30\",\"settledAt\":\"\"}");
}

function setMockSettlement(date, settled) {
  const item = getMockSettlement(date);
  item.settled = settled;
  item.settledAt = settled ? new Date().toISOString().slice(0, 19).replace("T", " ") : "";
  localStorage.setItem(mockKey("settle", date), JSON.stringify(item));
}

function isDatePast(date, today) {
  const d = String(date || "").trim();
  const t = String(today || "").trim();
  if (!d || !t) return false;
  return d < t;
}

function buildApiUrl(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => query.set(k, v == null ? "" : String(v)));
  return `${APP_CONFIG.apiBaseUrl}?${query.toString()}`;
}

function ensureApiConfigured() {
  if (!APP_CONFIG.apiBaseUrl || APP_CONFIG.apiBaseUrl.includes("YOUR_GAS_WEBAPP_URL")) {
    throw new Error("請先在 js/app.js 設定 APP_CONFIG.apiBaseUrl，或改為 apiMode=mock");
  }
}

async function initLiffSafe() {
  if (!window.liff) return;
  if (!APP_CONFIG.liffId || APP_CONFIG.liffId.includes("YOUR_LIFF_ID")) return;

  try {
    await window.liff.init({ liffId: APP_CONFIG.liffId });
  } catch (error) {
    console.warn("LIFF init failed:", error);
  }
}

function getDateFromQuery() {
  return String(new URLSearchParams(location.search).get("date") || "").trim();
}

function showGlobalLoading() {
  const el = document.getElementById("globalLoading");
  if (el) el.hidden = false;
}

function applyLeaveState(leaveMemberIds) {
  const ids = Array.isArray(leaveMemberIds) ? leaveMemberIds : [];
  state.leaveMemberIds = new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
}

function hideGlobalLoading() {
  const el = document.getElementById("globalLoading");
  if (el) el.hidden = true;
}

function ensureUiModalRoot() {
  let root = document.getElementById("uiModalRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "uiModalRoot";
    root.className = "ui-modal-root";
    root.hidden = true;
    root.innerHTML = `
      <div class="ui-modal-mask"></div>
      <div class="ui-modal-card">
        <h3 id="uiModalTitle">提示</h3>
        <p id="uiModalMessage"></p>
        <input id="uiModalInput" type="text" />
        <div class="ui-modal-actions">
          <button id="uiModalCancel" class="btn">取消</button>
          <button id="uiModalOk" class="btn primary">確認</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
  }
  return root;
}

function uiAlert(message) {
  return new Promise((resolve) => {
    const root = ensureUiModalRoot();
    const title = root.querySelector("#uiModalTitle");
    const msg = root.querySelector("#uiModalMessage");
    const input = root.querySelector("#uiModalInput");
    const cancel = root.querySelector("#uiModalCancel");
    const ok = root.querySelector("#uiModalOk");

    title.textContent = "提示";
    msg.textContent = message;
    input.hidden = true;
    cancel.hidden = true;
    ok.textContent = "知道了";
    root.hidden = false;

    const close = () => {
      root.hidden = true;
      ok.removeEventListener("click", onOk);
      resolve(true);
    };
    const onOk = () => close();
    ok.addEventListener("click", onOk);
  });
}

function uiConfirm(message) {
  return new Promise((resolve) => {
    const root = ensureUiModalRoot();
    const title = root.querySelector("#uiModalTitle");
    const msg = root.querySelector("#uiModalMessage");
    const input = root.querySelector("#uiModalInput");
    const cancel = root.querySelector("#uiModalCancel");
    const ok = root.querySelector("#uiModalOk");

    title.textContent = "請確認";
    msg.textContent = message;
    input.hidden = true;
    cancel.hidden = false;
    ok.textContent = "確認";
    root.hidden = false;

    const cleanup = () => {
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      root.hidden = true;
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
  });
}

function uiPrompt(message) {
  return new Promise((resolve) => {
    const root = ensureUiModalRoot();
    const title = root.querySelector("#uiModalTitle");
    const msg = root.querySelector("#uiModalMessage");
    const input = root.querySelector("#uiModalInput");
    const cancel = root.querySelector("#uiModalCancel");
    const ok = root.querySelector("#uiModalOk");

    title.textContent = "輸入驗證碼";
    msg.textContent = message;
    input.hidden = false;
    input.value = "";
    cancel.hidden = false;
    ok.textContent = "送出";
    root.hidden = false;
    setTimeout(() => input.focus(), 0);

    const cleanup = () => {
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      root.hidden = true;
    };
    const onOk = () => {
      const val = input.value.trim();
      cleanup();
      resolve(val);
    };
    const onCancel = () => {
      cleanup();
      resolve("");
    };
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
