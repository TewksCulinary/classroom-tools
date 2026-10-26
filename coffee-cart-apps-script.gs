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
    return { orders: [], teachers: [], ledger: [], cards: [], pinHash: '', nextTid: 1,
      config: { maxDrinks: 20, maxCoffee: '', daysAhead: 5, lastDay: '', orderDay: 'today' }, daysOff: [] };
  }

  // ---------- days and capacity ----------
  function parseDay(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  function fmtDay(dt) {
    return dt.getUTCFullYear() + '-' + ('0' + (dt.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + dt.getUTCDate()).slice(-2);
  }
  function addDays(d, n) {
    var dt = parseDay(d);
    dt.setUTCDate(dt.getUTCDate() + n);
    return fmtDay(dt);
  }
  // school day = Monday to Friday, not on the days-off list, not after the last day of school
  function isSchoolDay(db, d) {
    var dt = parseDay(d);
    if (!dt) return false;
    var wd = dt.getUTCDay();
    if (wd === 0 || wd === 6) return false;
    if ((db.daysOff || []).indexOf(d) >= 0) return false;
    if (db.config && db.config.lastDay && d > db.config.lastDay) return false;
    return true;
  }
  // the day counter orders are for: blank = the next school day, "today", or one chosen date
  function nextSchoolDay(db, day) {
    var d = addDays(day, 1), g = 0;
    while (g++ < 40) { if (isSchoolDay(db, d)) return d; d = addDays(d, 1); }
    return day;
  }
  function orderDay(db, day) {
    var m = String((db.config && db.config.orderDay) || '').trim().toLowerCase();
    if (m === 'today') return day;
    if (/^\d{4}-\d{2}-\d{2}$/.test(m) && m >= day) return m;
    return nextSchoolDay(db, day);
  }
  function limitNum(v) {
    var n = parseInt(v, 10);
    return isNaN(n) || n < 1 ? 0 : n; // 0 means no limit
  }
  function maxDrinks(db) { return limitNum(db.config && db.config.maxDrinks); }
  function maxCoffee(db) { return limitNum(db.config && db.config.maxCoffee); }
  // drinks that take the machines and the most time count toward the coffee limit
  var COFFEE_NAMES = ['Mocha', 'Latte', 'Americano', 'Hot Chocolate', 'Steamer'];
  function isCoffee(it) {
    var t = String(it.title || '');
    if (/^Hot Chocolate/.test(t)) return true;
    t = t.replace(/^(Hot|Iced)\s+/, '');
    return COFFEE_NAMES.some(function (n) { return t.indexOf(n) === 0; });
  }
  // drinks promised for a day (cancelled orders do not count)
  function countsOn(db, d) {
    var total = 0, coffee = 0;
    db.orders.forEach(function (o) {
      if (o.cancelled || (o.forDate || o.day) !== d) return;
      o.items.forEach(function (it) { total++; if (isCoffee(it)) coffee++; });
    });
    return { total: total, coffee: coffee };
  }
  function drinksOn(db, d) { return countsOn(db, d).total; }
  function dayInfo(db, d) {
    var n = countsOn(db, d), mt = maxDrinks(db), mc = maxCoffee(db), left = null;
    if (mt) left = Math.max(mt - n.total, 0);
    if (mc) { var lc = Math.max(mc - n.coffee, 0); left = left === null ? lc : Math.min(left, lc); }
    var tf = !!mt && n.total >= mt, cf = !!mc && n.coffee >= mc;
    return { date: d, count: n.total, coffee: n.coffee, max: mt, maxCoffee: mc, left: left, full: tf || cf, totalFull: tf, coffeeFull: cf };
  }
  // the next few school days (today first, when it is one) with how full each is
  function openDays(db, today) {
    var ahead = parseInt(db.config && db.config.daysAhead, 10);
    if (isNaN(ahead) || ahead < 1) ahead = 5;
    var out = [], d = today, guard = 0;
    while (out.length < ahead && guard++ < 120) {
      if (isSchoolDay(db, d)) out.push(dayInfo(db, d));
      d = addDays(d, 1);
    }
    return out;
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

  function capOf(db, d) {
    var i = dayInfo(db, d);
    return { date: d, max: i.max, today: i.count, todayFull: i.totalFull, maxCoffee: i.maxCoffee, coffee: i.coffee, coffeeFull: i.coffeeFull };
  }
  function snapshot(db, now, day) {
    var cutoff = now - 3 * 3600 * 1000;
    var orders = db.orders.filter(function (o) { return !o.cancelled && (!o.done || (o.doneAt || 0) >= cutoff); });
    orders.sort(function (a, b) { return a.createdAt - b.createdAt; });
    if (orders.length > 80) orders = orders.slice(orders.length - 80);
    return {
      ok: true,
      serverNow: now,
      today: day,
      orderDay: orderDay(db, day),
      cap: capOf(db, orderDay(db, day)),
      capToday: capOf(db, day),
      orders: orders,
      teachers: db.teachers.map(function (t) { return { id: t.id, name: t.name, punches: t.punches }; }),
      hasPin: !!db.pinHash,
      log: db.ledger.slice(-15).reverse()
    };
  }

  // for the punch-card page: teachers and recent activity only, no orders
  function punchSnapshot(db, now) {
    return {
      ok: true,
      serverNow: now,
      teachers: db.teachers.map(function (t) { return { id: t.id, name: t.name, punches: t.punches }; }),
      hasPin: !!db.pinHash,
      log: db.ledger.slice(-40).reverse()
    };
  }

  function addOrder(db, o, now, day, canOverride) {
    if (!o.id) return fail('bad-order', 'The order has no id.');
    for (var i = 0; i < db.orders.length; i++) {
      if (db.orders[i].id === o.id) return { resp: { ok: true, order: db.orders[i], duplicate: true }, changes: null };
    }
    if (!o.items || !o.items.length) return fail('empty', 'There are no drinks in this order.');
    // an order can be for a later day (teacher orders); numbers count up within the day it is FOR
    var forDate = /^\d{4}-\d{2}-\d{2}$/.test(String(o.forDate || '')) && o.forDate >= day ? o.forDate : (o.source !== 'form' && o.who === 'student' ? orderDay(db, day) : day);
    var asked = o.source === 'form' ? 'form' : '';
    if (asked === 'form' && !isSchoolDay(db, forDate)) {
      return fail('closed', 'There are no coffee cart orders on that day.');
    }
    if (!canOverride) {
      var info = dayInfo(db, forDate);
      var wantT = 0, wantC = 0;
      o.items.slice(0, 20).forEach(function (it) { wantT++; if (isCoffee(it)) wantC++; });
      var res = null;
      if (info.max && info.count + wantT > info.max) {
        res = fail('full', info.count >= info.max ? 'The coffee cart is full for that day (' + info.count + ' of ' + info.max + ' drinks).'
          : 'Only ' + (info.max - info.count) + ' more ' + (info.max - info.count === 1 ? 'drink fits' : 'drinks fit') + ' that day (' + info.count + ' of ' + info.max + ' taken).');
        res.resp.count = info.count; res.resp.max = info.max;
      } else if (info.maxCoffee && wantC && info.coffee + wantC > info.maxCoffee) {
        res = fail('full', info.coffee >= info.maxCoffee ? 'Coffee drinks are full for that day (' + info.coffee + ' of ' + info.maxCoffee + '). A soda or Lotus would still fit.'
          : 'Only ' + (info.maxCoffee - info.coffee) + ' more coffee ' + (info.maxCoffee - info.coffee === 1 ? 'drink fits' : 'drinks fit') + ' that day (' + info.coffee + ' of ' + info.maxCoffee + ' taken).');
        res.resp.count = info.coffee; res.resp.max = info.maxCoffee;
      }
      if (res) { res.resp.date = forDate; return res; }
    }
    var num = 0;
    db.orders.forEach(function (x) { if ((x.forDate || x.day) === forDate && x.num > num) num = x.num; });
    var order = {
      id: String(o.id).slice(0, 60),
      num: num + 1,
      day: day,
      forDate: forDate,
      source: o.source === 'form' ? 'form' : '',
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
      cancelled: false,
      doneAt: null
    };
    var ch = emptyChanges();
    if (order.pay === 'punch') {
      var t = o.teacherId !== null && o.teacherId !== undefined && o.teacherId !== '' ? teacherById(db, o.teacherId) : null;
      var email = String(o.teacherEmail || '').trim().toLowerCase();
      var wantName = String(o.teacherName || '').trim();
      var added = false;
      if (!t && email) {
        for (var e = 0; e < db.teachers.length; e++) if (lower(db.teachers[e].email || '') === email) { t = db.teachers[e]; break; }
      }
      if (!t && wantName) {
        for (var k = 0; k < db.teachers.length; k++) {
          if (lower(db.teachers[k].name) !== lower(wantName)) continue;
          var theirs = lower(db.teachers[k].email || '');
          if (!theirs || !email || theirs === email) { t = db.teachers[k]; if (email && !theirs) t.email = email; }
          break;
        }
      }
      if (!t && order.source === 'form' && wantName) {
        // first order from this teacher: add them to the list automatically
        var taken = db.teachers.some(function (x) { return lower(x.name) === lower(wantName); });
        var nm = taken && email ? wantName + ' (' + email.split('@')[0] + ')' : wantName;
        t = { id: db.nextTid++, name: nm.slice(0, 60), punches: 0, email: email };
        db.teachers.push(t);
        ch.teachersAdded.push(t);
        added = true;
      }
      if (!t) return fail('no-teacher', 'That teacher is not on the list.');
      if (!added && email && t.email === email) ch.teachersUpdated.push(t); // keeps a newly learned email on the Sheet
    }
    if (order.pay === 'punch') {
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
    if (a === 'poll') return { resp: snapshot(db, now, day), changes: null };
    if (a === 'punchPoll') return { resp: punchSnapshot(db, now), changes: null };
    if (a === 'addOrder') {
      var ro = req.order || {};
      var pinOk = !!(ro.override && db.pinHash && req.pinHash === db.pinHash);
      if (ro.override && !pinOk) return fail('bad-pin', 'That PIN is not right.');
      return addOrder(db, ro, now, day, pinOk || !!ro.late);
    }
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

  return { newDb: newDb, handle: handle, snapshot: snapshot, orderDay: orderDay, isSchoolDay: isSchoolDay, drinksOn: drinksOn, dayInfo: dayInfo, openDays: openDays, maxDrinks: maxDrinks, addDays: addDays };
})();

// ---- end shared rules ----

var TABS = {
  orders: ['id', 'num', 'day', 'createdAt', 'time', 'name', 'method', 'room', 'items', 'itemsText', 'pay', 'teacherId', 'teacherName', 'balanceAfter', 'status', 'doneAt', 'forDate', 'source'],
  teachers: ['id', 'name', 'punches', 'email'],
  punches: ['t', 'time', 'teacherId', 'name', 'delta', 'note'],
  cards: ['cardNo', 'teacherId', 't', 'time'],
  config: ['key', 'value'],
  daysoff: ['date', 'note']
};
// First-time contents. After that the lead teacher edits these on the Sheet.
var CONFIG_DEFAULTS = [
  ['maxDrinks', ''],     // most drinks of ALL kinds on one day. Leave blank for no limit.
  ['maxCoffee', '20'],   // most coffee drinks (mocha, latte, americano, hot chocolate, steamer) on one day. Sodas, Lotus and tea are not counted. Blank = no limit.
  ['daysAhead', '5'],    // how many school days ahead teachers can order
  ['orderDay', ''],      // the day counter orders are for. Blank = the next school day. Type "today", or a date like 2026-11-03, to change it.
  ['lastDay', '2027-06-15'] // last day of school: no orders after this
];
// Weekends are skipped automatically. These are the no-school days from the 2026-27 Reynolds calendar.
var DAYS_OFF_SEED = [
  ['2026-10-09', 'No school'], ['2026-10-19', 'No school'], ['2026-11-06', 'No school'], ['2026-11-11', 'No school'],
  ['2026-11-23', 'No school'], ['2026-11-24', 'Conferences, no school'], ['2026-11-25', 'Conferences, no school'],
  ['2026-11-26', 'No school'], ['2026-11-27', 'No school'],
  ['2026-12-21', 'Winter break'], ['2026-12-22', 'Winter break'], ['2026-12-23', 'Winter break'], ['2026-12-24', 'Winter break'],
  ['2026-12-25', 'Winter break'], ['2026-12-28', 'Winter break'], ['2026-12-29', 'Winter break'], ['2026-12-30', 'Winter break'],
  ['2026-12-31', 'Winter break'], ['2027-01-01', 'Winter break'], ['2027-01-18', 'No school'], ['2027-02-01', 'No school'],
  ['2027-02-15', 'No school'], ['2027-03-22', 'Spring break'], ['2027-03-23', 'Spring break'], ['2027-03-24', 'Spring break'],
  ['2027-03-25', 'Spring break'], ['2027-03-26', 'Spring break'], ['2027-03-29', 'Spring break'], ['2027-04-09', 'No school'],
  ['2027-04-19', 'No school'], ['2027-05-10', 'No school'], ['2027-05-31', 'No school']
];
var TEXT_COLS = {
  orders: [1, 3, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 18],
  teachers: [2, 4],
  punches: [4, 6],
  cards: [1],
  config: [1, 2],
  daysoff: [2]
};
var RECENT_ORDER_ROWS = 500;

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
  var readOnly = req.action === 'poll' || req.action === 'punchPoll' || req.action === 'verifyPin';
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
    var loaded = loadDb_(ss, tz, req.action === 'export' ? 'full' : req.action === 'punchPoll' ? 'punch' : 'normal');
    var result = CartLogic.handle(loaded.db, req, now, day);
    if (result.changes) saveChanges_(ss, tz, loaded, result.changes);
    if (req.action === 'addOrder' && result.resp.ok && result.changes && result.changes.ordersAdded.length) {
      var oa = result.changes.ordersAdded[0];
      // a day just filled up: take it off the teacher form
      if (CartLogic.dayInfo(loaded.db, oa.forDate).full) {
        try { refreshForm_(loaded.db, day, tz); } catch (x) { /* the form is only a convenience */ }
      }
    }
    return result.resp;
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ---------- sheet helpers ----------
function ensureTabs_(ss) {
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh && sh.getLastColumn() < TABS[name].length) { // an older sheet is missing newer columns: add their headings
      var have = Math.max(sh.getLastColumn(), 1);
      sh.getRange(1, have + 1, 1, TABS[name].length - have).setValues([TABS[name].slice(have)]);
    }
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
      sh.setFrozenRows(1);
      if (name === 'daysoff') {
        sh.getRange(2, 1, DAYS_OFF_SEED.length, 2).setValues(DAYS_OFF_SEED);
        sh.setColumnWidth(2, 220);
        sh.getRange(1, 4).setValue('Add a row for any day with no coffee cart (field trip, assembly...). Weekends are skipped automatically.');
      }
    }
    (TEXT_COLS[name] || []).forEach(function (c) {
      sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  });
  var cf = ss.getSheetByName('config');
  var haveKeys = {};
  if (cf.getLastRow() >= 2) cf.getRange(2, 1, cf.getLastRow() - 1, 1).getValues().forEach(function (r) { haveKeys[String(r[0])] = true; });
  if (!haveKeys.maxCoffee && haveKeys.maxDrinks) { // older sheet: the old overall 20 now becomes the coffee limit
    cf.getRange(2, 1, cf.getLastRow() - 1, 2).getValues().forEach(function (r, i) {
      if (String(r[0]) === 'maxDrinks' && String(r[1]) === '20') cf.getRange(i + 2, 2).setValue('');
    });
  }
  CONFIG_DEFAULTS.forEach(function (kv) {
    if (!haveKeys[kv[0]]) appendRows_(cf, [kv]);
  });
  var os = ss.getSheetByName('orders'); // lets the lead teacher pick open / done / cancelled from a list
  os.getRange(2, 15, Math.max(os.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['open', 'done', 'cancelled'], true).setAllowInvalid(true).build());
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
function normDay_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) { var a = s.split('-'); return a[0] + '-' + ('0' + a[1]).slice(-2) + '-' + ('0' + a[2]).slice(-2); }
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return '';
}
function num_(v, dflt) {
  var n = parseInt(v, 10);
  return isNaN(n) ? dflt : n;
}
function readRows_(sh, firstRow, count, cols) {
  if (count < 1) return [];
  return sh.getRange(firstRow, 1, count, cols).getValues();
}

