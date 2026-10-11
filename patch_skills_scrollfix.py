import sys

# Fixes "classes break off the screen and I can't scroll": .tab-row already had
# overflow-x:auto, but the scrollbar is hidden on every platform and nothing
# lets a plain mouse wheel move it sideways -- so without a touchscreen/trackpad
# swipe gesture, it was genuinely stuck. Adds visible left/right arrow buttons
# (shown only when the row actually overflows) and converts vertical wheel
# scrolling into horizontal scrolling while hovering the row, so it works with
# any input device.

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({count} occurrences): {label}")
    return src.replace(old, new, 1)

# 1. CSS: wrap the tab-row in a flex container with arrow buttons on either side
old = '''    /* tabs */
    .tab-row { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 8px; -ms-overflow-style: none; scrollbar-width: none; }
    .tab-row::-webkit-scrollbar { display: none; }'''
new = '''    /* tabs */
    .tab-row-wrap { display: flex; align-items: center; gap: 4px; }
    .tab-row { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 8px; -ms-overflow-style: none; scrollbar-width: none; flex: 1; min-width: 0; }
    .tab-row::-webkit-scrollbar { display: none; }
    .tab-scroll-btn { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid #B4B2A9; background: #ffffff; color: #5F5E5A; font-size: 13px; font-weight: 700; cursor: pointer; display: none; align-items: center; justify-content: center; padding: 0; }
    .tab-scroll-btn:hover { background: #F1EFE8; }
    .tab-scroll-btn.visible { display: flex; }'''
src = replace_once(src, old, new, "tab-row CSS + scroll button CSS")

# 2. HTML: wrap each tab-row with left/right arrow buttons
old = '''      <div class="tab-row" id="period-tabs"></div>
      <div class="tab-row" id="skill-tabs"></div>'''
new = '''      <div class="tab-row-wrap">
        <button class="tab-scroll-btn" id="period-tabs-left" onclick="scrollTabRow('period-tabs',-1)">&#8249;</button>
        <div class="tab-row" id="period-tabs"></div>
        <button class="tab-scroll-btn" id="period-tabs-right" onclick="scrollTabRow('period-tabs',1)">&#8250;</button>
      </div>
      <div class="tab-row-wrap">
        <button class="tab-scroll-btn" id="skill-tabs-left" onclick="scrollTabRow('skill-tabs',-1)">&#8249;</button>
        <div class="tab-row" id="skill-tabs"></div>
        <button class="tab-scroll-btn" id="skill-tabs-right" onclick="scrollTabRow('skill-tabs',1)">&#8250;</button>
      </div>'''
src = replace_once(src, old, new, "tab-row HTML wrap with arrow buttons")

# 3. JS: scroll helpers -- wheel-to-horizontal, arrow-button scrolling, and
#    showing/hiding the arrows based on whether the row actually overflows.
#    Hooked onto both rows right after init() wires up the page, and re-checked
#    after any render that could change row contents (renderPeriodTabs /
#    renderSkillTabs already run every time classes/skills change).
old = "function showPhase(id) {"
new = '''function scrollTabRow(id, dir) {
  var el = document.getElementById(id);
  if (!el) return;
  el.scrollBy({ left: dir * 160, behavior: 'smooth' });
}
function updateTabScrollArrows(id) {
  var el = document.getElementById(id);
  var left = document.getElementById(id+'-left');
  var right = document.getElementById(id+'-right');
  if (!el || !left || !right) return;
  var overflowing = el.scrollWidth > el.clientWidth + 2;
  left.classList.toggle('visible', overflowing && el.scrollLeft > 2);
  right.classList.toggle('visible', overflowing && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
}
function enableHWheelScroll(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('wheel', function(e) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already a horizontal gesture, let it through
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  el.addEventListener('scroll', function(){ updateTabScrollArrows(id); });
  window.addEventListener('resize', function(){ updateTabScrollArrows(id); });
}

function showPhase(id) {'''
src = replace_once(src, old, new, "scroll helper functions")

# 4. Wire the wheel listeners up once at startup, and re-check arrow visibility
#    every time the tab rows are (re)rendered.
old = "function init() {\n  document.getElementById('sa-email-display').textContent = SA_EMAIL;"
new = '''function init() {
  document.getElementById('sa-email-display').textContent = SA_EMAIL;
  enableHWheelScroll('period-tabs');
  enableHWheelScroll('skill-tabs');'''
src = replace_once(src, old, new, "init() wheel-scroll wiring")

old = '''function renderPeriodTabs() {
  var el = document.getElementById('period-tabs');
  el.innerHTML = classes.map(function(c){
    return '<button class="period-tab '+(c.id===activeClassId?'active':'')+'" onclick="switchClass(\\''+c.id+'\\')">'+c.name+'</button>';
  }).join('');
  var cls = activeClass();
  document.getElementById('class-name-label').textContent = cls ? cls.name+' \\u00b7 '+cls.students.length+' students' : 'No classes found in your Sheet yet.';
}'''
new = '''function renderPeriodTabs() {
  var el = document.getElementById('period-tabs');
  el.innerHTML = classes.map(function(c){
    return '<button class="period-tab '+(c.id===activeClassId?'active':'')+'" onclick="switchClass(\\''+c.id+'\\')">'+c.name+'</button>';
  }).join('');
  var cls = activeClass();
  document.getElementById('class-name-label').textContent = cls ? cls.name+' \\u00b7 '+cls.students.length+' students' : 'No classes found in your Sheet yet.';
  updateTabScrollArrows('period-tabs');
}'''
src = replace_once(src, old, new, "renderPeriodTabs() arrow refresh")

old = '''function renderSkillTabs() {
  var el = document.getElementById('skill-tabs');
  el.innerHTML = skills.map(function(sk){
    return '<button class="skill-tab '+(sk===activeSkill?'active':'')+'" onclick="switchSkill(\\''+sk.replace(/'/g,"\\\\'")+'\\')">'+sk+'</button>';
  }).join('') + '<button class="skill-tab-add" onclick="openSkillManager()">+ Skill</button>';
}'''
new = '''function renderSkillTabs() {
  var el = document.getElementById('skill-tabs');
  el.innerHTML = skills.map(function(sk){
    return '<button class="skill-tab '+(sk===activeSkill?'active':'')+'" onclick="switchSkill(\\''+sk.replace(/'/g,"\\\\'")+'\\')">'+sk+'</button>';
  }).join('') + '<button class="skill-tab-add" onclick="openSkillManager()">+ Skill</button>';
  updateTabScrollArrows('skill-tabs');
}'''
src = replace_once(src, old, new, "renderSkillTabs() arrow refresh")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK - tab rows now have visible scroll arrows + mouse-wheel horizontal scroll support")
