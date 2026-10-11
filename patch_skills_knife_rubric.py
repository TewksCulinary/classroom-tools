import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({count} occurrences): {label}")
    return src.replace(old, new, 1)

# ============================================================
# 1. CSS: new score-0 color + rubric level-button styles
# ============================================================
old = '''    .score-none { background: #ffffff; color: #5F5E5A; border-color: #D8D6D0; }
    .score-4 { background: #EAF3DE; color: #2E6B10; border-color: #B7DDA0; }
    .score-3 { background: #E8F0FB; color: #185FA5; border-color: #A8C0EE; }
    .score-2 { background: #FFF8E0; color: #7A5E00; border-color: #E3C468; }
    .score-1 { background: #FCEBEB; color: #C0392B; border-color: #E9A9A0; }'''
new = '''    .score-none { background: #ffffff; color: #5F5E5A; border-color: #D8D6D0; }
    .score-4 { background: #EAF3DE; color: #2E6B10; border-color: #B7DDA0; }
    .score-3 { background: #E8F0FB; color: #185FA5; border-color: #A8C0EE; }
    .score-2 { background: #FFF8E0; color: #7A5E00; border-color: #E3C468; }
    .score-1 { background: #FCEBEB; color: #C0392B; border-color: #E9A9A0; }
    .score-0 { background: #F1EFE8; color: #5F5E5A; border-color: #B4B2A9; }

    /* knife-skills rubric buttons */
    .level-btn { border: 2px solid #B4B2A9; border-radius: 10px; padding: 11px 14px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; text-align: left; background: #ffffff; color: #2C2C2A; }
    .level-btn:hover { background: #F1EFE8; }
    .level-btn.active { border-width: 3px; font-weight: 700; }
    .level-btn.lvl-0.active { background: #F1EFE8; border-color: #5F5E5A; color: #3A3934; }
    .level-btn.lvl-1.active { background: #FCEBEB; border-color: #C0392B; color: #791F1F; }
    .level-btn.lvl-2.active { background: #FFF8E0; border-color: #C09A20; color: #7A5E00; }
    .level-btn.lvl-3.active { background: #E8F0FB; border-color: #185FA5; color: #185FA5; }
    .level-btn.lvl-4.active { background: #EAF3DE; border-color: #3E8B18; color: #2E6B10; }'''
src = replace_once(src, old, new, "score-0 + level-btn CSS")

# ============================================================
# 2. HTML: give the legend/session-bar/indep-label stable ids, add the
#    knife-specific legend, and split the action panel into a standard
#    block (existing tally flow) and a new knife-rubric block.
# ============================================================
old = '''      <div class="legend">
        <span><span class="legend-dot" style="background:#3E8B18;"></span>4 &middot; Independent</span>
        <span><span class="legend-dot" style="background:#185FA5;"></span>3 &middot; Proficient</span>
        <span><span class="legend-dot" style="background:#C09A20;"></span>2 &middot; Emerging</span>
        <span><span class="legend-dot" style="background:#C0392B;"></span>1 &middot; Beginning</span>
      </div>

      <div class="session-bar">'''
new = '''      <div class="legend" id="legend-standard">
        <span><span class="legend-dot" style="background:#3E8B18;"></span>4 &middot; Independent</span>
        <span><span class="legend-dot" style="background:#185FA5;"></span>3 &middot; Proficient</span>
        <span><span class="legend-dot" style="background:#C09A20;"></span>2 &middot; Emerging</span>
        <span><span class="legend-dot" style="background:#C0392B;"></span>1 &middot; Beginning</span>
      </div>
      <div class="legend" id="legend-knife" style="display:none;">
        <span><span class="legend-dot" style="background:#3E8B18;"></span>Exemplary</span>
        <span><span class="legend-dot" style="background:#185FA5;"></span>Proficient</span>
        <span><span class="legend-dot" style="background:#C09A20;"></span>Developing</span>
        <span><span class="legend-dot" style="background:#C0392B;"></span>Guided Practice</span>
        <span><span class="legend-dot" style="background:#5F5E5A;"></span>No Effort</span>
      </div>

      <div class="session-bar" id="session-bar">'''
src = replace_once(src, old, new, "legend split + session-bar id")

old = '''      <div class="indep-toggle" onclick="toggleIndepList()">
        <b>&#10003; Independent on this skill</b>
        <span class="indep-count" id="indep-count">0</span>
      </div>'''
new = '''      <div class="indep-toggle" onclick="toggleIndepList()">
        <b id="indep-label">&#10003; Independent on this skill</b>
        <span class="indep-count" id="indep-count">0</span>
      </div>'''
