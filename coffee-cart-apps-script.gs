/**
 * Coffee Cart back end (Google Apps Script)
 * -----------------------------------------
 * Lives inside the Google Sheet that holds the coffee cart's orders and punch balances.
 * The order screen and the queue screen (coffee-cart.html) both talk to this script.
 *
 * Setup (once):
 *   1. Create a new Google Sheet. Extensions > Apps Script. Replace the code with this file.
 *   2. Project Settings (gear) > Script properties > Add:  CART_KEY = a code you make up (8+ letters/numbers).
 *   3. In the editor choose the function "setup" and press Run (approve the permission prompts).
 *   4. Deploy > New deployment > Web app.  Execute as: Me.  Who has access: Anyone.  Copy the Web app URL.
 *   5. On each device open coffee-cart.html > Connection, paste the URL and the code.
 *
 * If you change this code later: Deploy > Manage deployments > edit (pencil) > New version > Deploy.
 * The URL stays the same.
 */

// ---- shared rules (same code the page uses in test mode) ----
var CartLogic = (function () {
  'use strict';
  // Shared rules for the coffee cart. The SAME code runs in the browser (test mode on one
  // computer) and in the Apps Script (real mode with a Google Sheet), so both behave alike.
  //
  // db = { orders: [], teachers: [{id,name,punches}], ledger: [], cards: [], pinHash: '', nextTid: 1 }
  // handle(db, req, now, day) -> { resp, changes }
  //   resp    = JSON sent back to the page
  //   changes = what the Apps Script must write to the Sheet (the browser version just saves db)

  function newDb() {
    return { orders: [], teachers: [], ledger: [], cards: [], pinHash: '', nextTid: 1 };
  }
  function fail(code, message) {
    return { resp: { ok: false, error: code, message: message }, changes: null };
  }
  function emptyChanges() {
    return { ordersAdded: [], ordersUpdated: [], teachersAdded: [], teachersUpdated: [], ledgerAdded: [], cardsAdded: [], pinHash: null };
  }
  function lower(s) { return String(s).toLowerCase(); }
  function intOr(v, dflt) {
    var n = parseInt(v, 10);
    return isNaN(n) ? dflt : n;
  }
  function teacherById(db, id) {
    for (var i = 0; i < db.teachers.length; i++) if (db.teachers[i].id === id) return db.teachers[i];
    return null;
  }
  function plural(n, word) {
    var many = word === 'punch' ? 'punches' : word + 's';
    return n + ' ' + (Math.abs(n) === 1 ? word : many);
  }

  function snapshot(db, now) {
    var cutoff = now - 3 * 3600 * 1000;
    var orders = db.orders.filter(function (o) { return !o.done || (o.doneAt || 0) >= cutoff; });
    orders.sort(function (a, b) { return a.createdAt - b.createdAt; });
    if (orders.length > 80) orders = orders.slice(orders.length - 80);
    return {
      ok: true,
      serverNow: now,
      orders: orders,
      teachers: db.teachers.map(function (t) { return { id: t.id, name: t.name, punches: t.punches }; }),
      hasPin: !!db.pinHash,
      log: db.ledger.slice(-15).reverse()
    };
  }

  function addOrder(db, o, now, day) {
    if (!o.id) return fail('bad-order', 'The order has no id.');
    for (var i = 0; i < db.orders.length; i++) {
      if (db.orders[i].id === o.id) return { resp: { ok: true, order: db.orders[i], duplicate: true }, changes: null };
    }
    if (!o.items || !o.items.length) return fail('empty', 'There are no drinks in this order.');
    var num = 0;
    db.orders.forEach(function (x) { if (x.day === day && x.num > num) num = x.num; });
    var order = {
      id: String(o.id).slice(0, 60),
      num: num + 1,
      day: day,
      createdAt: now,
      name: String(o.name || '').slice(0, 60),
      method: o.method === 'delivery' ? 'delivery' : 'pickup',
      room: String(o.room || '').slice(0, 20),
      items: o.items.slice(0, 20).map(function (it) {
        return { title: String(it.title || '').slice(0, 60), detail: String(it.detail || '').slice(0, 300) };
      }),
      pay: o.pay === 'punch' ? 'punch' : 'other',
      teacherId: null,
      teacherName: '',
      balanceAfter: null,
      done: false,
      doneAt: null
    };
    var ch = emptyChanges();
    if (order.pay === 'punch') {
      var t = teacherById(db, o.teacherId);
      if (!t) return fail('no-teacher', 'That teacher is not on the list.');
      var n = order.items.length;
      t.punches -= n; // one punch per drink; going below zero is allowed (honor system)
      var entry = { t: now, teacherId: t.id, name: t.name, delta: -n, note: 'Order #' + order.num + ' (' + plural(n, 'drink') + ')' };
      db.ledger.push(entry);
      order.teacherId = t.id;
      order.teacherName = t.name;
      order.balanceAfter = t.punches;
      ch.teachersUpdated.push(t);
      ch.ledgerAdded.push(entry);
    }
    db.orders.push(order);
    ch.ordersAdded.push(order);
    return { resp: { ok: true, order: order }, changes: ch };
  }

  function setDone(db, req, now) {
    for (var i = 0; i < db.orders.length; i++) {
      if (db.orders[i].id === req.id) {
        var o = db.orders[i];
        o.done = !!req.done;
        o.doneAt = o.done ? now : null;
        var ch = emptyChanges();
        ch.ordersUpdated.push(o);
        return { resp: { ok: true, order: o }, changes: ch };
      }
    }
    return fail('not-found', 'That order was not found.');
  }

  function needPin(db, req) {
    if (!db.pinHash) return fail('no-pin', 'Create a teacher PIN first.');
    if (req.pinHash !== db.pinHash) return fail('bad-pin', 'That PIN is not right.');
    return null;
  }

  function setPin(db, req) {
    var nh = String(req.newPinHash || '');
    if (nh.length < 16) return fail('bad-pin', 'The new PIN was not valid.');
    if (db.pinHash && req.pinHash !== db.pinHash) return fail('bad-pin', 'That PIN is not right.');
    db.pinHash = nh;
    var ch = emptyChanges();
    ch.pinHash = nh;
    return { resp: { ok: true }, changes: ch };
  }

  function addTeachers(db, req, now) {
    var names = (req.names || []).map(function (s) { return String(s).trim().slice(0, 60); }).filter(Boolean);
    if (!names.length) return fail('no-names', 'Type at least one name.');
    var start = intOr(req.start, 0);
    if (start < -50 || start > 200) start = 0;
    var ch = emptyChanges();
    var added = 0, skipped = 0;
    names.forEach(function (name) {
      var dupe = db.teachers.some(function (t) { return lower(t.name) === lower(name); });
      if (dupe) { skipped++; return; }
      var t = { id: db.nextTid++, name: name, punches: start };
      db.teachers.push(t);
      ch.teachersAdded.push(t);
      if (start !== 0) {
        var e = { t: now, teacherId: t.id, name: t.name, delta: start, note: 'Starting balance' };
        db.ledger.push(e);
        ch.ledgerAdded.push(e);
      }
      added++;
    });
    return { resp: { ok: true, added: added, skipped: skipped }, changes: ch };
  }

  function adjust(db, req, now) {
    var t = teacherById(db, intOr(req.teacherId, -1));
    var delta = intOr(req.delta, 0);
    if (!t) return fail('no-teacher', 'That teacher is not on the list.');
    if (!delta || delta < -50 || delta > 50) return fail('bad-number', 'That number of punches is not allowed.');
    t.punches += delta;
    var e = { t: now, teacherId: t.id, name: t.name, delta: delta, note: String(req.note || 'Adjusted by hand').slice(0, 120) };
    db.ledger.push(e);
    var ch = emptyChanges();
    ch.teachersUpdated.push(t);
    ch.ledgerAdded.push(e);
    return { resp: { ok: true, teacher: t }, changes: ch };
  }

  function loadCard(db, req, now) {
    var t = teacherById(db, intOr(req.teacherId, -1));
    var count = intOr(req.count, 0);
    var cardNo = String(req.cardNo || '').trim().slice(0, 40);
    if (!t) return fail('no-teacher', 'That teacher is not on the list.');
    if (count < 1 || count > 50) return fail('bad-number', 'Punches should be a number from 1 to 50.');
    var ch = emptyChanges();
    if (cardNo) {
      var seen = db.cards.some(function (c) { return lower(c.cardNo) === lower(cardNo); });
      if (seen) return fail('dup-card', 'Card ' + cardNo + ' was already loaded. Nothing was added.');
      var c = { cardNo: cardNo, teacherId: t.id, t: now };
      db.cards.push(c);
      ch.cardsAdded.push(c);
    }
    t.punches += count;
    var e = { t: now, teacherId: t.id, name: t.name, delta: count, note: cardNo ? 'Loaded card ' + cardNo : 'Loaded a card' };
    db.ledger.push(e);
    ch.teachersUpdated.push(t);
    ch.ledgerAdded.push(e);
    return { resp: { ok: true, teacher: t }, changes: ch };
  }

  function handle(db, req, now, day) {
    var a = req && req.action;
    var bad;
    if (a === 'poll') return { resp: snapshot(db, now), changes: null };
    if (a === 'addOrder') return addOrder(db, req.order || {}, now, day);
    if (a === 'setDone') return setDone(db, req, now);
    if (a === 'verifyPin') return { resp: { ok: true, valid: !!db.pinHash && req.pinHash === db.pinHash }, changes: null };
    if (a === 'setPin') return setPin(db, req);
    if (a === 'addTeachers' || a === 'adjust' || a === 'loadCard' || a === 'export') {
      bad = needPin(db, req);
      if (bad) return bad;
      if (a === 'addTeachers') return addTeachers(db, req, now);
      if (a === 'adjust') return adjust(db, req, now);
      if (a === 'loadCard') return loadCard(db, req, now);
      return { resp: { ok: true, data: { teachers: db.teachers, ledger: db.ledger, cards: db.cards, orders: db.orders } }, changes: null };
    }
    return fail('unknown-action', 'Unknown request.');
  }

  return { newDb: newDb, handle: handle, snapshot: snapshot };
})();

