const SHEET_ID = '1HHUSk0IVPYUAymvkALV2sDZEhVK2pkk89zBfE38gkvo';
const DATES_SHEET = 'available_dates';
const MEMBERS_SHEET = 'fixed_members';
const LEAVE_SHEET = 'leave_records';
const EXTRA_SHEET = 'extra_signups';
const FINAL_SHEET = 'final_list';
const SETTLE_SHEET = 'settlement_control';
const SETTLEMENT_LOGS_SHEET = 'settlement_logs';
const PAYMENT_LOGS_SHEET = 'payment_logs';
const LINE_GROUPS_SHEET = 'line_groups';
const LINE_WEBHOOK_LOGS_SHEET = 'line_webhook_logs';

const TOTAL_LIMIT = 18;
const FEMALE_LIMIT = 9;
const LINE_SOURCE_CAPTURE_PROPERTY = 'ENABLE_LINE_SOURCE_CAPTURE';
const LINE_WEBHOOK_LOG_PROPERTY = 'ENABLE_LINE_WEBHOOK_LOG';

// 安全控制（Apps Script Script Properties）
const ALLOW_USER_EDIT_PROPERTY = 'ALLOW_USER_EDIT';
const ALLOW_EDIT_PAST_DATE_PROPERTY = 'ALLOW_EDIT_PAST_DATE';
const ENABLE_MANUAL_SETTLEMENT_TRIGGER_PROPERTY = 'ENABLE_MANUAL_SETTLEMENT_TRIGGER';
const SETTLEMENT_TRIGGER_TOKEN_PROPERTY = 'SETTLEMENT_TRIGGER_TOKEN';
const LINE_LOGIN_CHANNEL_ID_PROPERTY = 'LINE_LOGIN_CHANNEL_ID';
const LINE_LIFF_URL_PROPERTY = 'LINE_LIFF_URL';
const LINE_CHANNEL_ACCESS_TOKEN_PROPERTY = 'LINE_CHANNEL_ACCESS_TOKEN';
const LINE_DEFAULT_GROUP_ID_PROPERTY = 'LINE_DEFAULT_GROUP_ID';
const ADMIN_LINE_USER_IDS_PROPERTY = 'ADMIN_LINE_USER_IDS';

