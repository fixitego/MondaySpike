const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const LEAVE_SHEET = 'leave_records';
const EXTRA_SHEET = 'extra_signups';
const FINAL_SHEET = 'final_list';
const FIXED_MEMBERS = [
  { memberId: 'M001', name: '王小明', gender: '男' },
  { memberId: 'M002', name: '林小美', gender: '女' },
  { memberId: 'M003', name: '陳大華', gender: '男' },
  { memberId: 'M004', name: '李佳玲', gender: '女' },
  { memberId: 'M005', name: '吳志強', gender: '男' },
  { memberId: 'M006', name: '蔡佩君', gender: '女' }
];

function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();

    if (!action) {
      return jsonOutput({ ok: false, message: 'missing action' });
    }

    if (action === 'final_list') {
      const date = (e.parameter.date || '').trim();
      const records = getFinalListByDate(date);
      return jsonOutput({ ok: true, records: records });
    }

    if (action === 'leave') {
      saveLeave(e.parameter);
      rebuildFinalListForDate(e.parameter.date);
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      saveExtraSignup(e.parameter);
      rebuildFinalListForDate(e.parameter.date);
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
    const action = (payload.action || '').trim();

    if (!action) {
      return jsonOutput({ ok: false, message: 'missing action' });
    }

    if (action === 'leave') {
      saveLeave(payload);
      rebuildFinalListForDate(payload.date);
      return jsonOutput({ ok: true });
    }

    if (action === 'extra_signup') {
      saveExtraSignup(payload);
      rebuildFinalListForDate(payload.date);
      return jsonOutput({ ok: true });
    }

    return jsonOutput({ ok: false, message: 'unknown action' });
  } catch (err) {
    return jsonOutput({ ok: false, message: String(err) });
  }
}

function saveLeave(payload) {
  const date = String(payload.date || '').trim();
  const memberId = String(payload.memberId || '').trim();
  const memberName = String(payload.memberName || '').trim();
  const gender = String(payload.gender || '').trim();

  if (!date || !memberId || !memberName) {
    throw new Error('invalid leave payload');
  }

  const sheet = getSheet(LEAVE_SHEET);
  const all = sheet.getDataRange().getValues();
  const duplicate = all.some(function (row, i) {
    if (i === 0) return false;
    return String(row[0]) === date && String(row[1]) === memberId;
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
  const date = String(payload.date || '').trim();
  const name = String(payload.name || '').trim();
  const gender = String(payload.gender || '').trim();

  if (!date || !name || !gender) {
    throw new Error('invalid extra_signup payload');
  }

  const sheet = getSheet(EXTRA_SHEET);
  sheet.appendRow([
    date,
    name,
    gender,
    '額外報名',
    '報名',
    new Date()
  ]);
}

function rebuildFinalListForDate(date) {
  if (!date) return;

  const leaveSheet = getSheet(LEAVE_SHEET);
  const extraSheet = getSheet(EXTRA_SHEET);
  const finalSheet = getSheet(FINAL_SHEET);

  const leaveRows = leaveSheet.getDataRange().getValues();
  const extraRows = extraSheet.getDataRange().getValues();
  const finalRows = finalSheet.getDataRange().getValues();

  const leaveSet = {};
  for (var i = 1; i < leaveRows.length; i += 1) {
    var leaveRow = leaveRows[i];
    if (String(leaveRow[0]) !== date) continue;
    leaveSet[String(leaveRow[1])] = true;
  }

  var filtered = [finalRows[0] || ['date', 'name', 'gender', 'source', 'status']];
  for (var j = 1; j < finalRows.length; j += 1) {
    if (String(finalRows[j][0]) !== date) {
      filtered.push(finalRows[j]);
    }
  }

  for (var k = 0; k < FIXED_MEMBERS.length; k += 1) {
    var member = FIXED_MEMBERS[k];
    var isLeave = !!leaveSet[member.memberId];
    filtered.push([
      date,
      member.name,
      member.gender,
      '固定名單',
      isLeave ? '請假' : '報名'
    ]);
  }

  for (var m = 1; m < extraRows.length; m += 1) {
    var extraRow = extraRows[m];
    if (String(extraRow[0]) !== date) continue;
    filtered.push([
      extraRow[0],
      extraRow[1],
      extraRow[2],
      '額外報名',
      '報名'
    ]);
  }

  finalSheet.clearContents();
  finalSheet.getRange(1, 1, filtered.length, 5).setValues(filtered);
}

function getFinalListByDate(date) {
  const sheet = getSheet(FINAL_SHEET);
  const rows = sheet.getDataRange().getValues();

  const result = [];
  for (var i = 1; i < rows.length; i += 1) {
    var row = rows[i];
    if (date && String(row[0]) !== date) continue;
    result.push({
      date: String(row[0] || ''),
      name: String(row[1] || ''),
      gender: String(row[2] || ''),
      source: String(row[3] || ''),
      status: String(row[4] || '')
    });
  }

  return result;
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    if (name === LEAVE_SHEET) {
      sheet.appendRow(['date', 'memberId', 'memberName', 'gender', 'status', 'createdAt']);
    }
    if (name === EXTRA_SHEET) {
      sheet.appendRow(['date', 'name', 'gender', 'source', 'status', 'createdAt']);
    }
    if (name === FINAL_SHEET) {
      sheet.appendRow(['date', 'name', 'gender', 'source', 'status']);
    }
  }

  return sheet;
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