src = replace_once(src, old, new, "indep-label id")

old = '''    <p class="panel-name" id="ap-name">Student</p>
    <p class="panel-sub"><span id="ap-skill"></span> &middot; this session: <b id="ap-tally">0</b> prompt(s) <span class="score-pill" id="ap-score-pill"></span></p>

    <button class="action-btn ab-prompt" onclick="tapPrompt()">+1 Prompt</button>
    <button class="action-btn ab-indep" onclick="tapMarkIndependent()">Mark Independent (Score 4)</button>
    <button class="action-btn ab-help" onclick="tapNeededHelp()">Needed Hands-On Help (Score 1)</button>
    <button class="action-btn ab-undo" id="ap-undo-btn" onclick="tapUndoIndependent()" style="display:none;">Move back to active list</button>

    <textarea class="note-input" id="ap-note-input" placeholder="Add a note (optional)..."></textarea>'''
new = '''    <p class="panel-name" id="ap-name">Student</p>
    <p class="panel-sub" id="ap-standard-sub"><span id="ap-skill"></span> &middot; this session: <b id="ap-tally">0</b> prompt(s) <span class="score-pill" id="ap-score-pill"></span></p>

    <div id="ap-standard-actions">
      <button class="action-btn ab-prompt" onclick="tapPrompt()">+1 Prompt</button>
      <button class="action-btn ab-indep" onclick="tapMarkIndependent()">Mark Independent (Score 4)</button>
      <button class="action-btn ab-help" onclick="tapNeededHelp()">Needed Hands-On Help (Score 1)</button>
      <button class="action-btn ab-undo" id="ap-undo-btn" onclick="tapUndoIndependent()" style="display:none;">Move back to active list</button>
    </div>

    <div id="ap-knife-rubric" style="display:none;">
      <p class="panel-sub" id="ap-knife-overall" style="margin-bottom:12px;"></p>
      <p style="font-size:12px;font-weight:700;color:#5F5E5A;margin:0 0 6px;">Guiding-hand claw (safety)</p>
      <div id="ap-claw-buttons" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;"></div>
      <p style="font-size:12px;font-weight:700;color:#5F5E5A;margin:0 0 6px;">Knife grip (technique)</p>
      <div id="ap-grip-buttons" style="display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <textarea class="note-input" id="ap-note-input" placeholder="Add a note (optional)..."></textarea>'''
src = replace_once(src, old, new, "action panel split (standard vs knife rubric)")

# ============================================================
# 3. JS: constants + overall-score rule, right after the skills/state vars
# ============================================================
old = "var skillStatus = {};          // skillStatus[classId][skill][student] = {score,tally,sessionsCount,lastSessionDate,firstMasteryDate,helpFlag}"
new = '''var skillStatus = {};          // skillStatus[classId][skill][student] = {score,tally,sessionsCount,lastSessionDate,firstMasteryDate,helpFlag,claw,grip}

// ------------------------------------------------------------
// Knife Skills rubric (Claw & Grip): a separately-rated skill with its
// own 5-level scale and a two-component overall-score rule, replacing
// the tally/prompt-counting flow used by every other skill.
// ------------------------------------------------------------
var KNIFE_SKILL_NAME = 'Knife Skills';
var KNIFE_LEVELS = ['No Effort', 'Guided Practice', 'Developing', 'Proficient', 'Exemplary'];
function isKnifeSkill(sk) { return sk === KNIFE_SKILL_NAME; }
function knifeLevelClass(lvl) { return (lvl===null||lvl===undefined) ? 'score-none' : 'score-'+lvl; }
// Rule, per the rubric: claw below Proficient(3) sets the overall rating to
// the claw rating outright, whatever grip is. At or above Proficient, grip
// can still cap the overall down to its own level (so "Proficient overall"
// needs grip >= Proficient too, and "Exemplary overall" needs both
// Exemplary) -- that upper-range behavior isn't spelled out for every
// combination in the rubric, so this fills the one unstated gap (claw >=
// Proficient but grip below it) the same way: the lower of the two governs.
function knifeOverall(claw, grip) {
  if (claw === null || claw === undefined) return null;
  if (claw < 3) return claw;
  if (grip === null || grip === undefined) return null;
  return Math.min(claw, grip);
}'''
src = replace_once(src, old, new, "knife rubric constants + knifeOverall()")