function doGet(e) {
  try {
    bootstrapSheets();
    const action = normalize(e.parameter.action);
    if (!action) return jsonOutput({ ok: false, message: 'missing action' });

    if (action === 'config') {
      return jsonOutput(getConfigResponse());
    }

    if (action === 'page_data') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      rebuildFinalListIfScheduledSettlementDue(date);
      return jsonOutput({
        ok: true,
        records: getFinalListByDate(date),
        extraRecords: getExtraSignupsWithStatus(date),
        settlement: getSettlementStatus(date),
        auditRecords: getAuditLogsByDate(date),
        leaveMemberIds: getLeaveMemberIdsByDate(date)
      });
    }

    if (action === 'final_list') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      rebuildFinalListIfScheduledSettlementDue(date);
      return jsonOutput({ ok: true, records: getFinalListByDate(date) });
    }

    if (action === 'leave') {
      assertEditableDate(normalize(e.parameter.date));
      saveLeave(e.parameter);
      rebuildFinalListForDate(normalize(e.parameter.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      assertEditableDate(normalize(e.parameter.date));
      saveExtraSignup(e.parameter);
      rebuildFinalListForDate(normalize(e.parameter.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'cancel_extra_signup') {
      assertEditableDate(normalize(e.parameter.date));
      cancelExtraSignup(normalize(e.parameter.signupId));
      const date = normalize(e.parameter.date);
      if (date) rebuildFinalListForDate(date);
      return jsonOutput({ ok: true });
    }

    if (action === 'update_extra_payment') {
      assertEditableDate(normalize(e.parameter.date));
      requireSettlementPermission(normalize(e.parameter.token), normalize(e.parameter.lineIdToken), normalize(e.parameter.lineUserId));
      updateExtraPayment(
        normalize(e.parameter.signupId),
        normalize(e.parameter.date),
        normalize(e.parameter.isPaid),
        getLineIdentityForRecord(e.parameter)
      );
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_list') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      return jsonOutput({ ok: true, records: getExtraSignupsWithStatus(date) });
    }

    if (action === 'audit_logs') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      return jsonOutput({ ok: true, records: getAuditLogsByDate(date) });
    }

    if (action === 'settlement_status') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    if (action === 'update_date_settings') {
      assertEditableDate(normalize(e.parameter.date));
      requireSettlementPermission(normalize(e.parameter.token), normalize(e.parameter.lineIdToken), normalize(e.parameter.lineUserId));
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      updateDateSettings(date, normalize(e.parameter.hasAirConditioning), getLineIdentityForRecord(e.parameter));
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    if (action === 'trigger_settlement') {
      assertEditableDate(normalize(e.parameter.date));
      requireSettlementPermission(normalize(e.parameter.token), normalize(e.parameter.lineIdToken), normalize(e.parameter.lineUserId));
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      triggerSettlement(date, 'manual_api_trigger', getLineIdentityForRecord(e.parameter));
      rebuildFinalListForDate(date);
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    if (action === 'push_final_list') {
      requireSettlementPermission(normalize(e.parameter.token), normalize(e.parameter.lineIdToken), normalize(e.parameter.lineUserId));
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      rebuildFinalListIfScheduledSettlementDue(date);
      pushFinalListFlexMessage(date, normalize(e.parameter.groupId));
      return jsonOutput({ ok: true });
    }

    return jsonOutput({ ok: false, message: 'unknown action' });
  } catch (err) {
    return jsonOutput({ ok: false, message: String(err) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    if (payload.events && !payload.action) {
      handleLineWebhook(payload);
      return jsonOutput({ ok: true });
    }

    bootstrapSheets();
    const action = normalize(payload.action);

    if (action === 'leave') {
      assertEditableDate(normalize(payload.date));
      saveLeave(payload);
      rebuildFinalListForDate(normalize(payload.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      assertEditableDate(normalize(payload.date));
      saveExtraSignup(payload);
      rebuildFinalListForDate(normalize(payload.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'cancel_extra_signup') {
      assertEditableDate(normalize(payload.date));
      cancelExtraSignup(normalize(payload.signupId));
      const date = normalize(payload.date);
      if (date) rebuildFinalListForDate(date);
      return jsonOutput({ ok: true });
    }

    if (action === 'update_extra_payment') {
      assertEditableDate(normalize(payload.date));
      requireSettlementPermission(normalize(payload.token), normalize(payload.lineIdToken), normalize(payload.lineUserId));
      updateExtraPayment(
        normalize(payload.signupId),
        normalize(payload.date),
        normalize(payload.isPaid),
        getLineIdentityForRecord(payload)
      );
      return jsonOutput({ ok: true });
    }

    if (action === 'trigger_settlement') {
      assertEditableDate(normalize(payload.date));
      requireSettlementPermission(normalize(payload.token), normalize(payload.lineIdToken), normalize(payload.lineUserId));
      const date = normalize(payload.date);
      validateDateIsAvailable(date);
      triggerSettlement(date, 'manual_post_trigger', getLineIdentityForRecord(payload));
      rebuildFinalListForDate(date);
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    if (action === 'update_date_settings') {
      assertEditableDate(normalize(payload.date));
      requireSettlementPermission(normalize(payload.token), normalize(payload.lineIdToken), normalize(payload.lineUserId));
      const date = normalize(payload.date);
      validateDateIsAvailable(date);
      updateDateSettings(date, normalize(payload.hasAirConditioning), getLineIdentityForRecord(payload));
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    if (action === 'push_final_list') {
      requireSettlementPermission(normalize(payload.token), normalize(payload.lineIdToken), normalize(payload.lineUserId));
      const date = normalize(payload.date);
      validateDateIsAvailable(date);
      rebuildFinalListIfScheduledSettlementDue(date);
      pushFinalListFlexMessage(date, normalize(payload.groupId));
      return jsonOutput({ ok: true });
    }

    return jsonOutput({ ok: false, message: 'unknown action' });
  } catch (err) {
    return jsonOutput({ ok: false, message: String(err) });
  }
}

function assertEditable() {
  if (!isUserEditAllowed()) throw new Error('editing is disabled by server policy');
}

function getConfigResponse() {
  return {
    ok: true,
    availableDates: getAvailableDates(),
    fixedMembers: getFixedMembers(),
    policy: {
      allowUserEdit: isUserEditAllowed(),
      allowEditPastDate: isEditPastDateAllowed(),
      enableManualSettlementTrigger: isManualSettlementEnabled(),
      today: todayDateStr()
    }
  };
}

function assertEditableDate(date) {
  assertEditable();
  if (!date) throw new Error('date required');
  if (!isEditPastDateAllowed() && isPastDate(date)) {
    throw new Error('date is closed for editing');
  }
}

function requireSettlementPermission(token, lineIdToken, fallbackLineUserId) {
  if (!isManualSettlementEnabled()) throw new Error('manual settlement trigger is disabled');
  var identity = verifyLineIdentityFromPayload({ lineIdToken: lineIdToken }, false);
  if (identity && isAdminLineUser(identity.userId)) return;
  if (!token && isAdminLineUser(fallbackLineUserId)) return;
  if (!token && identity && identity.userId) throw new Error('LINE user is not admin: ' + identity.userId);
  if (!token && lineIdToken && !identity) throw new Error('LINE identity token verification failed');
  if (!token || token !== getSettlementTriggerToken()) throw new Error('permission denied');
}

function isAdminLineUser(lineUserId) {
  var id = normalize(lineUserId);
  if (!id) return false;
  var adminIds = getAdminLineUserIds();
  for (var i = 0; i < adminIds.length; i += 1) {
    if (normalize(adminIds[i]) === id) return true;
  }
  return false;
}

function verifyLineIdentityFromPayload(payload, throwOnInvalid) {
  var idToken = normalize(payload.lineIdToken);
  if (!idToken) return { userId: '', displayName: '' };

  try {
    var response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'post',
      payload: {
        id_token: idToken,
        client_id: getLineLoginChannelId()
      },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      if (throwOnInvalid) throw new Error('invalid LINE identity token');
      return null;
    }

    var data = JSON.parse(response.getContentText() || '{}');
    return {
      userId: normalize(data.sub),
      displayName: normalize(data.name)
    };
  } catch (err) {
    if (throwOnInvalid) throw err;
    return null;
  }
}

function getLineIdentityForRecord(payload) {
  var verified = verifyLineIdentityFromPayload(payload, false);
  if (verified && verified.userId) {
    return {
      userId: verified.userId,
      displayName: verified.displayName || normalize(payload.lineDisplayName)
    };
  }
  return {
    userId: normalize(payload.lineUserId),
    displayName: normalize(payload.lineDisplayName)
  };
}

function saveLeave(payload) {
  const date = normalize(payload.date);
  const memberId = normalize(payload.memberId);
  const memberName = normalize(payload.memberName);
  const gender = normalize(payload.gender);
  const lineIdentity = getLineIdentityForRecord(payload);

  if (!date || !memberId || !memberName) throw new Error('invalid leave payload');
  validateDateIsAvailable(date);
  validateMemberExists(memberId);

  const sheet = getSheet(LEAVE_SHEET);
  const rows = sheet.getDataRange().getDisplayValues();
  const duplicate = rows.some(function (row, i) {
    return i > 0 && normalize(row[0]) === date && normalize(row[1]) === memberId;
  });
  if (duplicate) return;

  sheet.appendRow([date, memberId, memberName, gender, '請假', nowIso(), lineIdentity.userId, lineIdentity.displayName]);
}

function saveExtraSignup(payload) {
  const date = normalize(payload.date);
  const type = normalize(payload.extraType).toUpperCase();
  const maleName = normalize(payload.maleName);
  const femaleName = normalize(payload.femaleName);
  const note = normalize(payload.note);
  const pairMustTogether = normalize(payload.pairMustTogether).toLowerCase();
  const lineIdentity = getLineIdentityForRecord(payload);

  validateDateIsAvailable(date);

  const allowTypes = ['MALE', 'FEMALE', 'PAIR'];
  if (allowTypes.indexOf(type) < 0) throw new Error('invalid extra type');
  if (type === 'MALE' && !maleName) throw new Error('male name required');
  if (type === 'FEMALE' && !femaleName) throw new Error('female name required');
  if (type === 'PAIR' && (!maleName || !femaleName)) throw new Error('pair needs male and female names');

  const signupId = createSignupId();
  getSheet(EXTRA_SHEET).appendRow([
    signupId,
    date,
    type,
    maleName,
    femaleName,
    note,
    pairMustTogether === '1' || pairMustTogether === 'true' ? '1' : '0',
    '0',
    nowIso(),
    '',
    lineIdentity.userId,
    lineIdentity.displayName,
    '0',
    '',
    '',
    ''
  ]);
}

function cancelExtraSignup(signupId) {
  if (!signupId) throw new Error('signupId required');
  const sheet = getSheet(EXTRA_SHEET);
  const rows = sheet.getDataRange().getDisplayValues();

  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === signupId) {
      sheet.getRange(i + 1, 8).setValue('1');
      sheet.getRange(i + 1, 10).setValue(nowIso());
      return;
    }
  }
  throw new Error('signup not found');
}

function updateExtraPayment(signupId, date, isPaidValue, lineIdentity) {
  if (!signupId) throw new Error('signupId required');
  validateDateIsAvailable(date);

  var isPaid = isTruthyValue(isPaidValue);
  var identity = lineIdentity || { userId: '', displayName: '' };
  var sheet = getSheet(EXTRA_SHEET);
  var rows = sheet.getDataRange().getDisplayValues();
  var now = nowIso();

  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) !== signupId) continue;
    if (normalize(rows[i][1]) !== date) throw new Error('signup date mismatch');
    if (normalize(rows[i][7]) === '1') throw new Error('canceled signup cannot update payment');

    sheet.getRange(i + 1, 13).setValue(isPaid ? '1' : '0');
    sheet.getRange(i + 1, 14).setValue(isPaid ? now : '');
    sheet.getRange(i + 1, 15).setValue(isPaid ? normalize(identity.userId) : '');
    sheet.getRange(i + 1, 16).setValue(isPaid ? normalize(identity.displayName) : '');

    getSheet(PAYMENT_LOGS_SHEET).appendRow([
      date,
      signupId,
      isPaid ? '標記已收費' : '取消已收費',
      now,
      normalize(identity.userId),
      normalize(identity.displayName)
    ]);
    return;
  }

  throw new Error('signup not found');
}

function rebuildFinalListForDate(date) {
  validateDateIsAvailable(date);
  autoTriggerSettlementIfDue(date);

  const fixedMembers = getFixedMembers();
  const finalSheet = getSheet(FINAL_SHEET);
  const finalRows = finalSheet.getDataRange().getDisplayValues();
  const settled = getSettlementStatus(date).settled;

  const leaveSet = getLeaveSet(date);
  const baseList = [];
  for (var i = 0; i < fixedMembers.length; i += 1) {
    var member = fixedMembers[i];
    if (!leaveSet[normalize(member.memberId)]) baseList.push([date, member.name, member.gender, '固定名單', '']);
  }

  var rebuilt = baseList.slice();
  if (settled) {
    var extrasForDate = getExtraSignupsByDate(date);
    var settledExtras = getExistingSettledExtras(date, finalRows, extrasForDate);
    rebuilt = applyExistingExtrasWithinLimits(rebuilt, settledExtras);
    rebuilt = applyExtraFillLogic(date, rebuilt, extrasForDate, null);
  }

  var output = [getFinalListHeaders(finalRows)];
  for (var j = 1; j < finalRows.length; j += 1) {
    if (normalize(finalRows[j][0]) !== date) output.push(normalizeFinalRow(finalRows[j]));
  }
  output = output.concat(rebuilt);

  finalSheet.clearContents();
  finalSheet.getRange(1, 1, output.length, 5).setValues(output);
}

function rebuildFinalListIfScheduledSettlementDue(date) {
  if (autoTriggerSettlementIfDue(date)) rebuildFinalListForDate(date);
}

function applyExtraFillLogic(date, currentList, records, statusBySignupId) {
  const extraRecords = records || getExtraSignupsByDate(date);
  var females = countFemale(currentList);
  var total = currentList.length;
  var result = currentList.slice();
  var usedSignupIds = buildUsedSignupStateMap(result);

  for (var i = 0; i < extraRecords.length; i += 1) {
    if (total >= TOTAL_LIMIT) break;

    var r = extraRecords[i];
    var used = usedSignupIds[r.signupId] || { count: 0, male: false, female: false };

    if (r.type === 'MALE') {
      if (used.count > 0) continue;
      var maleAdded = false;
      if (total + 1 <= TOTAL_LIMIT) {
        result.push([date, r.maleName, '男', '臨打報名', r.signupId]);
        total += 1;
        maleAdded = true;
        usedSignupIds[r.signupId] = { count: 1, male: true, female: false };
      }
      if (statusBySignupId) statusBySignupId[r.signupId] = maleAdded ? '已補上' : '候補';
      continue;
    }

    if (r.type === 'FEMALE') {
      if (used.count > 0) continue;
      var femaleAdded = false;
      if (total + 1 <= TOTAL_LIMIT && females + 1 <= FEMALE_LIMIT) {
        result.push([date, r.femaleName, '女', '臨打報名', r.signupId]);
        total += 1;
        females += 1;
        femaleAdded = true;
        usedSignupIds[r.signupId] = { count: 1, male: false, female: true };
      }
      if (statusBySignupId) statusBySignupId[r.signupId] = femaleAdded ? '已補上' : '候補';
      continue;
    }

    if (r.type === 'PAIR') {
      var canMale = total + 1 <= TOTAL_LIMIT;
      var canFemale = total + 1 <= TOTAL_LIMIT && females + 1 <= FEMALE_LIMIT;
      var mustTogether = r.pairMustTogether === '1';
      var pairMaleAdded = false;
      var pairFemaleAdded = false;

      if (mustTogether) {
        if (used.count > 0) continue;
        if (total + 2 <= TOTAL_LIMIT && females + 1 <= FEMALE_LIMIT) {
          result.push([date, r.maleName, '男', '臨打報名(配對)', r.signupId]);
          result.push([date, r.femaleName, '女', '臨打報名(配對)', r.signupId]);
          total += 2;
          females += 1;
          pairMaleAdded = true;
          pairFemaleAdded = true;
          usedSignupIds[r.signupId] = { count: 2, male: true, female: true };
        }
      } else {
        if (!used.male && canMale) {
          result.push([date, r.maleName, '男', '臨打報名(配對-男)', r.signupId]);
          total += 1;
          pairMaleAdded = true;
        }
        if (!used.female && canFemale && total < TOTAL_LIMIT) {
          result.push([date, r.femaleName, '女', '臨打報名(配對-女)', r.signupId]);
          total += 1;
          females += 1;
          pairFemaleAdded = true;
        }
        if (pairMaleAdded || pairFemaleAdded) {
          usedSignupIds[r.signupId] = {
            count: used.count + (pairMaleAdded ? 1 : 0) + (pairFemaleAdded ? 1 : 0),
            male: used.male || pairMaleAdded,
            female: used.female || pairFemaleAdded
          };
        }
      }
      if (statusBySignupId) {
        if (pairMaleAdded && pairFemaleAdded) statusBySignupId[r.signupId] = '已補上';
        else if (pairMaleAdded || pairFemaleAdded) statusBySignupId[r.signupId] = '部分補上';
        else statusBySignupId[r.signupId] = '候補';
      }
    }
  }

  return result;
}

function getFinalListHeaders(finalRows) {
  var headers = finalRows[0] || [];
  return [
    normalize(headers[0]) || 'date',
    normalize(headers[1]) || 'name',
    normalize(headers[2]) || 'gender',
    normalize(headers[3]) || 'source',
    normalize(headers[4]) || 'signupId'
  ];
}

function normalizeFinalRow(row) {
  return [
    normalize(row[0]),
    normalize(row[1]),
    normalize(row[2]),
    normalize(row[3]),
    normalize(row[4])
  ];
}

function buildActiveSignupIdMap(records) {
  var out = {};
  for (var i = 0; i < records.length; i += 1) {
    out[records[i].signupId] = true;
  }
  return out;
}

function getExistingSettledExtras(date, finalRows, records) {
  var out = [];
  var activeSignupIds = buildActiveSignupIdMap(records);
  var usedSignupIds = {};

  for (var i = 1; i < finalRows.length; i += 1) {
    var row = normalizeFinalRow(finalRows[i]);
    var signupId = row[4];
    var gender = normalize(row[2]);
    if (row[0] !== date) continue;
    if (!signupId) signupId = findSignupIdForFinalRow(row, records, usedSignupIds);
    if (!signupId || !activeSignupIds[signupId]) continue;
    row[4] = signupId;
    if (!usedSignupIds[signupId]) usedSignupIds[signupId] = { male: false, female: false };
    if (gender === '男') usedSignupIds[signupId].male = true;
    if (gender === '女') usedSignupIds[signupId].female = true;
    out.push(row);
  }
  return out;
}

function findSignupIdForFinalRow(row, records, usedSignupIds) {
  var name = normalize(row[1]);
  var gender = normalize(row[2]);
  var source = normalize(row[3]);
  if (source.indexOf('臨打報名') !== 0) return '';

  for (var i = 0; i < records.length; i += 1) {
    var r = records[i];
    var used = usedSignupIds[r.signupId] || { male: false, female: false };
    if (gender === '男' && !used.male && normalize(r.maleName) === name) return r.signupId;
    if (gender === '女' && !used.female && normalize(r.femaleName) === name) return r.signupId;
  }

  return '';
}

function applyExistingExtrasWithinLimits(currentList, existingExtras) {
  var result = currentList.slice();
  var total = result.length;
  var females = countFemale(result);

  for (var i = 0; i < existingExtras.length; i += 1) {
    var row = existingExtras[i];
    var gender = normalize(row[2]);
    if (total >= TOTAL_LIMIT) break;
    if (gender === '女' && females + 1 > FEMALE_LIMIT) continue;
    result.push(row);
    total += 1;
    if (gender === '女') females += 1;
  }

  return result;
}

function buildUsedSignupStateMap(rows) {
  var out = {};
  for (var i = 0; i < rows.length; i += 1) {
    var signupId = normalize(rows[i][4]);
    var gender = normalize(rows[i][2]);
    if (!signupId) continue;
    if (!out[signupId]) out[signupId] = { count: 0, male: false, female: false };
    out[signupId].count += 1;
    if (gender === '男') out[signupId].male = true;
    if (gender === '女') out[signupId].female = true;
  }
  return out;
}

function getExtraStatusMapFromFinalList(date) {
  var rows = getSheet(FINAL_SHEET).getDataRange().getDisplayValues();
  var used = buildUsedSignupStateMap(rows.filter(function (row, index) {
    return index > 0 && normalize(row[0]) === date;
  }));
  var records = getExtraSignupsByDate(date);
  var out = {};

  for (var i = 0; i < records.length; i += 1) {
    var r = records[i];
    var state = used[r.signupId] || { count: 0 };
    if (state.count <= 0) out[r.signupId] = '候補';
    else if (r.type === 'PAIR' && state.count < 2) out[r.signupId] = '部分補上';
    else out[r.signupId] = '已補上';
  }

  return out;
}

function getExtraSignupsWithStatus(date) {
  var records = getExtraSignupsByDate(date);
  var statusMap = getExtraStatusMapFromFinalList(date);
  var settled = getSettlementStatus(date).settled;

  if (!settled) {
    for (var j = 0; j < records.length; j += 1) statusMap[records[j].signupId] = '候補';
  }

  return records.map(function (r) {
    return {
      signupId: r.signupId,
      date: r.date,
      type: r.type,
      maleName: r.maleName,
      femaleName: r.femaleName,
      note: r.note,
      pairMustTogether: r.pairMustTogether,
      createdAt: r.createdAt,
      isPaid: r.isPaid,
      paidAt: r.paidAt,
      paidByLineUserId: r.paidByLineUserId,
      paidByDisplayName: r.paidByDisplayName,
      status: statusMap[r.signupId] || '候補'
    };
  });
}

function getAuditLogsByDate(date) {
  var logs = [];
  var leaveRows = getSheet(LEAVE_SHEET).getDataRange().getDisplayValues();
  var extraRows = getSheet(EXTRA_SHEET).getDataRange().getDisplayValues();
  var settlementRows = getSheet(SETTLEMENT_LOGS_SHEET).getDataRange().getDisplayValues();
  var paymentRows = getSheet(PAYMENT_LOGS_SHEET).getDataRange().getDisplayValues();

  for (var i = 1; i < leaveRows.length; i += 1) {
    if (normalize(leaveRows[i][0]) !== date) continue;
    logs.push({
      time: normalize(leaveRows[i][5]),
      kind: '固定名單請假',
      action: '新增',
      detail: normalize(leaveRows[i][2]) + ' / ' + normalize(leaveRows[i][3])
    });
  }

  for (var j = 1; j < extraRows.length; j += 1) {
    if (normalize(extraRows[j][1]) !== date) continue;
    logs.push({
      time: normalize(extraRows[j][8]),
      kind: '臨打報名',
      action: '新增',
      detail: buildExtraDetail(normalize(extraRows[j][2]), normalize(extraRows[j][3]), normalize(extraRows[j][4]))
    });
    if (normalize(extraRows[j][7]) === '1') {
      logs.push({
        time: normalize(extraRows[j][9]),
        kind: '臨打報名',
        action: '取消',
        detail: buildExtraDetail(normalize(extraRows[j][2]), normalize(extraRows[j][3]), normalize(extraRows[j][4]))
      });
    }
  }

  for (var k = 1; k < settlementRows.length; k += 1) {
    if (normalize(settlementRows[k][0]) !== date) continue;
    logs.push({
      time: normalize(settlementRows[k][3]),
      kind: '結算操作',
      action: normalize(settlementRows[k][1]) || '觸發',
      detail: buildSettlementAuditDetail(normalize(settlementRows[k][2]), normalize(settlementRows[k][4]), normalize(settlementRows[k][5]))
    });
  }

  for (var p = 1; p < paymentRows.length; p += 1) {
    if (normalize(paymentRows[p][0]) !== date) continue;
    logs.push({
      time: normalize(paymentRows[p][3]),
      kind: '臨打收費',
      action: normalize(paymentRows[p][2]),
      detail: normalize(paymentRows[p][1]) + ' / 操作者：' + (normalize(paymentRows[p][5]) || normalize(paymentRows[p][4]) || '管理員')
    });
  }

  logs.sort(function (a, b) {
    if (a.time === b.time) return 0;
    return a.time > b.time ? -1 : 1;
  });
  return logs;
}

function handleLineWebhook(payload) {
  var events = payload.events || [];
  for (var i = 0; i < events.length; i += 1) {
    try {
      var event = events[i];
      var source = event.source || {};
      if (isScriptPropertyEnabled(LINE_SOURCE_CAPTURE_PROPERTY)) saveLineSource(source);

      var text = normalize(event.message && event.message.text);
      appendLineWebhookLog(source, text, 'received', '');
      if (!event.replyToken || !text) continue;
      if (!isBotMentioned(event.message)) {
        appendLineWebhookLog(source, text, 'ignored_no_bot_mention', '');
        continue;
      }

      var commandText = getBotCommandText(event.message);
      var command = parseBotCommand(commandText);
      if (!command.type) {
        appendLineWebhookLog(source, text, 'ignored_unknown_command', commandText);
        continue;
      }

      if (command.type === 'open_signup') {
        upsertAvailableDateFromBot(command.date);
        replyLineMessage(event.replyToken, [buildOpenSignupReplyMessage(command.date)]);
        appendLineWebhookLog(source, text, 'reply_open_signup', command.date);
        continue;
      }

      if (command.type === 'final_list') {
        var date = command.date || getDefaultPushDate();
        validateDateIsAvailable(date);
        rebuildFinalListIfScheduledSettlementDue(date);
        replyLineMessage(event.replyToken, [buildFinalListWithWaitlistFlexMessage(date)]);
        appendLineWebhookLog(source, text, 'reply_final_list', date);
        continue;
      }

      if (command.type === 'liff_entry') {
        replyLineMessage(event.replyToken, [buildLiffEntryFlexMessage()]);
        appendLineWebhookLog(source, text, 'reply_liff_entry', '');
      } else {
        appendLineWebhookLog(source, text, 'ignored', '');
      }
    } catch (err) {
      appendLineWebhookLog((events[i] && events[i].source) || {}, normalize(events[i] && events[i].message && events[i].message.text), 'error', String(err));
      throw err;
    }
  }
}

function isLiffEntryCommand(text) {
  return parseBotCommand(text).type === 'liff_entry';
}

function isOpenSignupCommand(text) {
  return parseBotCommand(text).type === 'open_signup';
}

function isGroupLikeSource(source) {
  var type = normalize(source && source.type);
  return type === 'group' || type === 'room';
}

function isBotMentioned(message) {
  var mentionees = message && message.mention && message.mention.mentionees;
  if (!mentionees || !mentionees.length) return false;
  for (var i = 0; i < mentionees.length; i += 1) {
    if (mentionees[i] && mentionees[i].isSelf === true) return true;
  }
  return false;
}

function isFinalListCommand(text) {
  return parseBotCommand(text).type === 'final_list';
}

function extractDateFromText(text) {
  var parsed = parseDateToken(normalize(text).replace(/\s+/g, ''));
  if (parsed) return parsed;
  return '';
}

function getBotCommandText(message) {
  var text = normalize(message && message.text);
  var mentionees = message && message.mention && message.mention.mentionees;
  if (!mentionees || !mentionees.length) return text;

  var ranges = [];
  for (var i = 0; i < mentionees.length; i += 1) {
    var mentionee = mentionees[i];
    if (!mentionee || mentionee.isSelf !== true) continue;
    var index = Number(mentionee.index);
    var length = Number(mentionee.length);
    if (!isNaN(index) && !isNaN(length) && length > 0) ranges.push({ index: index, length: length });
  }

  ranges.sort(function (a, b) {
    return b.index - a.index;
  });
  for (var j = 0; j < ranges.length; j += 1) {
    text = text.substring(0, ranges[j].index) + text.substring(ranges[j].index + ranges[j].length);
  }

  return normalize(text.replace(/^@\S+\s*/, ''));
}

function parseBotCommand(text) {
  var command = normalize(text).replace(/\s+/g, '');
  if (!command) return { type: '', date: '' };

  var openMatch = command.match(/^(.+?)(開始報名|開放報名)$/);
  if (openMatch) {
    var openDate = parseDateToken(openMatch[1]);
    return openDate ? { type: 'open_signup', date: openDate } : { type: '', date: '' };
  }

  if (/^(名單|結算名單|結算)$/.test(command)) return { type: 'final_list', date: '' };

  var finalMatch = command.match(/^(.+?)(?:結算)?名單$/);
  if (finalMatch) {
    var finalDate = parseDateToken(finalMatch[1]);
    return finalDate ? { type: 'final_list', date: finalDate } : { type: '', date: '' };
  }

  if (/^(報名|連義華|liff)$/i.test(command)) return { type: 'liff_entry', date: '' };

  return { type: '', date: '' };
}

function parseDateToken(token) {
  var value = normalize(token).replace(/\s+/g, '');
  var isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return normalizeDateParts(isoMatch[1], isoMatch[2], isoMatch[3]);

  var slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) return normalizeDateParts(todayDateStr().split('-')[0], slashMatch[1], slashMatch[2]);

  var monthMatch = value.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (monthMatch) return normalizeDateParts(todayDateStr().split('-')[0], monthMatch[1], monthMatch[2]);

  return '';
}

function getDefaultPushDate() {
  var dates = getAvailableDates();
  var today = todayDateStr();
  for (var i = 0; i < dates.length; i += 1) {
    if (dates[i].date >= today) return dates[i].date;
  }
  return dates.length ? dates[dates.length - 1].date : '';
}

function saveLineSource(source) {
  var sourceType = normalize(source.type);
  var sourceId = normalize(source.groupId || source.roomId || source.userId);
  var userId = normalize(source.userId);
  if (!sourceType || !sourceId) return;

  var sheet = getSheet(LINE_GROUPS_SHEET);
  var rows = sheet.getDataRange().getDisplayValues();
  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === sourceType && normalize(rows[i][1]) === sourceId) {
      var existingDisplayName = normalize(rows[i][5]);
      var displayName = existingDisplayName;
      if (!displayName || normalize(rows[i][2]) !== userId) {
        var existingProfile = getLineSourceUserProfile(source);
        displayName = normalize(existingProfile && existingProfile.displayName);
      }
      sheet.getRange(i + 1, 3).setValue(userId);
      sheet.getRange(i + 1, 4).setValue(nowIso());
      sheet.getRange(i + 1, 6).setValue(displayName);
      return;
    }
  }
  var profile = getLineSourceUserProfile(source);
  var displayName = normalize(profile && profile.displayName);
  sheet.appendRow([sourceType, sourceId, userId, nowIso(), '', displayName]);
}

function getLineSourceUserProfile(source) {
  var sourceType = normalize(source && source.type);
  var userId = normalize(source && source.userId);
  if (!sourceType || !userId) return null;

  var url = '';
  if (sourceType === 'group') {
    var groupId = normalize(source.groupId);
    if (!groupId) return null;
    url = 'https://api.line.me/v2/bot/group/' + encodeURIComponent(groupId) + '/member/' + encodeURIComponent(userId);
  } else if (sourceType === 'room') {
    var roomId = normalize(source.roomId);
    if (!roomId) return null;
    url = 'https://api.line.me/v2/bot/room/' + encodeURIComponent(roomId) + '/member/' + encodeURIComponent(userId);
  } else if (sourceType === 'user') {
    url = 'https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId);
  } else {
    return null;
  }

  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + getLineChannelAccessToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return null;
    return JSON.parse(response.getContentText() || '{}');
  } catch (err) {
    appendLineWebhookLog(source, '', 'profile_lookup_failed', String(err));
    return null;
  }
}

function appendLineWebhookLog(source, text, action, detail) {
  if (!isScriptPropertyEnabled(LINE_WEBHOOK_LOG_PROPERTY)) return;
  var sheet = getSheet(LINE_WEBHOOK_LOGS_SHEET);
  sheet.appendRow([
    nowIso(),
    normalize(source && source.type),
    normalize(source && (source.groupId || source.roomId || source.userId)),
    normalize(source && source.userId),
    normalize(text),
    normalize(action),
    normalize(detail)
  ]);
}

function buildLiffEntryFlexMessage() {
  return {
    type: 'flex',
    altText: 'Monday Spike 報名入口',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: 'Monday Spike', weight: 'bold', size: 'xl', color: '#26342F' },
          { type: 'text', text: '點擊下方按鈕進入本週報名頁。', wrap: true, size: 'sm', color: '#6F7D78' },
          {
            type: 'button',
            style: 'primary',
            color: '#7AA68F',
            action: { type: 'uri', label: '開啟報名', uri: getLineLiffUrl() }
          }
        ]
      }
    }
  };
}