function loadDb_(ss, tz, mode) {
  var full = mode === 'full';
  var db = CartLogic.newDb();
  var rows = {};

  var os = ss.getSheetByName('orders');
  var oLast = os.getLastRow();
  var oFirst = full ? 2 : Math.max(2, oLast - RECENT_ORDER_ROWS + 1);
  var oRows = (mode !== 'punch' && oLast >= 2) ? readRows_(os, oFirst, oLast - oFirst + 1, TABS.orders.length) : [];
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
      done: text_(r[14]) === 'done', cancelled: text_(r[14]) === 'cancelled', doneAt: r[15] === '' ? null : num_(r[15], null),
      forDate: r[16] === '' ? dayText_(r[2], tz) : dayText_(r[16], tz), source: text_(r[17])
    };
    db.orders.push(order);
    rows.orders[order.id] = oFirst + i;
  });

  var ts = ss.getSheetByName('teachers');
  var tLast = ts.getLastRow();
  var tRows = tLast >= 2 ? readRows_(ts, 2, tLast - 1, 4) : [];
  rows.teachers = {};
  var maxId = 0;
  tRows.forEach(function (r, i) {
    if (r[0] === '' || r[1] === '') return;
    var id = num_(r[0], 0);
    db.teachers.push({ id: id, name: text_(r[1]), punches: num_(r[2], 0), email: text_(r[3]).toLowerCase() });
    rows.teachers[id] = i + 2;
    if (id > maxId) maxId = id;
  });
  db.nextTid = maxId + 1;

  var ps = ss.getSheetByName('punches');
  var pLast = ps.getLastRow();
  var pFirst = full ? 2 : Math.max(2, pLast - (mode === 'punch' ? 39 : 14));
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
    if (r[0] === 'maxDrinks') db.config.maxDrinks = text_(r[1]);
    if (r[0] === 'maxCoffee') db.config.maxCoffee = text_(r[1]);
    if (r[0] === 'orderDay') db.config.orderDay = normDay_(r[1], tz) || text_(r[1]).trim().toLowerCase();
    if (r[0] === 'daysAhead') db.config.daysAhead = text_(r[1]);
    if (r[0] === 'lastDay') db.config.lastDay = normDay_(r[1], tz);
  });
  var ds = ss.getSheetByName('daysoff');
  var dLast = ds.getLastRow();
  (dLast >= 2 ? readRows_(ds, 2, dLast - 1, 1) : []).forEach(function (r) {
    var d = normDay_(r[0], tz);
    if (d) db.daysOff.push(d);
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
    o.teacherName, o.balanceAfter === null ? '' : o.balanceAfter, o.cancelled ? 'cancelled' : o.done ? 'done' : 'open', o.doneAt === null ? '' : o.doneAt,
    o.forDate, o.source || ''];
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

  appendRows_(ts, ch.teachersAdded.map(function (t) { return [t.id, t.name, t.punches, t.email || '']; }));
  ch.teachersUpdated.forEach(function (t) {
    var r = rows.teachers[t.id];
    if (r) ts.getRange(r, 3, 1, 2).setValues([[t.punches, t.email || '']]);
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


// =====================================================================
// Teacher order form
// Run createTeacherForm() once. It makes a Google Form for teachers, sends its answers to this
// Sheet, and every new answer becomes an order in the queue (for the day the teacher picked).
// =====================================================================
var MENU = {
  sauces: ['Mocha', 'Sugar Free White Mocha'],
  milks: ['Regular', 'Fat Free', 'Half & Half', 'Almond', 'Oat'],
  teas: ['Earl Grey', 'Decaf Earl Grey', 'Green Tea', 'English Breakfast'],
  flavors: ['Caramel', 'Hazelnut', 'Vanilla', 'Raspberry', 'Strawberry', 'Sour Gummy Worm'],
  sfFlavors: ['Raspberry', 'Strawberry', 'Vanilla'],
  drinks: [
    { id: 'mocha', name: 'Mocha', steps: ['temp', 'sauce', 'milk', 'flavor'], sauceRequired: true },
    { id: 'latte', name: 'Latte', steps: ['temp', 'milk', 'flavor', 'sauce'] },
    { id: 'americano', name: 'Americano', steps: ['temp', 'flavor', 'sauce'] },
    { id: 'hotchoc', name: 'Hot Chocolate', steps: ['milk', 'flavor', 'sauce'] },
    { id: 'steamer', name: 'Steamer', steps: ['milk', 'flavor', 'sauce'] },
    { id: 'lotus', name: 'Lotus (sugar free)', steps: ['flavor'] },
    { id: 'soda', name: 'Italian Soda', steps: ['flavor'] },
    { id: 'tea', name: 'Tea', steps: ['temp', 'tea', 'flavor'] }
  ]
};
var METHOD_DELIVERY = 'Delivery';
var METHOD_PICKUP = 'Pickup (I will come get it)';
var PAY_PUNCH = 'Punch card';
var PAY_OTHER = 'Another way (cash or other)';

function flavorChoices_(d) {
  var sf = MENU.sfFlavors.map(function (f) { return 'Sugar Free ' + f; });
  return d.sfOnly ? sf : MENU.flavors.concat(sf);
}
function createTeacherForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTabs_(ss);
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty('FORM_ID');
  if (existing) {
    var f = FormApp.openById(existing);
    return 'The teacher form already exists. Share this link with teachers: ' + f.getPublishedUrl();
  }
  var form = FormApp.create('Coffee Cart: Teacher Orders');
  form.setDescription('Order a drink from the Life Skills coffee cart. Students make and deliver it during delivery hour. Submit the form once for each drink.');
  try { form.setCollectEmail(true); form.setRequireLogin(true); } catch (e) { /* only some accounts allow this */ }
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Thank you! Your order is in. It will show up on the coffee cart queue on the day you picked.');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var map = { drinks: {} };
  map.teacher = form.addTextItem().setTitle('Your name').setHelpText('First and last name. Your school email is recorded too, so your punch card follows you.').setRequired(true).getId();
  map.method = form.addMultipleChoiceItem().setTitle('Delivery or pickup?').setChoiceValues([METHOD_DELIVERY, METHOD_PICKUP]).setRequired(true).getId();
  map.room = form.addTextItem().setTitle('Room number (for delivery)').setHelpText('Leave blank for pickup.').setRequired(false).getId();
  map.date = form.addListItem().setTitle('What day should it be delivered?').setHelpText('Days that are full are not listed.').setChoiceValues(['(loading)']).setRequired(true).getId();
  map.pay = form.addMultipleChoiceItem().setTitle('How are you paying?').setChoiceValues([PAY_PUNCH, PAY_OTHER]).setRequired(true).getId();
  var drinkQ = form.addMultipleChoiceItem().setTitle('Which drink would you like?').setRequired(true);
  map.drink = drinkQ.getId();

  var choices = [];
  MENU.drinks.forEach(function (d) {
    var page = form.addPageBreakItem().setTitle(d.name);
    page.setGoToPage(FormApp.PageNavigationType.SUBMIT); // after this drink's questions, finish the form
    var ids = {};
    d.steps.forEach(function (step) {
      if (step === 'temp') ids.temp = form.addMultipleChoiceItem().setTitle('Hot or iced?').setChoiceValues(['Hot', 'Iced']).setRequired(true).getId();
      if (step === 'sauce') {
        var q = form.addMultipleChoiceItem().setTitle(d.sauceRequired ? 'Sauce' : 'Add a sauce? (optional)').setChoiceValues(MENU.sauces).setRequired(!!d.sauceRequired);
        ids.sauce = q.getId();
      }
      if (step === 'milk') ids.milk = form.addMultipleChoiceItem().setTitle('Milk').setChoiceValues(MENU.milks).setRequired(true).getId();
      if (step === 'tea') ids.tea = form.addMultipleChoiceItem().setTitle('Which tea?').setChoiceValues(MENU.teas).setRequired(true).getId();
      if (step === 'flavor') ids.flavor = form.addCheckboxItem().setTitle('Flavors (optional, pick any)').setChoiceValues(flavorChoices_(d)).setRequired(false).getId();
    });
    ids.notes = form.addTextItem().setTitle('Notes (optional)').setHelpText('For example: just a splash of milk').setRequired(false).getId();
    map.drinks[d.id] = ids;
    choices.push(drinkQ.createChoice(d.name, page));
  });
  drinkQ.setChoices(choices);

  props.setProperty('FORM_ID', form.getId());
  props.setProperty('FORM_MAP', JSON.stringify(map));
  ScriptApp.newTrigger('onTeacherFormSubmit').forForm(form).onFormSubmit().create();
  ensureDailyRefresh_();

  var cf = ss.getSheetByName('config');
  appendRows_(cf, [['teacherFormLink', form.getPublishedUrl()], ['teacherFormEditLink', form.getEditUrl()]]);
  var shown = refreshTeacherChoices();
  return 'Teacher form created. Share this link with teachers: ' + form.getPublishedUrl() + '   (edit it here: ' + form.getEditUrl() + ')  ' + shown;
}

// ---------- which days the form offers ----------
function dayLabel_(iso, tz) {
  return Utilities.formatDate(new Date(iso + 'T12:00:00'), tz, 'EEE, MMM d');
}
function dayChoiceLabel_(d, tz) {
  var base = dayLabel_(d.date, tz);
  return d.left !== null && d.left <= 5 ? base + ' \u00B7 ' + d.left + (d.left === 1 ? ' drink left' : ' drinks left') : base;
}
// the form answer is a label such as "Tue, Oct 27"; find the date it means
function labelToDate_(answer, tz, today) {
  var a = String(answer || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return a;
  a = a.split(' \u00B7 ')[0];
  var d = today;
  for (var i = 0; i < 60; i++) {
    if (dayLabel_(d, tz) === a) return d;
    d = CartLogic.addDays(d, 1);
  }
  return a;
}
function refreshForm_(db, day, tz) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FORM_ID');
  if (!id) return 'There is no teacher form yet.';
  var map = JSON.parse(props.getProperty('FORM_MAP'));
  var form = FormApp.openById(id);
  var open = CartLogic.openDays(db, day).filter(function (d) { return !d.full; });
  if (!open.length) {
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage('The coffee cart is full for the next few school days. Please check back soon.');
    return 'The form is closed: every upcoming day is full.';
  }
  form.getItemById(map.date).asListItem().setChoiceValues(open.map(function (d) { return dayChoiceLabel_(d, tz); }));
  if (!form.isAcceptingResponses()) form.setAcceptingResponses(true);
  return 'The form offers ' + open.length + ' day(s).';
}
// Re-reads the Sheet and updates the days on the form. Runs by itself each morning and after a day fills up.
// Run it by hand (or use the Coffee Cart menu) after you change days off, the limit, or cancel an order.
function refreshTeacherChoices() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  ensureTabs_(ss);
  var day = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return refreshForm_(loadDb_(ss, tz, 'normal').db, day, tz);
}
function ensureDailyRefresh_() {
  var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'refreshTeacherChoices'; });
  if (!have) ScriptApp.newTrigger('refreshTeacherChoices').timeBased().everyDays(1).atHour(5).create();
}
// Run this once if your teacher form was made before the day limit existed. It swaps the date picker for the list of open days.
function upgradeTeacherForm() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FORM_ID');
  if (!id) return 'There is no teacher form yet. Run createTeacherForm instead.';
  var map = JSON.parse(props.getProperty('FORM_MAP'));
  var form = FormApp.openById(id);
  var old = form.getItemById(map.date);
  if (old && old.getType() !== FormApp.ItemType.LIST) {
    var at = old.getIndex();
    form.deleteItem(old);
    var li = form.addListItem().setTitle('What day should it be delivered?').setHelpText('Days that are full are not listed.').setChoiceValues(['(loading)']).setRequired(true);
    form.moveItem(li.getIndex(), at);
    map.date = li.getId();
    props.setProperty('FORM_MAP', JSON.stringify(map));
  }
  if (!map.method) { // older form: add the delivery-or-pickup question just above the room question
    var room = form.getItemById(map.room);
    var q = form.addMultipleChoiceItem().setTitle('Delivery or pickup?').setChoiceValues([METHOD_DELIVERY, METHOD_PICKUP]).setRequired(true);
    form.moveItem(q.getIndex(), room.getIndex());
    room.asTextItem().setTitle('Room number (for delivery)').setHelpText('Leave blank for pickup.').setRequired(false);
    map.method = q.getId();
    props.setProperty('FORM_MAP', JSON.stringify(map));
  }
  ensureDailyRefresh_();
  return 'Form upgraded. ' + refreshTeacherChoices();
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Coffee Cart').addItem('Update the days on the teacher form', 'refreshTeacherChoices').addToUi();
}

