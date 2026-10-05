import sys

# Harden the screen-navigation functions (goToSetup, requestLogReview, openLogReview,
# launchSetup, saveToHistory) so that an exception anywhere in their rendering/archiving
# logic can never again silently leave the user stuck on the current screen -- matching
# the same fail-safe approach already applied to flushStaleLog(). Each function now
# guarantees the phase actually switches (showPhase runs unconditionally, outside any
# try block that could skip it) even if something downstream throws on unexpected data.

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({count} occurrences): {label}")
    return src.replace(old, new, 1)

# 1. saveToHistory(): never let a bad entry/data shape throw out of this function
old = '''function saveToHistory() {
  var sess = currentSession();
  if (!sess.log || !sess.log.length) return;
  var d = currentLabData();
  var cls = classById(activeClassId);
  var notesEl = document.getElementById('notes');
  var entry = {
    id: uid(),
    date: new Date().toLocaleDateString([],{year:'numeric',month:'long',day:'numeric'}),
    dateKey: new Date().toISOString().slice(0,10),
    labName: sess.labName || 'Lesson',
    className: cls ? cls.name : '',
    classId: activeClassId,
    mode: sess.mode || 'group',
    groups: JSON.parse(JSON.stringify(d.groups||[])),
    studentGroups: JSON.parse(JSON.stringify(d.studentGroups||{})),
    studentRoles: JSON.parse(JSON.stringify(d.studentRoles||{})),
    log: JSON.parse(JSON.stringify(sess.log||[])),
    notes: notesEl ? notesEl.value : ''
  };
  var existIdx = -1;
  for (var i = 0; i < obsHistory.length; i++) {
    if (obsHistory[i].dateKey===entry.dateKey && obsHistory[i].classId===entry.classId && obsHistory[i].labName===entry.labName) {
      existIdx = i; break;
    }
  }
  if (existIdx >= 0) obsHistory[existIdx] = entry; else obsHistory.unshift(entry);
  save();
}'''
new = '''function saveToHistory() {
  try {
    var sess = currentSession();
    if (!sess.log || !sess.log.length) return;
    var d = currentLabData();
    var cls = classById(activeClassId);
    var notesEl = document.getElementById('notes');
    var entry = {
      id: uid(),
      date: new Date().toLocaleDateString([],{year:'numeric',month:'long',day:'numeric'}),
      dateKey: new Date().toISOString().slice(0,10),
      labName: sess.labName || 'Lesson',
      className: cls ? cls.name : '',
      classId: activeClassId,
      mode: sess.mode || 'group',
      groups: JSON.parse(JSON.stringify(d.groups||[])),
      studentGroups: JSON.parse(JSON.stringify(d.studentGroups||{})),
      studentRoles: JSON.parse(JSON.stringify(d.studentRoles||{})),
      log: JSON.parse(JSON.stringify(sess.log||[])),
      notes: notesEl ? notesEl.value : ''
    };
    var existIdx = -1;
    for (var i = 0; i < obsHistory.length; i++) {
      if (obsHistory[i].dateKey===entry.dateKey && obsHistory[i].classId===entry.classId && obsHistory[i].labName===entry.labName) {
        existIdx = i; break;
      }
    }
    if (existIdx >= 0) obsHistory[existIdx] = entry; else obsHistory.unshift(entry);
    save();
  } catch (err) {
    console.warn('saveToHistory() failed; navigation will still proceed, but this lesson was not archived:', err);
  }
}'''
src = replace_once(src, old, new, "saveToHistory() fail-safe")

# 2. launchSetup(): showPhase runs first (unconditionally); the rest is best-effort
old = '''function launchSetup() {
  setupActiveGroup = null;
  showPhase('phase-setup');
  renderSetupClassTabs();
  setSetupMode('group');
  renderSetupGroupBtns();
  renderStudentAssignGrid();
  document.getElementById('random-panel').style.display = 'none';
  document.getElementById('prev-panel').style.display = 'none';
  var d = currentLabData();
  var gc = d.groups ? d.groups.length : 8;
  var sel = document.getElementById('random-group-count');
  if (sel) sel.value = String(Math.min(Math.max(gc,2),8));
}'''
new = '''function launchSetup() {
  setupActiveGroup = null;
  showPhase('phase-setup');
  try {
    renderSetupClassTabs();
    setSetupMode('group');
    renderSetupGroupBtns();
    renderStudentAssignGrid();
    document.getElementById('random-panel').style.display = 'none';
    document.getElementById('prev-panel').style.display = 'none';
    var d = currentLabData();
    var gc = d.groups ? d.groups.length : 8;
    var sel = document.getElementById('random-group-count');
    if (sel) sel.value = String(Math.min(Math.max(gc,2),8));
  } catch (err) {
    console.warn('launchSetup() ran into an error while rendering; the Setup screen may be incomplete:', err);
  }
}'''
src = replace_once(src, old, new, "launchSetup() fail-safe")

# 3. openLogReview(): showPhase runs first (unconditionally); the rest is best-effort
old = '''function openLogReview() {
  reviewActiveClassId = activeClassId;
  reviewCategoryFilter = null;
  showPhase('phase-review');
  renderReviewClassTabs();
  renderReviewCategoryFilters();
  renderReview();
}'''
new = '''function openLogReview() {
  reviewActiveClassId = activeClassId;
  reviewCategoryFilter = null;
  showPhase('phase-review');
  try {
    renderReviewClassTabs();
    renderReviewCategoryFilters();
    renderReview();
  } catch (err) {
    console.warn('openLogReview() ran into an error while rendering; the Review screen may be incomplete:', err);
  }
}'''
src = replace_once(src, old, new, "openLogReview() fail-safe")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK - goToSetup/requestLogReview path (saveToHistory, launchSetup, openLogReview) hardened against silent navigation failure")