function pushFinalListFlexMessage(date, groupId) {
  var to = groupId || getDefaultLineGroupId();
  if (!to) throw new Error('LINE groupId required. Set groupId parameter or Script Property LINE_DEFAULT_GROUP_ID.');
  pushLineMessage(to, [buildFinalListFlexMessage(date)]);
}

function buildFinalListFlexMessage(date) {
  var records = getFinalListByDate(date);
  var settlement = getSettlementStatus(date);
  var male = [];
  var female = [];
  for (var i = 0; i < records.length; i += 1) {
    if (records[i].gender === '女') female.push(records[i]);
    else if (records[i].gender === '男') male.push(records[i]);
  }

  var contents = [
    { type: 'text', text: date + ' 最終名單', weight: 'bold', size: 'xl', color: '#26342F' },
    { type: 'text', text: '總人數 ' + records.length + ' / ' + TOTAL_LIMIT + '，女生 ' + female.length + ' / ' + '人' + '，男生 ' + male.length + ' / ' + '人', size: 'sm' , color: '#6F7D78', margin: 'sm' },
    {
      type: 'text',
      text: '臨打費用：每人 ' + settlement.extraFee + ' 元' + (settlement.hasAirConditioning ? '（含冷氣）' : '（未開冷氣）'),
      weight: 'bold',
      size: 'sm',
      color: '#A66A3F',
      margin: 'sm'
    }
  ];
  contents = contents.concat(buildFinalListSection('女生', female, '#D986A4'));
  contents = contents.concat(buildFinalListSection('男生', male, '#6C9DB5'));
  contents.push({
    type: 'button',
    style: 'link',
    action: { type: 'uri', label: '查看報名頁', uri: getLineLiffUrl() }
  });

  return {
    type: 'flex',
    altText: date + ' 最終名單',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: contents
      }
    }
  };
}

