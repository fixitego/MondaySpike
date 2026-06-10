const APP_CONFIG = {
  liffId: "2010159498-6XQaB49g",
  siteBaseUrl: "https://fixitego.github.io/MondaySpike/",
  apiBaseUrl: "https://script.google.com/macros/s/AKfycbzYd5L6yfD3TEXaKSVpqE3pULd9UH0wcGg_DtFaNwUsO6TIDJ93UrGnpyI255INIQ1W/exec",
  apiMode: "live", // live | mock
  settlementTriggerToken: "CHANGE_ME_STRONG_TOKEN"
};

const LINE_IDENTITY_CACHE_KEY = "mondaySpike:lineIdentity";

const state = {
  availableDates: [],
  dateSet: new Set(),
  fixedMembers: [],
  leaveMemberIds: new Set(),
  lineUserId: "",
  lineDisplayName: "",
  lineIdToken: "",
  liffStatus: {
    sdk: false,
    initialized: false,
    inClient: false,
    loggedIn: false,
    profileReady: false,
    idTokenReady: false,
    configuredLiffId: "",
    runtimeLiffId: "",
    contextLiffId: "",
    liffIdMatches: false,
    accessTokenReady: false,
    accessTokenHash: "",
    scopes: [],
    profileScope: false,
    endpointUrl: "",
    errorCode: "",
    error: ""
  },
  policy: { allowUserEdit: true, allowEditPastDate: false, enableManualSettlementTrigger: true, today: "" },
  currentDate: "",
  isDateLocked: false
};

let liffReadyPromise = null;