// ---- end shared rules ----

var TABS = {
  orders: ['id', 'num', 'day', 'createdAt', 'time', 'name', 'method', 'room', 'items', 'itemsText', 'pay', 'teacherId', 'teacherName', 'balanceAfter', 'status', 'doneAt'],
  teachers: ['id', 'name', 'punches'],
  punches: ['t', 'time', 'teacherId', 'name', 'delta', 'note'],
  cards: ['cardNo', 'teacherId', 't', 'time'],
  config: ['key', 'value']
};
var TEXT_COLS = {
  orders: [1, 3, 5, 6, 7, 8, 9, 10, 11, 13, 15],
  teachers: [2],
  punches: [4, 6],
  cards: [1],
  config: [1, 2]
};
var RECENT_ORDER_ROWS = 300;

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTabs_(ss);
  return 'Coffee cart tabs are ready.';
}

function doGet() {
  return ContentService.createTextOutput('The coffee cart back end is running.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('CART_KEY');
    if (!key) out = { ok: false, error: 'no-key', message: 'Set CART_KEY in Script properties first.' };
    else if (req.key !== key) out = { ok: false, error: 'bad-key', message: 'The access code is not right.' };
    else out = run_(req);
  } catch (err) {
    out = { ok: false, error: 'server', message: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function run_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var readOnly = req.action === 'poll' || req.action === 'verifyPin';
  var lock = null;
  if (!readOnly) {
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
  }
  try {
    ensureTabs_(ss);
    var now = Date.now();
    var tz = ss.getSpreadsheetTimeZone();
    var day = Utilities.formatDate(new Date(now), tz, 'yyyy-MM-dd');
    var loaded = loadDb_(ss, tz, req.action === 'export');
    var result = CartLogic.handle(loaded.db, req, now, day);
    if (result.changes) saveChanges_(ss, tz, loaded, result.changes);
    return result.resp;
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ---------- sheet helpers ----------
function ensureTabs_(ss) {
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
      sh.setFrozenRows(1);
    }
    (TEXT_COLS[name] || []).forEach(function (c) {
      sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

function text_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return String(v);
  return String(v);
}
function dayText_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return String(v);
}
function num_(v, dflt) {
  var n = parseInt(v, 10);
  return isNaN(n) ? dflt : n;
}
function readRows_(sh, firstRow, count, cols) {
  if (count < 1) return [];
  return sh.getRange(firstRow, 1, count, cols).getValues();
}

function loadDb_(ss, tz, full) {
  var db = CartLogic.newDb();
  var rows = {};

  var os = ss.getSheetByName('orders');
  var oLast = os.getLastRow();
  var oFirst = full ? 2 : Math.max(2, oLast - RECENT_ORDER_ROWS + 1);
  var oRows = oLast >= 2 ? readRows_(os, oFirst, oLast - oFirst + 1, TABS.orders.length) : [];
  rows.orders = {};
  oRows.forEach(function (r, i) {
    if (!r[0]) return;
    var items = [];
    try { items = JSON.parse(r[8] || '[]'); } catch (x) { items = []; }
    var order = {
      id: text_(r[0]), num: num_(r[1], 0), day: dayText_(r[2], tz), createdAt: num_(r[3], 0),
      name: text_(r[5]), method: text_(r[6]), room: text_(r[7]), items: items,
      pay: text_(r[10]) || 'other', teacherId: r[11] === '' ? null : num_(r[11], null),
      teacherName: text_(r[12]), balanceAfter: r[13] === '' ? null : num_(r[13], null),
      done: text_(r[14]) === 'done', doneAt: r[15] === '' ? null : num_(r[15], null)
    };
    db.orders.push(order);
    rows.orders[order.id] = oFirst + i;
  });

  var ts = ss.getSheetByName('teachers');
  var tLast = ts.getLastRow();
  var tRows = tLast >= 2 ? readRows_(ts, 2, tLast - 1, 3) : [];
  rows.teachers = {};
  var maxId = 0;
  tRows.forEach(function (r, i) {
    if (r[0] === '' || r[1] === '') return;
    var id = num_(r[0], 0);
    db.teachers.push({ id: id, name: text_(r[1]), punches: num_(r[2], 0) });
    rows.teachers[id] = i + 2;
    if (id > maxId) maxId = id;
  });
  db.nextTid = maxId + 1;

  var ps = ss.getSheetByName('punches');
  var pLast = ps.getLastRow();
  var pFirst = full ? 2 : Math.max(2, pLast - 14);
  var pRows = pLast >= 2 ? readRows_(ps, pFirst, pLast - pFirst + 1, 6) : [];
  pRows.forEach(function (r) {
    if (r[0] === '') return;
    db.ledger.push({ t: num_(r[0], 0), teacherId: num_(r[2], null), name: text_(r[3]), delta: num_(r[4], 0), note: text_(r[5]) });
  });

  var cs = ss.getSheetByName('cards');
  var cLast = cs.getLastRow();
  var cRows = cLast >= 2 ? readRows_(cs, 2, cLast - 1, 3) : [];
  cRows.forEach(function (r) {
    if (r[0] === '') return;
    db.cards.push({ cardNo: text_(r[0]), teacherId: num_(r[1], null), t: num_(r[2], 0) });
  });

  var cf = ss.getSheetByName('config');
  var fLast = cf.getLastRow();
  var fRows = fLast >= 2 ? readRows_(cf, 2, fLast - 1, 2) : [];
  rows.config = {};
  fRows.forEach(function (r, i) {
    rows.config[text_(r[0])] = i + 2;
    if (r[0] === 'pinHash') db.pinHash = text_(r[1]);
  });

  return { db: db, rows: rows };
}

function clock_(ms, tz) { return Utilities.formatDate(new Date(ms), tz, 'h:mm a'); }
function itemsText_(items) {
  return items.map(function (it) { return it.title + (it.detail ? ' - ' + it.detail.replace(/\n/g, '; ') : ''); }).join(' | ');
}
function orderRow_(o, tz) {
  return [o.id, o.num, o.day, o.createdAt, clock_(o.createdAt, tz), o.name, o.method, o.room,
    JSON.stringify(o.items), itemsText_(o.items), o.pay, o.teacherId === null ? '' : o.teacherId,
    o.teacherName, o.balanceAfter === null ? '' : o.balanceAfter, o.done ? 'done' : 'open', o.doneAt === null ? '' : o.doneAt];
}
function appendRows_(sh, rows) {
  if (!rows.length) return;
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function saveChanges_(ss, tz, loaded, ch) {
  var rows = loaded.rows;
  var os = ss.getSheetByName('orders');
  var ts = ss.getSheetByName('teachers');

  appendRows_(ts, ch.teachersAdded.map(function (t) { return [t.id, t.name, t.punches]; }));
  ch.teachersUpdated.forEach(function (t) {
    var r = rows.teachers[t.id];
    if (r) ts.getRange(r, 3).setValue(t.punches);
  });

  appendRows_(os, ch.ordersAdded.map(function (o) { return orderRow_(o, tz); }));
  ch.ordersUpdated.forEach(function (o) {
    var r = rows.orders[o.id];
    if (r) os.getRange(r, 15, 1, 2).setValues([[o.done ? 'done' : 'open', o.doneAt === null ? '' : o.doneAt]]);
  });

  appendRows_(ss.getSheetByName('punches'), ch.ledgerAdded.map(function (e) {
    return [e.t, clock_(e.t, tz) + ' ' + Utilities.formatDate(new Date(e.t), tz, 'M/d'), e.teacherId, e.name, e.delta, e.note];
  }));
  appendRows_(ss.getSheetByName('cards'), ch.cardsAdded.map(function (c) {
    return [c.cardNo, c.teacherId, c.t, Utilities.formatDate(new Date(c.t), tz, 'M/d h:mm a')];
  }));

  if (ch.pinHash !== null) {
    var cf = ss.getSheetByName('config');
    var r = rows.config.pinHash;
    if (r) cf.getRange(r, 2).setValue(ch.pinHash);
    else appendRows_(cf, [['pinHash', ch.pinHash]]);
  }
}