function buildFinalListWithWaitlistFlexMessage(date) {
  var message = buildFinalListFlexMessage(date);
  var waitlist = getExtraSignupsWithStatus(date).filter(function (row) {
    return normalize(row.status) !== '已補上';
  });
  var body = message.contents && message.contents.body && message.contents.body.contents;
  if (body) {
    body.push({ type: 'separator', margin: 'md' });
    body.push({ type: 'text', text: '候補中 ' + waitlist.length + ' 組', weight: 'bold', size: 'md', color: '#A77B42', margin: 'md' });
    body.push({
      type: 'text',
      text: buildWaitlistText(waitlist),
      wrap: true,
      size: 'sm',
      color: '#26342F'
    });
  }
  message.altText = date + ' 最終名單與候補';
  return message;
}

function buildWaitlistText(rows) {
  if (!rows.length) return '目前沒有候補';
  return rows.map(function (row, index) {
    return (index + 1) + '. ' + buildExtraDetail(row.type, row.maleName, row.femaleName) + ' / ' + (row.status || '候補');
  }).join('\n');
}

function buildOpenSignupReplyMessage(date) {
  var settlement = getSettlementStatus(date);
  return {
    type: 'flex',
    altText: date + ' 已開放報名',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '已開放報名', weight: 'bold', size: 'xl', color: '#26342F' },
          { type: 'text', text: date + ' 已加入可選日期，固定名單也已建立。', wrap: true, size: 'sm', color: '#6F7D78' },
          {
            type: 'text',
            text: '臨打費用：每人 ' + settlement.extraFee + ' 元' + (settlement.hasAirConditioning ? '（含冷氣）' : '（未開冷氣）'),
            weight: 'bold',
            size: 'sm',
            color: '#A66A3F'
          },
          {
            type: 'button',
            style: 'primary',
            color: '#7AA68F',
            action: { type: 'uri', label: '開啟報名頁', uri: getLineLiffUrl() }
          }
        ]
      }
    }
  };
}