# ============================================================
# 4. JS: give new students a claw/grip slot too
# ============================================================
old = "  if (!bucket[name]) bucket[name] = {score:null, tally:0, sessionsCount:0, lastSessionDate:'', firstMasteryDate:'', helpFlag:false};"
new = "  if (!bucket[name]) bucket[name] = {score:null, tally:0, sessionsCount:0, lastSessionDate:'', firstMasteryDate:'', helpFlag:false, claw:null, grip:null};"
src = replace_once(src, old, new, "ensureStudentEntry() claw/grip default")

# ============================================================
# 5. JS: syncNow() -- mirror the computed overall into the score column for
#    Knife Skills rows (guarding against 0 = No Effort being falsy in JS).
# ============================================================
old = '''          var st = (skillStatus[c.id] && skillStatus[c.id][sk] && skillStatus[c.id][sk][name]) || null;
          if (!st) return;
          rows2.push([c.id, c.name, sk, name, st.score||'', st.tally||0, st.sessionsCount||0, st.lastSessionDate||'', st.firstMasteryDate||'']);'''
new = '''          var st = (skillStatus[c.id] && skillStatus[c.id][sk] && skillStatus[c.id][sk][name]) || null;
          if (!st) return;
          var scoreOut;
          if (isKnifeSkill(sk)) {
            var ov = knifeOverall(st.claw, st.grip);
            scoreOut = (ov===null||ov===undefined) ? '' : ov;
          } else {
            scoreOut = st.score||'';
          }
          rows2.push([c.id, c.name, sk, name, scoreOut, st.tally||0, st.sessionsCount||0, st.lastSessionDate||'', st.firstMasteryDate||'']);'''
src = replace_once(src, old, new, "syncNow() knife overall in score column")

# ============================================================
# 6. JS: renderGrid() -- knife-specific card rendering + mastered-label text
# ============================================================
old = '''function renderGrid() {
  var cls = activeClass();
  var wrap = document.getElementById('student-grid-wrap');
  var indepSection = document.getElementById('indep-section');
  if (!cls || !activeSkill) {
    wrap.innerHTML = '<div class="empty-state">Connect a Sheet with at least one class to get started.</div>';
    indepSection.style.display = 'none';
    return;
  }
  var bucket = ensureStatusBucket(cls.id, activeSkill);
  var active = [], indep = [];
  cls.students.forEach(function(name){
    var st = bucket[name];
    if (st && st.score === 4) indep.push(name); else active.push(name);
  });

  if (!active.length) {
    wrap.innerHTML = '<div class="empty-state">Everyone here has reached Independent on '+activeSkill+'. &#127881;</div>';
  } else {
    wrap.innerHTML = '<div class="student-grid">' + active.map(function(name){
      var st = bucket[name] || {tally:0, score:null};
      var notYetInSession = !st.lastSessionDate && !st.tally && !st.helpFlag;
      var cardClass = notYetInSession ? 'score-none' : scoreClass(st.helpFlag ? 1 : (st.tally===0 ? 4 : st.tally<=2 ? 3 : 2));
      var tallyTxt = notYetInSession ? 'Not yet assessed' : (st.tally ? st.tally+' prompt'+(st.tally!==1?'s':'') : 'No prompts yet');
      return '<div class="stu-card '+cardClass+'" onclick="openPanel(\\''+name.replace(/'/g,"\\\\'")+'\\')">'
        + '<div class="stu-name">'+name+'</div>'
        + '<div class="stu-tally">'+tallyTxt+'</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  if (indep.length) {
    indepSection.style.display = 'block';
    document.getElementById('indep-count').textContent = indep.length;
    document.getElementById('indep-body').innerHTML = indep.map(function(name){
      return '<span class="indep-chip" onclick="openPanel(\\''+name.replace(/'/g,"\\\\'")+'\\')">&#10003; '+name+'</span>';
    }).join('');
  } else {
    indepSection.style.display = 'none';
  }
}'''
new = '''function renderGrid() {
  var cls = activeClass();
  var wrap = document.getElementById('student-grid-wrap');
  var indepSection = document.getElementById('indep-section');
  if (!cls || !activeSkill) {
    wrap.innerHTML = '<div class="empty-state">Connect a Sheet with at least one class to get started.</div>';
    indepSection.style.display = 'none';
    return;
  }
  var bucket = ensureStatusBucket(cls.id, activeSkill);
  var knife = isKnifeSkill(activeSkill);
  var masteredLabel = knife ? 'Exemplary' : 'Independent';
  var active = [], indep = [];
  cls.students.forEach(function(name){
    var st = bucket[name];
    var mastered = knife ? (st && knifeOverall(st.claw, st.grip) === 4) : (st && st.score === 4);
    if (mastered) indep.push(name); else active.push(name);
  });

  if (!active.length) {
    wrap.innerHTML = '<div class="empty-state">Everyone here has reached '+masteredLabel+' on '+activeSkill+'. &#127881;</div>';
  } else if (knife) {
    wrap.innerHTML = '<div class="student-grid">' + active.map(function(name){
      var st = bucket[name] || {claw:null, grip:null};
      var overall = knifeOverall(st.claw, st.grip);
      var cardClass = knifeLevelClass(overall);
      var subTxt = (st.claw===null && st.grip===null) ? 'Not yet assessed'
        : 'Claw: '+(st.claw===null?'-':KNIFE_LEVELS[st.claw])+' &middot; Grip: '+(st.grip===null?'-':KNIFE_LEVELS[st.grip]);
      return '<div class="stu-card '+cardClass+'" onclick="openPanel(\\''+name.replace(/'/g,"\\\\'")+'\\')">'
        + '<div class="stu-name">'+name+'</div>'
        + '<div class="stu-tally">'+subTxt+'</div>'
        + '</div>';
    }).join('') + '</div>';
  } else {
    wrap.innerHTML = '<div class="student-grid">' + active.map(function(name){
      var st = bucket[name] || {tally:0, score:null};
      var notYetInSession = !st.lastSessionDate && !st.tally && !st.helpFlag;
      var cardClass = notYetInSession ? 'score-none' : scoreClass(st.helpFlag ? 1 : (st.tally===0 ? 4 : st.tally<=2 ? 3 : 2));
      var tallyTxt = notYetInSession ? 'Not yet assessed' : (st.tally ? st.tally+' prompt'+(st.tally!==1?'s':'') : 'No prompts yet');
      return '<div class="stu-card '+cardClass+'" onclick="openPanel(\\''+name.replace(/'/g,"\\\\'")+'\\')">'
        + '<div class="stu-name">'+name+'</div>'
        + '<div class="stu-tally">'+tallyTxt+'</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  if (indep.length) {
    indepSection.style.display = 'block';
    document.getElementById('indep-count').textContent = indep.length;
    document.getElementById('indep-label').innerHTML = '&#10003; '+masteredLabel+' on this skill';
    document.getElementById('indep-body').innerHTML = indep.map(function(name){
      return '<span class="indep-chip" onclick="openPanel(\\''+name.replace(/'/g,"\\\\'")+'\\')">&#10003; '+name+'</span>';
    }).join('');
  } else {
    indepSection.style.display = 'none';
  }
}'''
src = replace_once(src, old, new, "renderGrid() knife branch")