// Turn one form answer into an order request. answers = { <form item id>: response }
function buildFormRequest_(map, answers, responseId, email, tz, today) {
  var drinkName = answers[map.drink];
  var d = null;
  MENU.drinks.forEach(function (x) { if (x.name === drinkName) d = x; });
  if (!d) throw new Error('Unknown drink: ' + drinkName);
  var ids = map.drinks[d.id];
  var get = function (k) { return ids[k] ? answers[ids[k]] : undefined; };
  var temp = get('temp') || '';
  var flavors = get('flavor') || [];
  var lines = [];
  var sauce = get('sauce');
  if (sauce) lines.push('Sauce: ' + sauce);
  if (get('milk')) lines.push('Milk: ' + get('milk'));
  if (get('tea')) lines.push('Tea: ' + get('tea'));
  if (flavors.length) lines.push('Flavor: ' + flavors.join(', '));
  var notes = String(get('notes') || '').trim();
  if (notes) lines.push('Notes: ' + notes);
  var pay = answers[map.pay] === PAY_PUNCH ? 'punch' : 'other';
  var name = String(answers[map.teacher] || '').trim();
  return {
    action: 'addOrder',
    order: {
      id: 'form-' + responseId, name: name, method: answers[map.method] === METHOD_PICKUP ? 'pickup' : 'delivery',
      room: answers[map.method] === METHOD_PICKUP ? '' : String(answers[map.room] || '').trim(),
      forDate: tz && today ? labelToDate_(answers[map.date], tz, today) : String(answers[map.date] || ''), source: 'form',
      items: [{ title: (temp ? temp + ' ' : '') + d.name, detail: lines.length ? lines.join(' · ') : 'Plain' }],
      pay: pay, teacherName: pay === 'punch' ? name : '', teacherEmail: pay === 'punch' ? String(email || '').trim().toLowerCase() : ''
    }
  };
}