function buildFinalListSection(title, rows, color) {
  var out = [
    { type: 'separator', margin: 'md' },
    { type: 'text', text: title + ' ' + rows.length + ' 人', weight: 'bold', size: 'md', color: color, margin: 'md' }
  ];
  if (!rows.length) {
    out.push({ type: 'text', text: '無', size: 'sm', color: '#9AA7A1' });
    return out;
  }

  var names = [];
  for (var i = 0; i < rows.length; i += 1) {
    names.push((i + 1) + '. ' + formatFinalListName(rows[i]));
  }
  out.push({ type: 'text', text: names.join('\n'), wrap: true, size: 'sm', color: '#26342F' });
  return out;
}

function formatFinalListName(row) {
  var source = normalize(row && row.source);
  var suffix = source.indexOf('臨打報名') === 0 ? '（補上）' : '';
  return normalize(row && row.name) + suffix;
}

function replyLineMessage(replyToken, messages) {
  callLineMessagingApi('https://api.line.me/v2/bot/message/reply', {
    replyToken: replyToken,
    messages: messages
  });
}

function pushLineMessage(to, messages) {
  callLineMessagingApi('https://api.line.me/v2/bot/message/push', {
    to: to,
    messages: messages
  });
}

function callLineMessagingApi(url, payload) {
  var token = getLineChannelAccessToken();
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    appendLineWebhookLog({}, '', 'line_api_failed', response.getResponseCode() + ' ' + response.getContentText());
    throw new Error('LINE Messaging API failed: ' + response.getResponseCode() + ' ' + response.getContentText());
  }
}