# ============================================================
# 7. JS: renderAll() -- show/hide the right legend + session bar
# ============================================================
old = '''function renderAll() {
  renderPeriodTabs();
  renderSkillTabs();
  renderSessionInfo();
  renderGrid();
}'''
new = '''function updateSkillChrome() {
  var knife = isKnifeSkill(activeSkill);
  var std = document.getElementById('legend-standard');
  var kn = document.getElementById('legend-knife');
  var sessionBar = document.getElementById('session-bar');
  if (std) std.style.display = knife ? 'none' : 'flex';
  if (kn) kn.style.display = knife ? 'flex' : 'none';
  if (sessionBar) sessionBar.style.display = knife ? 'none' : 'flex';
}

function renderAll() {
  renderPeriodTabs();
  renderSkillTabs();
  updateSkillChrome();
  renderSessionInfo();
  renderGrid();
}'''
src = replace_once(src, old, new, "renderAll() + updateSkillChrome()")

# ============================================================
# 8. JS: startNewSession() -- guard against the (now hidden) session flow
#    being triggered while on Knife Skills.
# ============================================================
old = '''function startNewSession() {
  var cls = activeClass(); if (!cls || !activeSkill) return;'''
new = '''function startNewSession() {
  var cls = activeClass(); if (!cls || !activeSkill) return;
  if (isKnifeSkill(activeSkill)) { alert('Knife Skills doesn\\'t use lab sessions \\u2014 just tap a student and set their claw and grip level directly.'); return; }'''
src = replace_once(src, old, new, "startNewSession() knife guard")