document.addEventListener("DOMContentLoaded", () => {
  loadCachedLineIdentity();
  liffReadyPromise = initLiffSafe();
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
    await ensureLiffIdentityReady(false);
    await loadControlConfig(false);
    renderIndexDateControls();
    renderHomeMeta();
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

function renderHomeMeta() {
  const count = document.getElementById("homeDateCount");
  const nextDate = document.getElementById("homeNextDate");
  const userName = document.getElementById("homeUserName");
  if (count) count.textContent = String(state.availableDates.length);
  if (nextDate) {
    const next = state.availableDates.find((item) => item.date >= state.policy.today) || state.availableDates[0];
    nextDate.textContent = next ? (next.label || next.date) : "尚未開放";
  }
  if (userName) userName.textContent = state.lineDisplayName || "LINE 使用者";
}

async function initDatePage() {
  const date = getDateFromQuery();
  const pageError = document.getElementById("pageError");

  setDatePageLoading(true);
  showGlobalLoading("同步報名資料...");
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
    renderPageModeBadge();

    bindExtraForm(date);
    bindRefreshButtons(date);
    bindSettlementButton(date);
    bindVenueSettings(date);
    bindExtraTypeBehavior();
    applyDateLockToInputs();

    await loadPageData(date);
    setDatePageLoading(false);
  } catch (error) {
    setDatePageLoading(false);
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
        await ensureLiffIdentityReady(true);
        await callApi(withLineIdentity({ action: "leave", date, memberId: member.id, memberName: member.name, gender: member.gender }));
        markMemberLeave(member.id);
        button.textContent = "已送出";
        await loadPageData(date);
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

    if (!(await uiConfirm("確認送出臨打報名？"))) return;

    submitBtn.disabled = true;
    try {
      await ensureLiffIdentityReady(true);
      await callApi(withLineIdentity({ action: "extra_signup", date, extraType, maleName, femaleName, note, pairMustTogether }));
      form.reset();
      document.getElementById("extraType").value = "MALE";
      bindExtraTypeBehavior();
      await loadPageData(date);
    } catch (error) {
      uiAlert(`臨打報名失敗：${error.message}`);
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
    try {
      // final_list may trigger a scheduled settlement, so read its status afterwards.
      await loadFinalList(date);
      await loadSettlementStatus(date);
    } catch (error) {
      uiAlert(`刷新最終名單失敗：${error.message}`);
    } finally {
      finalBtn.disabled = false;
      finalBtn.classList.remove("is-loading");
    }
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
    const token = await uiPrompt("請輸入結算觸發碼。管理員 LINE 帳號可留空直接送出。");
    if (token === null) return;
    if (!token) await ensureLiffIdentityReady(true);
    else await ensureLiffIdentityReady(false);
    if (!token && !state.lineIdToken) return uiAlert(`無法以管理員身分觸發結算。${buildLiffStatusText()}`);
    if (!(await uiConfirm("確定現在要觸發結算嗎？觸發後會開始用臨打報名臨打。"))) return;

    btn.disabled = true;
    try {
      await callApi(withLineIdentity({ action: "trigger_settlement", date, token }));
      await loadPageData(date);
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

  const airConditioning = document.getElementById("hasAirConditioning");
  const feeInfo = document.getElementById("extraFeeInfo");
  if (airConditioning) airConditioning.checked = !!s.hasAirConditioning;
  if (feeInfo) {
    const fee = Number(s.extraFee) || (s.hasAirConditioning ? 230 : 190);
    feeInfo.textContent = `臨打費用：每人 ${fee} 元（${s.hasAirConditioning ? "含冷氣" : "未開冷氣"}）`;
  }
}

function bindVenueSettings(date) {
  const checkbox = document.getElementById("hasAirConditioning");
  const button = document.getElementById("saveVenueSettingsBtn");
  if (!checkbox || !button) return;

  if (!canEditCurrentDate()) {
    checkbox.disabled = true;
    button.disabled = true;
    return;
  }

  button.addEventListener("click", async () => {
    const token = await uiPrompt("請輸入管理員觸發碼。管理員 LINE 帳號可留空直接儲存。");
    if (token === null) return;
    if (!token) await ensureLiffIdentityReady(true);
    else await ensureLiffIdentityReady(false);
    if (!token && !state.lineIdToken) return uiAlert(`無法確認管理員身分。${buildLiffStatusText()}`);

    const hasAirConditioning = checkbox.checked ? "1" : "0";
    const fee = checkbox.checked ? 230 : 190;
    if (!(await uiConfirm(`確定儲存場地設定？\n臨打費用將顯示為每人 ${fee} 元。`))) return;

    button.disabled = true;
    try {
      const data = await callApi(withLineIdentity({
        action: "update_date_settings",
        date,
        hasAirConditioning,
        token
      }));
      renderSettlementStatus(data.settlement);
      await loadAuditLogs(date);
    } catch (error) {
      uiAlert(`場地設定儲存失敗：${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
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

function renderPageModeBadge() {
  const badge = document.getElementById("pageModeBadge");
  if (!badge) return;
  badge.classList.toggle("locked", state.isDateLocked);
  badge.innerHTML = state.isDateLocked ? "<i></i> READ ONLY" : "<i></i> SYNCED";
}

function renderFinalList(records) {
  const body = document.getElementById("finalListBody");
  const summary = document.getElementById("finalSummary");
  const rows = Array.isArray(records) ? records : [];

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3">目前沒有資料</td></tr>`;
    summary.textContent = "總人數：0 / 18";
    updateDashboardRosterMetrics([]);
    return;
  }

  const maleRows = rows.filter((r) => r.gender === "男");
  const femaleRows = rows.filter((r) => r.gender === "女");
  const otherRows = rows.filter((r) => r.gender !== "男" && r.gender !== "女");
  const renderRow = (r, cls) =>
    `<tr class="${cls}"><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.gender)}</td><td>${escapeHtml(r.source)}</td></tr>`;

  let html = "";
  if (femaleRows.length) {
    html += `<tr class="group-row"><td colspan="3">女生名單</td></tr>`;
    html += femaleRows.map((r) => renderRow(r, "gender-female")).join("");
  }
  if (maleRows.length) {
    html += `<tr class="group-row"><td colspan="3">男生名單</td></tr>`;
    html += maleRows.map((r) => renderRow(r, "gender-male")).join("");
  }
  if (otherRows.length) {
    html += `<tr class="group-row"><td colspan="3">其他</td></tr>`;
    html += otherRows.map((r) => renderRow(r, "")).join("");
  }

  body.innerHTML = html;
  summary.textContent = `總人數：${rows.length} / 18，女生：${femaleRows.length} / 9`;
  updateDashboardRosterMetrics(rows);
}

function updateDashboardRosterMetrics(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const total = document.getElementById("dashboardTotal");
  const female = document.getElementById("dashboardFemale");
  if (total) total.textContent = String(list.length);
  if (female) female.textContent = String(list.filter((row) => row.gender === "女").length);
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
  body.innerHTML = `<tr><td colspan="6">載入中...</td></tr>`;

  try {
    const data = await callApi({ action: "extra_list", date });
    renderExtraList(date, data.records);
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6">載入失敗：${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderExtraList(date, records) {
  const body = document.getElementById("extraListBody");
  const rows = Array.isArray(records) ? records : [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6">目前沒有資料</td></tr>`;
    updateDashboardExtraMetrics([]);
    return;
  }
  updateDashboardExtraMetrics(rows);

  body.innerHTML = rows.map((r) => {
    const who = r.type === "MALE" ? r.maleName : r.type === "FEMALE" ? r.femaleName : `${r.maleName} + ${r.femaleName}`;
    const label = r.type === "MALE" ? "男" : r.type === "FEMALE" ? "女" : "一男一女";
    const rule = r.type === "PAIR" ? (r.pairMustTogether === "1" ? "（同進同退）" : "（可拆）") : "";
    const paid = r.isPaid === true || r.isPaid === "1";
    const paymentLabel = paid ? "已收費" : "未收費";
    const paymentButton = `<button class="btn mini" data-payment-signup="${escapeHtml(r.signupId)}" data-paid="${paid ? "1" : "0"}">${paid ? "取消已收費" : "標記已收費"}</button>`;
    const cancelBtn = canEditCurrentDate()
      ? `<button class="btn mini danger" data-cancel-signup="${escapeHtml(r.signupId)}">取消</button>`
      : "";

    return `<tr>
      <td>${label}${rule}</td>
      <td>${escapeHtml(who)}</td>
      <td>${escapeHtml(r.status || "候補")}</td>
      <td><span class="payment-status ${paid ? "paid" : "unpaid"}">${paymentLabel}</span></td>
      <td>${escapeHtml(r.note || "")}</td>
      <td><div class="table-action-group">${paymentButton}${cancelBtn}</div></td>
    </tr>`;
  }).join("");

  body.querySelectorAll("[data-payment-signup]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const signupId = btn.getAttribute("data-payment-signup");
      const currentlyPaid = btn.getAttribute("data-paid") === "1";
      if (!signupId) return;

      const token = await uiPrompt("請輸入管理員觸發碼。管理員 LINE 帳號可留空直接操作。");
      if (token === null) return;
      if (!token) await ensureLiffIdentityReady(true);
      else await ensureLiffIdentityReady(false);
      if (!token && !state.lineIdToken) return uiAlert(`無法確認管理員身分。${buildLiffStatusText()}`);
      if (!(await uiConfirm(currentlyPaid ? "確定取消這筆已收費標記？" : "確定將這筆臨打標記為已收費？"))) return;

      btn.disabled = true;
      try {
        await callApi(withLineIdentity({
          action: "update_extra_payment",
          date,
          signupId,
          isPaid: currentlyPaid ? "0" : "1",
          token
        }));
        await loadPageData(date);
      } catch (error) {
        uiAlert(`收費狀態更新失敗：${error.message}`);
        btn.disabled = false;
      }
    });
  });

  if (canEditCurrentDate()) {
    body.querySelectorAll("[data-cancel-signup]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const signupId = btn.getAttribute("data-cancel-signup");
        if (!signupId) return;
        if (!(await uiConfirm("確定要取消這筆臨打報名嗎？"))) return;
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

function updateDashboardExtraMetrics(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const waitlist = document.getElementById("dashboardWaitlist");
  const paid = document.getElementById("dashboardPaid");
  if (waitlist) {
    waitlist.textContent = String(list.filter((row) => String(row.status || "") !== "已補上").length);
  }
  if (paid) {
    paid.textContent = String(list.filter((row) => row.isPaid === true || row.isPaid === "1").length);
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
      updateDashboardRosterMetrics([]);
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
    if (femaleRows.length) {
      html += `<tr class="group-row"><td colspan="3">女生名單</td></tr>`;
      html += femaleRows.map((r) => renderRow(r, "gender-female")).join("");
    }
    if (maleRows.length) {
      html += `<tr class="group-row"><td colspan="3">男生名單</td></tr>`;
      html += maleRows.map((r) => renderRow(r, "gender-male")).join("");
    }
    if (otherRows.length) {
      html += `<tr class="group-row"><td colspan="3">其他</td></tr>`;
      html += otherRows.map((r) => renderRow(r, "")).join("");
    }
    body.innerHTML = html;

    summary.textContent = `總人數：${rows.length} / 18，男生：${maleCount} 人，女生：${femaleCount} 人`;
    updateDashboardRosterMetrics(rows);
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
  const ids = [
    "extraType",
    "maleName",
    "femaleName",
    "pairMustTogether",
    "extraNote",
    "extraSubmitBtn",
    "hasAirConditioning",
    "saveVenueSettingsBtn"
  ];
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
  const target = new URL("date.html", APP_CONFIG.siteBaseUrl);
  target.searchParams.set("date", date);
  location.href = target.toString();
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
      const extras = getMockExtras(date).sort((a, b) => {
        const wa = mockExtraTypeWeight(a.type);
        const wb = mockExtraTypeWeight(b.type);
        if (wa !== wb) return wa - wb;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });
      for (const ex of extras) {
        if (fixed.length >= 18) break;
        if (ex.type === "MALE") fixed.push({ name: ex.maleName, gender: "男", source: "臨打報名" });
        if (ex.type === "FEMALE") fixed.push({ name: ex.femaleName, gender: "女", source: "臨打報名" });
        if (ex.type === "PAIR") {
          if (ex.pairMustTogether === "1") {
            if (fixed.length <= 16) {
              fixed.push({ name: ex.maleName, gender: "男", source: "臨打報名(綁定)" });
              fixed.push({ name: ex.femaleName, gender: "女", source: "臨打報名(綁定)" });
            }
          } else {
            fixed.push({ name: ex.femaleName, gender: "女", source: "臨打報名(綁定-女)" });
            if (fixed.length < 18) fixed.push({ name: ex.maleName, gender: "男", source: "臨打報名(綁定-男)" });
          }
        }
      }
    }

    return { ok: true, records: fixed.slice(0, 18) };
  }

  if (params.action === "extra_list") {
    return {
      ok: true,
      records: getMockExtras(date).sort((a, b) => {
        const wa = mockExtraTypeWeight(a.type);
        const wb = mockExtraTypeWeight(b.type);
        if (wa !== wb) return wa - wb;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      })
    };
  }

  if (params.action === "settlement_status") {
    return { ok: true, settlement: getMockSettlement(date) };
  }

  if (params.action === "update_date_settings") {
    const item = getMockSettlement(date);
    item.hasAirConditioning = String(params.hasAirConditioning || "") === "1";
    item.extraFee = item.hasAirConditioning ? 230 : 190;
    localStorage.setItem(mockKey("settle", date), JSON.stringify(item));
    return { ok: true, settlement: item };
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

  if (params.action === "update_extra_payment") {
    updateMockExtraPayment(String(params.signupId || ""), String(params.isPaid || "") === "1");
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

function mockExtraTypeWeight(type) {
  if (type === "FEMALE") return 1;
  if (type === "PAIR") return 2;
  if (type === "MALE") return 3;
  return 9;
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
    pairMustTogether: payload.pairMustTogether,
    isPaid: false,
    paidAt: ""
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

function updateMockExtraPayment(signupId, isPaid) {
  if (!signupId) return;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("mock:extras:"));
  keys.forEach((k) => {
    const rows = JSON.parse(localStorage.getItem(k) || "[]");
    rows.forEach((row) => {
      if (row.signupId !== signupId) return;
      row.isPaid = !!isPaid;
      row.paidAt = isPaid ? new Date().toISOString().slice(0, 19).replace("T", " ") : "";
    });
    localStorage.setItem(k, JSON.stringify(rows));
  });
}

function getMockSettlement(date) {
  const item = JSON.parse(localStorage.getItem(mockKey("settle", date)) || "{\"settled\":false,\"settleAt\":\"2026-05-25 20:30\",\"settledAt\":\"\",\"hasAirConditioning\":false,\"extraFee\":190}");
  item.hasAirConditioning = !!item.hasAirConditioning;
  item.extraFee = item.hasAirConditioning ? 230 : 190;
  return item;
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
  state.liffStatus.sdk = !!window.liff;
  state.liffStatus.configuredLiffId = String(APP_CONFIG.liffId || "").trim();
  if (!window.liff) {
    state.liffStatus.error = "LIFF SDK 未載入";
    renderLiffDebug();
    return;
  }
  if (!APP_CONFIG.liffId || APP_CONFIG.liffId.includes("YOUR_LIFF_ID")) {
    state.liffStatus.error = "LIFF ID 尚未設定";
    renderLiffDebug();
    return;
  }

  try {
    await withTimeout(window.liff.init({ liffId: APP_CONFIG.liffId }), 5000);
    state.liffStatus.initialized = true;
    state.liffStatus.runtimeLiffId = String(window.liff.id || "").trim();
    state.liffStatus.inClient = window.liff.isInClient();
    state.liffStatus.loggedIn = window.liff.isLoggedIn();
    collectLiffDiagnostics();
    if (!window.liff.isLoggedIn()) {
      window.liff.login({ redirectUri: location.href });
      renderLiffDebug();
      return;
    }

    state.lineIdToken = String(window.liff.getIDToken() || "").trim();
    state.liffStatus.idTokenReady = !!state.lineIdToken;

    const decoded = typeof window.liff.getDecodedIDToken === "function" ? window.liff.getDecodedIDToken() : null;
    if (decoded) {
      state.lineUserId = String(decoded.sub || "").trim();
      state.lineDisplayName = String(decoded.name || "").trim();
      state.liffStatus.profileReady = !!state.lineUserId && !!state.lineDisplayName;
    }

    if (!state.liffStatus.liffIdMatches) {
      state.liffStatus.errorCode = "LIFF_ID_MISMATCH";
      state.liffStatus.error = "LIFF ID 不一致，請確認 APP_CONFIG.liffId 與 LINE Developers 的 LIFF App ID";
    } else if (!state.liffStatus.accessTokenReady) {
      state.liffStatus.errorCode = "ACCESS_TOKEN_MISSING";
      state.liffStatus.error = "LIFF 已登入但未取得使用者 access token，請重新登入或重新開啟 LIFF URL";
    } else if (!state.liffStatus.profileScope) {
      state.liffStatus.errorCode = "MISSING_PROFILE_SCOPE";
      state.liffStatus.error = "getProfile 失敗：LIFF App Scope 缺少 profile，請到 LINE Developers 的 LIFF 設定勾選 profile";
    } else {
      try {
        const profile = await withTimeout(window.liff.getProfile(), 10000);
        state.lineUserId = String(profile.userId || state.lineUserId || "").trim();
        state.lineDisplayName = String(profile.displayName || state.lineDisplayName || "").trim();
        state.liffStatus.profileReady = !!state.lineUserId && !!state.lineDisplayName;
        console.log("LIFF profile:", {
          userId: profile.userId || "",
          displayName: profile.displayName || "",
          pictureUrl: profile.pictureUrl || "",
          statusMessage: profile.statusMessage || ""
        });
      } catch (profileError) {
        state.liffStatus.errorCode = String(profileError && profileError.code || "").trim();
        state.liffStatus.error = `getProfile 失敗：${profileError && profileError.message || profileError}`;
      }
    }
    applyCachedLineIdentity();
    saveLineIdentityCache();
  } catch (error) {
    state.liffStatus.errorCode = String(error && error.code || "").trim();
    state.liffStatus.error = error.message || String(error);
    console.warn("LIFF init failed:", error);
  } finally {
    renderLiffDebug();
  }
}

function collectLiffDiagnostics() {
  if (!window.liff) return;

  const context = typeof window.liff.getContext === "function" ? window.liff.getContext() : null;
  const scopes = Array.isArray(context && context.scope) ? context.scope.map(String) : [];
  const configuredLiffId = String(APP_CONFIG.liffId || "").trim();
  const runtimeLiffId = String(window.liff.id || "").trim();
  const contextLiffId = String(context && context.liffId || "").trim();

  state.liffStatus.configuredLiffId = configuredLiffId;
  state.liffStatus.runtimeLiffId = runtimeLiffId;
  state.liffStatus.contextLiffId = contextLiffId;
  state.liffStatus.liffIdMatches =
    !!configuredLiffId &&
    configuredLiffId === runtimeLiffId &&
    (!contextLiffId || configuredLiffId === contextLiffId);
  state.liffStatus.scopes = scopes;
  state.liffStatus.profileScope = scopes.indexOf("profile") >= 0;
  state.liffStatus.endpointUrl = String(context && context.endpointUrl || "").trim();
  state.liffStatus.accessTokenHash = String(context && context.accessTokenHash || "").trim();

  const accessToken = typeof window.liff.getAccessToken === "function" ? window.liff.getAccessToken() : null;
  state.liffStatus.accessTokenReady = !!accessToken;
}

function withLineIdentity(params) {
  return {
    ...params,
    lineUserId: state.lineUserId,
    lineDisplayName: state.lineDisplayName,
    lineIdToken: state.lineIdToken
  };
}

async function ensureLiffIdentityReady(required) {
  if (!liffReadyPromise && required) throw new Error("請從 LINE LIFF 入口開啟頁面後再操作");
  try {
    if (liffReadyPromise) await liffReadyPromise;
  } catch (error) {
    console.warn("LIFF identity not ready:", error);
  }

  if (!required || state.lineUserId) return;

  if (window.liff && typeof window.liff.isLoggedIn === "function" && !window.liff.isLoggedIn()) {
    if (typeof window.liff.login === "function") {
      window.liff.login({ redirectUri: location.href });
      throw new Error("正在導向 LINE 登入，請登入後再送出");
    }
  }

  throw new Error(`無法取得 LINE 身分，請從 LINE LIFF 入口開啟頁面後再操作。${buildLiffStatusText()}`);
}

function buildLiffStatusText() {
  const s = state.liffStatus || {};
  return `目前狀態：sdk=${!!s.sdk}, init=${!!s.initialized}, inClient=${!!s.inClient}, loggedIn=${!!s.loggedIn}, profile=${!!s.profileReady}, idToken=${!!s.idTokenReady}, accessToken=${!!s.accessTokenReady}, profileScope=${!!s.profileScope}${s.errorCode ? `, errorCode=${s.errorCode}` : ""}${s.error ? `, error=${s.error}` : ""}`;
}

function loadCachedLineIdentity() {
  try {
    const cached = JSON.parse(localStorage.getItem(LINE_IDENTITY_CACHE_KEY) || "{}");
    state.lineUserId = String(cached.userId || "").trim();
    state.lineDisplayName = String(cached.displayName || "").trim();
  } catch (error) {
    console.warn("LINE identity cache read failed:", error);
  }
}

function applyCachedLineIdentity() {
  if (!state.lineUserId || state.lineDisplayName) return;
  try {
    const cached = JSON.parse(localStorage.getItem(LINE_IDENTITY_CACHE_KEY) || "{}");
    if (String(cached.userId || "").trim() === state.lineUserId) {
      state.lineDisplayName = String(cached.displayName || "").trim();
    }
  } catch (error) {
    console.warn("LINE identity cache apply failed:", error);
  }
}

function saveLineIdentityCache() {
  if (!state.lineUserId) return;
  try {
    localStorage.setItem(LINE_IDENTITY_CACHE_KEY, JSON.stringify({
      userId: state.lineUserId,
      displayName: state.lineDisplayName || ""
    }));
  } catch (error) {
    console.warn("LINE identity cache write failed:", error);
  }
}

function renderLiffDebug() {
  if (!new URLSearchParams(location.search).has("debug")) return;
  let box = document.getElementById("liffDebugBox");
  if (!box) {
    box = document.createElement("pre");
    box.id = "liffDebugBox";
    box.className = "liff-debug-box";
    document.body.appendChild(box);
  }
  box.textContent = [
    "LIFF DEBUG",
    buildLiffStatusText(),
    `configuredLiffId=${state.liffStatus.configuredLiffId || "(empty)"}`,
    `runtimeLiffId=${state.liffStatus.runtimeLiffId || "(empty)"}`,
    `contextLiffId=${state.liffStatus.contextLiffId || "(empty)"}`,
    `liffIdMatches=${!!state.liffStatus.liffIdMatches}`,
    `scopes=${state.liffStatus.scopes.length ? state.liffStatus.scopes.join(",") : "(empty)"}`,
    `profileScope=${!!state.liffStatus.profileScope}`,
    `accessTokenReady=${!!state.liffStatus.accessTokenReady}`,
    `accessTokenHash=${state.liffStatus.accessTokenHash || "(empty)"}`,
    `endpointUrl=${state.liffStatus.endpointUrl || "(empty)"}`,
    `lineUserId=${state.lineUserId || "(empty)"}`,
    `lineDisplayName=${state.lineDisplayName || "(empty)"}`,
    `url=${location.href}`
  ].join("\n");
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("LIFF timeout")), ms))
  ]);
}

function getDateFromQuery() {
  return String(new URLSearchParams(location.search).get("date") || "").trim();
}

function showGlobalLoading(message) {
  const el = document.getElementById("globalLoading");
  if (!el) return;
  const text = el.querySelector("[data-loading-text]");
  if (text && message) text.textContent = message;
  el.hidden = false;
}

function applyLeaveState(leaveMemberIds) {
  const ids = Array.isArray(leaveMemberIds) ? leaveMemberIds : [];
  state.leaveMemberIds = new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
}

function hideGlobalLoading() {
  const el = document.getElementById("globalLoading");
  if (el) el.hidden = true;
}

function setDatePageLoading(isLoading) {
  if (!isDatePage()) return;
  document.body.classList.toggle("is-loading-data", !!isLoading);
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
      resolve(null);
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