function getLineChannelAccessToken() {
  var token = normalize(PropertiesService.getScriptProperties().getProperty(LINE_CHANNEL_ACCESS_TOKEN_PROPERTY));
  if (!token) throw new Error('Script Property LINE_CHANNEL_ACCESS_TOKEN is required');
  return token;
}

function getDefaultLineGroupId() {
  return normalize(PropertiesService.getScriptProperties().getProperty(LINE_DEFAULT_GROUP_ID_PROPERTY));
}

function isScriptPropertyEnabled(name) {
  return getBooleanScriptProperty(name, false);
}

function getScriptProperty(name) {
  return normalize(PropertiesService.getScriptProperties().getProperty(name));
}

function getRequiredScriptProperty(name) {
  var value = getScriptProperty(name);
  if (!value) throw new Error('Script Property ' + name + ' is required');
  return value;
}

function getBooleanScriptProperty(name, defaultValue) {
  var value = getScriptProperty(name).toLowerCase();
  if (!value) return !!defaultValue;
  if (['1', 'true', 'yes', 'y', 'on'].indexOf(value) >= 0) return true;
  if (['0', 'false', 'no', 'n', 'off'].indexOf(value) >= 0) return false;
  return !!defaultValue;
}

function isTruthyValue(value) {
  return ['1', 'true', 'yes', 'y', 'on'].indexOf(normalize(value).toLowerCase()) >= 0;
}