# ============================================================
# 9. JS: openPanel() -- branch between the standard tally UI and the new
#    two-component rubric UI.
# ============================================================
old = '''function openPanel(name) {
  actionStudent = name;
  var cls = activeClass();
  var st = ensureStudentEntry(cls.id, activeSkill, name);
  document.getElementById('ap-name').textContent = name;
  document.getElementById('ap-skill').textContent = activeSkill;
  document.getElementById('ap-tally').textContent = st.tally || 0;
  var pill = document.getElementById('ap-score-pill');
  var notYetInSession = !st.lastSessionDate && !st.tally && !st.helpFlag && st.score !== 4;
  if (notYetInSession) {
    pill.textContent = 'Not yet assessed';
    pill.className = 'score-pill score-none';
  } else {
    var displayScore = st.score || (st.helpFlag ? 1 : (st.tally===0?4:st.tally<=2?3:2));
    pill.textContent = scoreLabel(displayScore) + ' (' + displayScore + ')';
    pill.className = 'score-pill ' + scoreClass(displayScore);
  }
  document.getElementById('ap-note-input').value = '';
  document.getElementById('ap-undo-btn').style.display = st.score===4 ? 'block' : 'none';
  document.getElementById('action-overlay').classList.add('visible');
  document.getElementById('action-panel').classList.add('visible');
}'''
new = '''function renderKnifeButtons(st) {
  var overall = knifeOverall(st.claw, st.grip);
  var overallEl = document.getElementById('ap-knife-overall');
  overallEl.innerHTML = (overall===null)
    ? 'Overall: <span class="score-pill score-none">Not yet assessed</span>'
    : 'Overall: <span class="score-pill '+knifeLevelClass(overall)+'">'+KNIFE_LEVELS[overall]+'</span>';
  document.getElementById('ap-claw-buttons').innerHTML = KNIFE_LEVELS.map(function(label, i){
    return '<button class="level-btn lvl-'+i+(st.claw===i?' active':'')+'" onclick="setClawLevel('+i+')">'+label+'</button>';
  }).reverse().join('');
  document.getElementById('ap-grip-buttons').innerHTML = KNIFE_LEVELS.map(function(label, i){
    return '<button class="level-btn lvl-'+i+(st.grip===i?' active':'')+'" onclick="setGripLevel('+i+')">'+label+'</button>';
  }).reverse().join('');
}

function openPanel(name) {
  actionStudent = name;
  var cls = activeClass();
  var st = ensureStudentEntry(cls.id, activeSkill, name);
  document.getElementById('ap-name').textContent = name;
  document.getElementById('ap-skill').textContent = activeSkill;
  var knife = isKnifeSkill(activeSkill);
  document.getElementById('ap-standard-sub').style.display = knife ? 'none' : 'block';
  document.getElementById('ap-standard-actions').style.display = knife ? 'none' : 'block';
  document.getElementById('ap-knife-rubric').style.display = knife ? 'block' : 'none';
  if (knife) {
    renderKnifeButtons(st);
  } else {
    document.getElementById('ap-tally').textContent = st.tally || 0;
    var pill = document.getElementById('ap-score-pill');
    var notYetInSession = !st.lastSessionDate && !st.tally && !st.helpFlag && st.score !== 4;
    if (notYetInSession) {
      pill.textContent = 'Not yet assessed';
      pill.className = 'score-pill score-none';
    } else {
      var displayScore = st.score || (st.helpFlag ? 1 : (st.tally===0?4:st.tally<=2?3:2));
      pill.textContent = scoreLabel(displayScore) + ' (' + displayScore + ')';
      pill.className = 'score-pill ' + scoreClass(displayScore);
    }
    document.getElementById('ap-undo-btn').style.display = st.score===4 ? 'block' : 'none';
  }
  document.getElementById('ap-note-input').value = '';
  document.getElementById('action-overlay').classList.add('visible');
  document.getElementById('action-panel').classList.add('visible');
}

function setClawLevel(i) {
  if (!actionStudent) return;
  var cls = activeClass();
  var st = currentStudentEntry();
  st.claw = i;
  st.lastSessionDate = new Date().toISOString().slice(0,10);
  saveLocal();
  queueLog(cls.id, cls.name, activeSkill, actionStudent, 'claw_set', 0, i, '');
  renderKnifeButtons(st);
  renderGrid();
  syncNow();
}
function setGripLevel(i) {
  if (!actionStudent) return;
  var cls = activeClass();
  var st = currentStudentEntry();
  st.grip = i;
  st.lastSessionDate = new Date().toISOString().slice(0,10);
  saveLocal();
  queueLog(cls.id, cls.name, activeSkill, actionStudent, 'grip_set', 0, i, '');
  renderKnifeButtons(st);
  renderGrid();
  syncNow();
}'''
src = replace_once(src, old, new, "openPanel() knife branch + setClawLevel/setGripLevel")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK - Knife Skills reworked into a two-component (claw/grip) rubric with direct level buttons, replacing the prompt-tally flow for that skill only")
