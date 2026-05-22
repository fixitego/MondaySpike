const SHEET_ID = '1HHUSk0IVPYUAymvkALV2sDZEhVK2pkk89zBfE38gkvo';
const DATES_SHEET = 'available_dates';
const MEMBERS_SHEET = 'fixed_members';
const LEAVE_SHEET = 'leave_records';
const EXTRA_SHEET = 'extra_signups';
const FINAL_SHEET = 'final_list';

function doGet(e) {
  try {
    bootstrapSheets();

    const action = normalize(e.parameter.action);
    if (!action) {
      return jsonOutput({ ok: false, message: 'missing action' });
    }

    if (action === 'config') {
      return jsonOutput({
        ok: true,
        availableDates: getAvailableDates(),
        fixedMembers: getFixedMembers()
      });
    }

    if (action === 'final_list') {
      const date = normalize(e.parameter.date);
      if (date) {
        validateDateIsAvailable(date);
        rebuildFinalListForDate(date);
      }
      const records = getFinalListByDate(date);
      return jsonOutput({ ok: true, records: records });
    }

    if (action === 'leave') {
      saveLeave(e.parameter);
      rebuildFinalListForDate(normalize(e.parameter.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      saveExtraSignup(e.parameter);
      rebuildFinalListForDate(normalize(e.parameter.date));
      return jsonOutput({ ok: true });
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

    if (!action) {
      return jsonOutput({ ok: false, message: 'missing action' });
    }

    if (action === 'leave') {
      saveLeave(payload);
      rebuildFinalListForDate(normalize(payload.date));
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      saveExtraSignup(payload);
      rebuildFinalListForDate(normalize(payload.date));
      return jsonOutput({ ok: true });
    }

    return jsonOutput({ ok: false, message: 'unknown action' });
  } catch (err) {
    return jsonOutput({ ok: false, message: String(err) });
  }
}

function saveLeave(payload) {
  const date = normalize(payload.date);
  const memberId = normalize(payload.memberId);
  const memberName = normalize(payload.memberName);
  const gender = normalize(payload.gender);

  if (!date || !memberId || !memberName) {
    throw new Error('invalid leave payload');
  }

  validateDateIsAvailable(date);
  validateMemberExists(memberId);

  const sheet = getSheet(LEAVE_SHEET);
  const all = sheet.getDataRange().getDisplayValues();
  const duplicate = all.some(function (row, i) {
    if (i === 0) return false;
    return normalize(row[0]) === date && normalize(row[1]) === memberId;
  });

  if (duplicate) {
    return;
  }

  sheet.appendRow([
    date,
    memberId,
    memberName,
    gender,
    '請假',
    new Date()
  ]);
}

function saveExtraSignup(payload) {
  const date = normalize(payload.date);
  const name = normalize(payload.name);
  const gender = normalize(payload.gender);

  if (!date || !name || !gender) {
    throw new Error('invalid extra_signup payload');
  }

  validateDateIsAvailable(date);

  const sheet = getSheet(EXTRA_SHEET);
  sheet.appendRow([
    date,
    name,
    gender,
    '額外報名',
    new Date()
  ]);
}

function rebuildFinalListForDate(date) {
  if (!date) {
    return;
  }

  validateDateIsAvailable(date);

  const fixedMembers = getFixedMembers();
  const leaveSheet = getSheet(LEAVE_SHEET);
  const extraSheet = getSheet(EXTRA_SHEET);
  const finalSheet = getSheet(FINAL_SHEET);

  const leaveRows = leaveSheet.getDataRange().getDisplayValues();
  const extraRows = extraSheet.getDataRange().getDisplayValues();
  const finalRows = finalSheet.getDataRange().getDisplayValues();

  const leaveSet = {};
  for (var i = 1; i < leaveRows.length; i += 1) {
    var leaveRow = leaveRows[i];
    if (normalize(leaveRow[0]) !== date) continue;
    leaveSet[normalize(leaveRow[1])] = true;
  }

  var filtered = [finalRows[0] || ['date', 'name', 'gender', 'source']];
  for (var j = 1; j < finalRows.length; j += 1) {
    if (normalize(finalRows[j][0]) !== date) {
      filtered.push(finalRows[j].slice(0, 4));
    }
  }

  var availableFixed = [];
  for (var k = 0; k < fixedMembers.length; k += 1) {
    var member = fixedMembers[k];
    if (!leaveSet[normalize(member.memberId)]) {
      availableFixed.push([
        date,
        member.name,
        member.gender,
        '固定名單'
      ]);
    }
  }

  var extraCandidates = [];
  for (var m = 1; m < extraRows.length; m += 1) {
    var extraRow = extraRows[m];
    if (normalize(extraRow[0]) !== date) continue;
    extraCandidates.push([
      normalize(extraRow[0]),
      normalize(extraRow[1]),
      normalize(extraRow[2]),
      '額外報名'
    ]);
  }

  var targetCount = fixedMembers.length;
  var neededExtra = targetCount - availableFixed.length;
  if (neededExtra < 0) {
    neededExtra = 0;
  }

  filtered = filtered.concat(availableFixed);
  if (neededExtra > 0) {
    filtered = filtered.concat(extraCandidates.slice(0, neededExtra));
  }

  finalSheet.clearContents();
  finalSheet.getRange(1, 1, filtered.length, 4).setValues(filtered);
}

function getFinalListByDate(date) {
  const sheet = getSheet(FINAL_SHEET);
  var rows = sheet.getDataRange().getDisplayValues();

  if (date && !hasFinalDateRows(rows, date)) {
    rebuildFinalListForDate(date);
    rows = sheet.getDataRange().getDisplayValues();
  }

  const result = [];
  for (var i = 1; i < rows.length; i += 1) {
    var row = rows[i];
    var rowDate = normalize(row[0]);
    if (date && rowDate !== date) continue;
    result.push({
      date: rowDate,
      name: normalize(row[1]),
      gender: normalize(row[2]),
      source: normalize(row[3])
    });
  }
  return result;
}

function hasFinalDateRows(rows, date) {
  for (var i = 1; i < rows.length; i += 1) {
    if (normalize(rows[i][0]) === date) {
      return true;
    }
  }
  return false;
}

function getAvailableDates() {
  const rows = getSheet(DATES_SHEET).getDataRange().getDisplayValues();
  const result = [];

  for (var i = 1; i < rows.length; i += 1) {
    var date = normalize(rows[i][0]);
    var label = normalize(rows[i][1]);
    var enabled = normalize(rows[i][2]).toLowerCase();

    if (!isIsoDate(date)) continue;
    if (enabled && enabled !== '1' && enabled !== 'true' && enabled !== 'yes' && enabled !== 'y') continue;

    result.push({
      date: date,
      label: label || date
    });
  }

  return result;
}

function getFixedMembers() {
  const rows = getSheet(MEMBERS_SHEET).getDataRange().getDisplayValues();
  const result = [];

  for (var i = 1; i < rows.length; i += 1) {
    var memberId = normalize(rows[i][0]);
    var name = normalize(rows[i][1]);
    var gender = normalize(rows[i][2]);
    var enabled = normalize(rows[i][3]).toLowerCase();

    if (!memberId || !name) continue;
    if (enabled && enabled !== '1' && enabled !== 'true' && enabled !== 'yes' && enabled !== 'y') continue;

    result.push({
      memberId: memberId,
      name: name,
      gender: gender || '未填'
    });
  }

  return result;
}

function validateDateIsAvailable(date) {
  const dates = getAvailableDates();
  var found = false;
  for (var i = 0; i < dates.length; i += 1) {
    if (dates[i].date === date) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error('date is not available: ' + date);
  }
}

function validateMemberExists(memberId) {
  const members = getFixedMembers();
  var found = false;
  for (var i = 0; i < members.length; i += 1) {
    if (normalize(members[i].memberId) === memberId) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error('member not found in fixed_members: ' + memberId);
  }
}

function bootstrapSheets() {
  ensureSheet(DATES_SHEET, ['date', 'label', 'enabled'], [
    [todayPlus(0), '本週一', '1'],
    [todayPlus(7), '下週一', '1']
  ]);

  ensureSheet(MEMBERS_SHEET, ['memberId', 'memberName', 'gender', 'enabled'], [
    ['M001', '王小明', '男', '1'],
    ['M002', '林小美', '女', '1']
  ]);

  ensureSheet(LEAVE_SHEET, ['date', 'memberId', 'memberName', 'gender', 'status', 'createdAt']);
  ensureSheet(EXTRA_SHEET, ['date', 'name', 'gender', 'source', 'createdAt']);
  ensureSheet(FINAL_SHEET, ['date', 'name', 'gender', 'source']);
}

function ensureSheet(name, headers, seedRows) {
  const sheet = getSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    if (seedRows && seedRows.length) {
      sheet.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
    }
    return;
  }

  const currentHeader = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  var missing = false;
  for (var i = 0; i < headers.length; i += 1) {
    if (normalize(currentHeader[i]) !== normalize(headers[i])) {
      missing = true;
      break;
    }
  }

  if (missing) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function todayPlus(days) {
  const tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  const date = new Date();
  date.setDate(date.getDate() + days);
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function normalize(value) {
  return String(value == null ? '' : value).trim();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