function isUserEditAllowed() {
  return getBooleanScriptProperty(ALLOW_USER_EDIT_PROPERTY, true);
}

function isEditPastDateAllowed() {
  return getBooleanScriptProperty(ALLOW_EDIT_PAST_DATE_PROPERTY, false);
}

function isManualSettlementEnabled() {
  return getBooleanScriptProperty(ENABLE_MANUAL_SETTLEMENT_TRIGGER_PROPERTY, true);
}

function getSettlementTriggerToken() {
  return getScriptProperty(SETTLEMENT_TRIGGER_TOKEN_PROPERTY);
}

function getLineLoginChannelId() {
  return getRequiredScriptProperty(LINE_LOGIN_CHANNEL_ID_PROPERTY);
}

function getLineLiffUrl() {
  return getRequiredScriptProperty(LINE_LIFF_URL_PROPERTY);
}

function getAdminLineUserIds() {
  var value = getScriptProperty(ADMIN_LINE_USER_IDS_PROPERTY);
  if (!value) return [];
  return value.split(/[\s,，]+/).map(function (id) {
    return normalize(id);
  }).filter(Boolean);
}

function buildExtraDetail(type, maleName, femaleName) {
  if (type === 'MALE') return '男 / ' + maleName;
  if (type === 'FEMALE') return '女 / ' + femaleName;
  return '一男一女 / ' + maleName + ' + ' + femaleName;
}

function buildSettlementAuditDetail(note, lineUserId, lineDisplayName) {
  var actor = lineDisplayName || lineUserId || '系統';
  return (note || 'trigger_settlement') + ' / 操作者：' + actor;
}

function getLeaveSet(date) {
  const rows = getSheet(LEAVE_SHEET).getDataRange().getDisplayValues();
  const out = {};
  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === date) out[normalize(rows[i][1])] = true;
  }
  return out;
}

function getLeaveMemberIdsByDate(date) {
  var leaveSet = getLeaveSet(date);
  var out = [];
  for (var memberId in leaveSet) {
    if (leaveSet.hasOwnProperty(memberId)) out.push(memberId);
  }
  return out;
}

function getExtraSignupsByDate(date) {
  const rows = getSheet(EXTRA_SHEET).getDataRange().getDisplayValues();
  const list = [];

  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][1]) !== date) continue;
    if (normalize(rows[i][7]) === '1') continue;
    list.push({
      signupId: normalize(rows[i][0]),
      date: normalize(rows[i][1]),
      type: normalize(rows[i][2]).toUpperCase(),
      maleName: normalize(rows[i][3]),
      femaleName: normalize(rows[i][4]),
      note: normalize(rows[i][5]),
      pairMustTogether: normalize(rows[i][6]),
      createdAt: normalize(rows[i][8]),
      isPaid: normalize(rows[i][12]) === '1',
      paidAt: normalize(rows[i][13]),
      paidByLineUserId: normalize(rows[i][14]),
      paidByDisplayName: normalize(rows[i][15])
    });
  }

  list.sort(function (a, b) {
    var wa = extraTypeWeight(a.type);
    var wb = extraTypeWeight(b.type);
    if (wa !== wb) return wa - wb;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
  return list;
}

function extraTypeWeight(type) {
  if (type === 'FEMALE') return 1;
  if (type === 'PAIR') return 2;
  if (type === 'MALE') return 3;
  return 9;
}

function getFinalListByDate(date) {
  const rows = getSheet(FINAL_SHEET).getDataRange().getDisplayValues();
  const result = [];
  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) !== date) continue;
    result.push({
      date: normalize(rows[i][0]),
      name: normalize(rows[i][1]),
      gender: normalize(rows[i][2]),
      source: normalize(rows[i][3]),
      signupId: normalize(rows[i][4])
    });
  }
  return result;
}

function countFemale(rows) {
  var c = 0;
  for (var i = 0; i < rows.length; i += 1) if (normalize(rows[i][2]) === '女') c += 1;
  return c;
}

function getSettlementStatus(date) {
  var rowInfo = getSettlementRow(date, true);
  var row = rowInfo.row;
  var hasAirConditioning = normalize(row[5]) === '1';
  return {
    date: date,
    settleAt: normalize(row[1]),
    settled: normalize(row[2]) === '1',
    settledAt: normalize(row[3]),
    triggerNote: normalize(row[4]),
    hasAirConditioning: hasAirConditioning,
    extraFee: hasAirConditioning ? 230 : 190
  };
}

function ensureSettlementRow(date) {
  if (!getSettlementRow(date, false)) getSheet(SETTLE_SHEET).appendRow([date, '', '0', '', '', '0']);
}

function updateDateSettings(date, hasAirConditioningValue, lineIdentity) {
  var enabled = isTruthyValue(hasAirConditioningValue);
  var identity = lineIdentity || { userId: '', displayName: '' };
  var info = getSettlementRow(date, true);
  var now = nowIso();

  info.sheet.getRange(info.index, 6).setValue(enabled ? '1' : '0');
  getSheet(SETTLEMENT_LOGS_SHEET).appendRow([
    date,
    '場地設定',
    enabled ? '開冷氣 / 臨打費用每人 230 元' : '不開冷氣 / 臨打費用每人 190 元',
    now,
    normalize(identity.userId),
    normalize(identity.displayName)
  ]);
}

