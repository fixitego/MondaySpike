const SHEET_ID = '1HHUSk0IVPYUAymvkALV2sDZEhVK2pkk89zBfE38gkvo';
const DATES_SHEET = 'available_dates';
const MEMBERS_SHEET = 'fixed_members';
const LEAVE_SHEET = 'leave_records';
const EXTRA_SHEET = 'extra_signups';
const FINAL_SHEET = 'final_list';
const SETTLE_SHEET = 'settlement_control';

const TOTAL_LIMIT = 18;
const FEMALE_LIMIT = 9;

// 安全控制（寫死在程式）
const ALLOW_USER_EDIT = true;
const ENABLE_MANUAL_SETTLEMENT_TRIGGER = true;
const SETTLEMENT_TRIGGER_TOKEN = '123456';

function doGet(e) {
  try {
    bootstrapSheets();
    const action = normalize(e.parameter.action);
    if (!action) return jsonOutput({ ok: false, message: 'missing action' });

    if (action === 'config') {
      return jsonOutput({
        ok: true,
        availableDates: getAvailableDates(),
        fixedMembers: getFixedMembers(),
        policy: {
          allowUserEdit: ALLOW_USER_EDIT,
          enableManualSettlementTrigger: ENABLE_MANUAL_SETTLEMENT_TRIGGER
        }
      });
    }

    if (action === 'final_list') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      rebuildFinalListForDate(date);
      return jsonOutput({ ok: true, records: getFinalListByDate(date) });
    }

    if (action === 'leave') {
      assertEditable();
      saveLeave(e.parameter);
      rebuildFinalListForDate(normalize(e.parameter.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      assertEditable();
      saveExtraSignup(e.parameter);
      rebuildFinalListForDate(normalize(e.parameter.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'cancel_extra_signup') {
      assertEditable();
      cancelExtraSignup(normalize(e.parameter.signupId));
      const date = normalize(e.parameter.date);
      if (date) rebuildFinalListForDate(date);
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_list') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      return jsonOutput({ ok: true, records: getExtraSignupsByDate(date) });
    }

    if (action === 'settlement_status') {
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    if (action === 'trigger_settlement') {
      requireSettlementPermission(normalize(e.parameter.token));
      const date = normalize(e.parameter.date);
      validateDateIsAvailable(date);
      triggerSettlement(date, 'manual_api_trigger');
      rebuildFinalListForDate(date);
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    return jsonOutput({ ok: false, message: 'unknown action' });
  } catch (err) {
    return jsonOutput({ ok: false, message: String(err) });
  }
}

function doPost(e) {
  try {
    bootstrapSheets();
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = normalize(payload.action);

    if (action === 'leave') {
      assertEditable();
      saveLeave(payload);
      rebuildFinalListForDate(normalize(payload.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      assertEditable();
      saveExtraSignup(payload);
      rebuildFinalListForDate(normalize(payload.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'cancel_extra_signup') {
      assertEditable();
      cancelExtraSignup(normalize(payload.signupId));
      const date = normalize(payload.date);
      if (date) rebuildFinalListForDate(date);
      return jsonOutput({ ok: true });
    }

    if (action === 'trigger_settlement') {
      requireSettlementPermission(normalize(payload.token));
      const date = normalize(payload.date);
      validateDateIsAvailable(date);
      triggerSettlement(date, 'manual_post_trigger');
      rebuildFinalListForDate(date);
      return jsonOutput({ ok: true, settlement: getSettlementStatus(date) });
    }

    return jsonOutput({ ok: false, message: 'unknown action' });
  } catch (err) {
    return jsonOutput({ ok: false, message: String(err) });
  }
}

function assertEditable() {
  if (!ALLOW_USER_EDIT) throw new Error('editing is disabled by server policy');
}

function requireSettlementPermission(token) {
  if (!ENABLE_MANUAL_SETTLEMENT_TRIGGER) throw new Error('manual settlement trigger is disabled');
  if (!token || token !== SETTLEMENT_TRIGGER_TOKEN) throw new Error('permission denied');
}

function saveLeave(payload) {
  const date = normalize(payload.date);
  const memberId = normalize(payload.memberId);
  const memberName = normalize(payload.memberName);
  const gender = normalize(payload.gender);

  if (!date || !memberId || !memberName) throw new Error('invalid leave payload');
  validateDateIsAvailable(date);
  validateMemberExists(memberId);

  const sheet = getSheet(LEAVE_SHEET);
  const rows = sheet.getDataRange().getDisplayValues();
  const duplicate = rows.some(function (row, i) {
    return i > 0 && normalize(row[0]) === date && normalize(row[1]) === memberId;
  });
  if (duplicate) return;

  sheet.appendRow([date, memberId, memberName, gender, '請假', nowIso()]);
}

function saveExtraSignup(payload) {
  const date = normalize(payload.date);
  const type = normalize(payload.extraType).toUpperCase();
  const maleName = normalize(payload.maleName);
  const femaleName = normalize(payload.femaleName);
  const note = normalize(payload.note);
  const pairMustTogether = normalize(payload.pairMustTogether).toLowerCase();

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

function rebuildFinalListForDate(date) {
  validateDateIsAvailable(date);
  autoTriggerSettlementIfDue(date);

  const fixedMembers = getFixedMembers();
  const finalSheet = getSheet(FINAL_SHEET);
  const finalRows = finalSheet.getDataRange().getDisplayValues();

  const leaveSet = getLeaveSet(date);
  const baseList = [];
  for (var i = 0; i < fixedMembers.length; i += 1) {
    var member = fixedMembers[i];
    if (!leaveSet[normalize(member.memberId)]) baseList.push([date, member.name, member.gender, '固定名單']);
  }

  var rebuilt = baseList.slice();
  if (getSettlementStatus(date).settled) rebuilt = applyExtraFillLogic(date, rebuilt);

  var output = [finalRows[0] || ['date', 'name', 'gender', 'source']];
  for (var j = 1; j < finalRows.length; j += 1) {
    if (normalize(finalRows[j][0]) !== date) output.push(finalRows[j].slice(0, 4));
  }
  output = output.concat(rebuilt);

  finalSheet.clearContents();
  finalSheet.getRange(1, 1, output.length, 4).setValues(output);
}

function applyExtraFillLogic(date, currentList) {
  const records = getExtraSignupsByDate(date);
  var females = countFemale(currentList);
  var total = currentList.length;
  var result = currentList.slice();

  for (var i = 0; i < records.length; i += 1) {
    if (total >= TOTAL_LIMIT) break;

    var r = records[i];
    if (r.type === 'MALE') {
      if (total + 1 <= TOTAL_LIMIT) {
        result.push([date, r.maleName, '男', '額外報名']);
        total += 1;
      }
      continue;
    }

    if (r.type === 'FEMALE') {
      if (total + 1 <= TOTAL_LIMIT && females + 1 <= FEMALE_LIMIT) {
        result.push([date, r.femaleName, '女', '額外報名']);
        total += 1;
        females += 1;
      }
      continue;
    }

    if (r.type === 'PAIR') {
      var canMale = total + 1 <= TOTAL_LIMIT;
      var canFemale = total + 1 <= TOTAL_LIMIT && females + 1 <= FEMALE_LIMIT;
      var mustTogether = r.pairMustTogether === '1';

      if (mustTogether) {
        if (total + 2 <= TOTAL_LIMIT && females + 1 <= FEMALE_LIMIT) {
          result.push([date, r.maleName, '男', '額外報名(配對)']);
          result.push([date, r.femaleName, '女', '額外報名(配對)']);
          total += 2;
          females += 1;
        }
      } else {
        if (canMale) {
          result.push([date, r.maleName, '男', '額外報名(配對-男)']);
          total += 1;
        }
        if (canFemale && total < TOTAL_LIMIT) {
          result.push([date, r.femaleName, '女', '額外報名(配對-女)']);
          total += 1;
          females += 1;
        }
      }
    }
  }

  return result;
}

function getLeaveSet(date) {
  const rows = getSheet(LEAVE_SHEET).getDataRange().getDisplayValues();
  const out = {};
  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === date) out[normalize(rows[i][1])] = true;
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
      createdAt: normalize(rows[i][8])
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
  if (type === 'MALE') return 1;
  if (type === 'FEMALE') return 2;
  return 3;
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
      source: normalize(rows[i][3])
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
  return {
    date: date,
    settleAt: normalize(row[1]),
    settled: normalize(row[2]) === '1',
    settledAt: normalize(row[3]),
    triggerNote: normalize(row[4])
  };
}

function ensureSettlementRow(date) {
  if (!getSettlementRow(date, false)) getSheet(SETTLE_SHEET).appendRow([date, '', '0', '', '']);
}

function triggerSettlement(date, note) {
  var info = getSettlementRow(date, true);
  info.sheet.getRange(info.index, 3).setValue('1');
  info.sheet.getRange(info.index, 4).setValue(nowIso());
  info.sheet.getRange(info.index, 5).setValue(note || 'manual_trigger');
}

function autoTriggerSettlementIfDue(date) {
  var info = getSettlementRow(date, true);
  var row = info.row;
  if (normalize(row[2]) === '1') return;
  var settleAt = normalize(row[1]);
  if (!settleAt) return;
  if (nowIsoMinute() >= settleAt) triggerSettlement(date, 'auto_schedule_trigger');
}

function getSettlementRow(date, createIfMissing) {
  var sheet = getSheet(SETTLE_SHEET);
  var rows = sheet.getDataRange().getDisplayValues();
  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === date) return { sheet: sheet, index: i + 1, row: rows[i] };
  }
  if (!createIfMissing) return null;
  sheet.appendRow([date, '', '0', '', '']);
  var idx = sheet.getLastRow();
  return { sheet: sheet, index: idx, row: sheet.getRange(idx, 1, 1, 5).getDisplayValues()[0] };
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
  ensureSheet(LEAVE_SHEET, ['date', 'memberId', 'memberName', 'gender', 'status', 'createdAt']);
  ensureSheet(EXTRA_SHEET, ['signupId', 'date', 'type', 'maleName', 'femaleName', 'note', 'pairMustTogether', 'isCanceled', 'createdAt', 'canceledAt']);
  ensureSheet(FINAL_SHEET, ['date', 'name', 'gender', 'source']);
  ensureSheet(SETTLE_SHEET, ['date', 'settleAt(YYYY-MM-DD HH:mm)', 'settled(0/1)', 'settledAt', 'triggerNote']);
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
    sheet.insertRowBefore(1);
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

function normalize(value) {
  return String(value == null ? '' : value).trim();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