function onTeacherFormSubmit(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  try {
    var map = JSON.parse(props.getProperty('FORM_MAP'));
    var answers = {};
    e.response.getItemResponses().forEach(function (ir) { answers[ir.getItem().getId()] = ir.getResponse(); });
    var tz = ss.getSpreadsheetTimeZone();
    var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var email = e.response.getRespondentEmail();
    var req = buildFormRequest_(map, answers, e.response.getId(), email, tz, today);
    var out = run_(req);
    if (!out.ok && (out.error === 'full' || out.error === 'closed')) {
      notifyNotPlaced_(ss, tz, today, req.order, email, out);
    } else if (!out.ok) throw new Error(out.message || out.error);
    try { refreshTeacherChoices(); } catch (x) { /* the days on the form catch up at the next submission or the morning refresh */ }
  } catch (err) {
    // leave a note where the lead teacher can see it
    var cf = ss.getSheetByName('config');
    appendRows_(cf, [['formError ' + new Date().toISOString(), String(err && err.message ? err.message : err)]]);
  }
}

// A drink could not be placed because its day filled up: tell the teacher, and offer other days.
function notifyNotPlaced_(ss, tz, today, order, email, out) {
  var cf = ss.getSheetByName('config');
  var what = order.items[0].title;
  appendRows_(cf, [['notPlaced ' + new Date().toISOString(), order.name + ' / ' + what + ' / ' + order.forDate + ': ' + out.message]]);
  if (!email) return;
  var open = CartLogic.openDays(loadDb_(ss, tz, 'normal').db, today).filter(function (d) { return !d.full; });
  var link = PropertiesService.getScriptProperties().getProperty('FORM_ID') ? FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID')).getPublishedUrl() : '';
  var body = 'Hi ' + (order.name || 'there') + ',\n\n' +
    'Your ' + what + ' for ' + dayLabel_(order.forDate, tz) + ' could not be placed, because the coffee cart is already full that day. You were not charged a punch.\n\n' +
    (open.length ? 'These days still have room: ' + open.map(function (d) { return dayLabel_(d.date, tz); }).join(', ') + '.\nPlease order again and pick one of them' + (link ? ': ' + link : '.') :
      'Every day in the next few school days is full right now. Please try again in a day or two' + (link ? ': ' + link : '.')) +
    '\n\nThank you,\nThe Life Skills Coffee Cart';
  MailApp.sendEmail(email, 'Coffee cart: your ' + what + ' could not be placed', body);
}

// Start the teacher form over (for example after changing the questions). Delete the old form from Google Drive yourself.
function recreateTeacherForm() {
  var props = PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    var fn = tr.getHandlerFunction();
    if (fn === 'onTeacherFormSubmit' || fn === 'refreshTeacherChoices') ScriptApp.deleteTrigger(tr);
  });
  props.deleteProperty('FORM_ID');
  props.deleteProperty('FORM_MAP');
  return createTeacherForm();
}