function upsertAvailableDateFromBot(date) {
  if (!isIsoDate(date)) throw new Error('invalid date: ' + date);
  var sheet = getSheet(DATES_SHEET);
  var rows = sheet.getDataRange().getDisplayValues();
  var label = buildDateLabel(date);

  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === date) {
      sheet.getRange(i + 1, 2).setValue(normalize(rows[i][1]) || label);
      sheet.getRange(i + 1, 3).setValue('1');
      ensureSettlementRow(date);
      rebuildFinalListForDate(date);
      return;
    }
  }

  sheet.appendRow([date, label, '1']);
  ensureSettlementRow(date);
  rebuildFinalListForDate(date);
}

function buildDateLabel(date) {
  var parts = normalize(date).split('-');
  if (parts.length !== 3) return date;
  return Number(parts[1]) + '/' + Number(parts[2]);
}

function triggerSettlement(date, note, lineIdentity) {
  var identity = lineIdentity || { userId: '', displayName: '' };
  var now = nowIso();
  var info = getSettlementRow(date, true);
  info.sheet.getRange(info.index, 3).setValue('1');
  info.sheet.getRange(info.index, 4).setValue(now);
  info.sheet.getRange(info.index, 5).setValue(note || 'manual_trigger');
  getSheet(SETTLEMENT_LOGS_SHEET).appendRow([
    date,
    '觸發結算',
    note || 'manual_trigger',
    now,
    normalize(identity.userId),
    normalize(identity.displayName)
  ]);
}

function autoTriggerSettlementIfDue(date) {
  var info = getSettlementRow(date, true);
  var row = info.row;
  if (normalize(row[2]) === '1') return false;
  var settleAt = normalize(row[1]);
  if (!settleAt) return false;
  if (nowIsoMinute() >= settleAt) {
    triggerSettlement(date, 'auto_schedule_trigger', { userId: '', displayName: '系統排程' });
    return true;
  }
  return false;
}

function getSettlementRow(date, createIfMissing) {
  var sheet = getSheet(SETTLE_SHEET);
  var rows = sheet.getDataRange().getDisplayValues();
  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === date) return { sheet: sheet, index: i + 1, row: rows[i] };
  }
  if (!createIfMissing) return null;
  sheet.appendRow([date, '', '0', '', '', '0']);
  var idx = sheet.getLastRow();
  return { sheet: sheet, index: idx, row: sheet.getRange(idx, 1, 1, 6).getDisplayValues()[0] };
}

function getAvailableDates() {
  var rows = getSheet(DATES_SHEET).getDataRange().getDisplayValues();
  var result = [];
  for (var i = 1; i < rows.length; i += 1) {
    var date = normalize(rows[i][0]);
    var label = normalize(rows[i][1]);
    var enabled = normalize(rows[i][2]).toLowerCase();
    if (!isIsoDate(date)) continue;
    if (enabled && ['1', 'true', 'yes', 'y'].indexOf(enabled) < 0) continue;
    result.push({ date: date, label: label || date });
    ensureSettlementRow(date);
  }
  return result;
}

function getFixedMembers() {
  var rows = getSheet(MEMBERS_SHEET).getDataRange().getDisplayValues();
  var result = [];
  for (var i = 1; i < rows.length; i += 1) {
    var memberId = normalize(rows[i][0]);
    var name = normalize(rows[i][1]);
    var gender = normalize(rows[i][2]);
    var enabled = normalize(rows[i][3]).toLowerCase();
    if (!memberId || !name) continue;
    if (enabled && ['1', 'true', 'yes', 'y'].indexOf(enabled) < 0) continue;
    result.push({ memberId: memberId, name: name, gender: gender || '未填' });
  }
  return result;
}

function validateDateIsAvailable(date) {
  if (!date) throw new Error('date required');
  var dates = getAvailableDates();
  for (var i = 0; i < dates.length; i += 1) if (dates[i].date === date) return;
  throw new Error('date is not available: ' + date);
}

function validateMemberExists(memberId) {
  var members = getFixedMembers();
  for (var i = 0; i < members.length; i += 1) if (normalize(members[i].memberId) === memberId) return;
  throw new Error('member not found in fixed_members: ' + memberId);
}

function bootstrapSheets() {
  ensureSheet(DATES_SHEET, ['date', 'label', 'enabled'], [[todayPlus(0), '本週一', '1'], [todayPlus(7), '下週一', '1']]);
  ensureSheet(MEMBERS_SHEET, ['memberId', 'memberName', 'gender', 'enabled'], [['M001', '王小明', '男', '1'], ['M002', '林小美', '女', '1']]);
  ensureSheet(LEAVE_SHEET, ['date', 'memberId', 'memberName', 'gender', 'status', 'createdAt', 'lineUserId', 'lineDisplayName']);
  ensureSheet(EXTRA_SHEET, [
    'signupId',
    'date',
    'type',
    'maleName',
    'femaleName',
    'note',
    'pairMustTogether',
    'isCanceled',
    'createdAt',
    'canceledAt',
    'lineUserId',
    'lineDisplayName',
    'isPaid',
    'paidAt',
    'paidByLineUserId',
    'paidByDisplayName'
  ]);
  ensureSheet(FINAL_SHEET, ['date', 'name', 'gender', 'source', 'signupId']);
  ensureSheet(SETTLE_SHEET, ['date', 'settleAt(YYYY-MM-DD HH:mm)', 'settled(0/1)', 'settledAt', 'triggerNote', 'hasAirConditioning(0/1)']);
  ensureSheet(SETTLEMENT_LOGS_SHEET, ['date', 'action', 'note', 'createdAt', 'lineUserId', 'lineDisplayName']);
  ensureSheet(PAYMENT_LOGS_SHEET, ['date', 'signupId', 'action', 'createdAt', 'lineUserId', 'lineDisplayName']);
  ensureSheet(LINE_GROUPS_SHEET, ['sourceType', 'sourceId', 'lastUserId', 'lastSeenAt', 'note', 'lastUserDisplayName']);
  ensureSheet(LINE_WEBHOOK_LOGS_SHEET, ['createdAt', 'sourceType', 'sourceId', 'userId', 'text', 'action', 'detail']);
}

function ensureSheet(name, headers, seedRows) {
  var sheet = getSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    if (seedRows && seedRows.length) sheet.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
    return;
  }

  var current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  var mismatch = false;
  for (var i = 0; i < headers.length; i += 1) if (normalize(current[i]) !== normalize(headers[i])) mismatch = true;
  if (mismatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getSheet(name) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function createSignupId() {
  return 'EX-' + Utilities.getUuid().split('-')[0].toUpperCase() + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Taipei', 'HHmmss');
}

function todayPlus(days) {
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var date = new Date();
  date.setDate(date.getDate() + days);
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function nowIso() {
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
}

function nowIsoMinute() {
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
}

function todayDateStr() {
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function normalizeDateParts(year, month, day) {
  var y = Number(year);
  var m = Number(month);
  var d = Number(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return '';
  var date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function isPastDate(date) {
  return normalize(date) < todayDateStr();
}

function normalize(value) {
  return String(value == null ? '' : value).trim();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
