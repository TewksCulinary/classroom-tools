import sys

# Adds an "Add a class" capability to Settings -> Rosters, so Valerie can
# create a new class (e.g. a throwaway "test class" to demo a feature to a
# colleague, or a real section added mid-year) without re-running the
# one-time setup wizard. Mirrors the same id/passData/watchList/cfg.classes
# pattern saveSetup() already uses.

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({count} occurrences): {label}")
    return src.replace(old, new, 1)

# 1. HTML: new "Add a class" section right above the existing roster editor.
old = '''    <!-- Rosters -->
    <div class="section">
      <p class="sec-label" style="margin-bottom:10px;">Update rosters</p>
      <div id="cfg-rosters"></div>
      <button class="primary-btn" style="margin-top:8px;" onclick="saveRosterUpdates()">Save roster changes</button>
    </div>'''
new = '''    <!-- Add a class -->
    <div class="section">
      <p class="sec-label" style="margin-bottom:4px;">Add a class</p>
      <p style="font-size:12px;color:#5F5E5A;margin-bottom:8px;">For a new section added mid-year, or a quick "test class" to demo a feature without touching real rosters.</p>
      <div class="class-name-row"><label>Name</label><input type="text" id="newclass-name" placeholder="e.g. Test Class" maxlength="40"/></div>
      <textarea id="newclass-roster" rows="4" placeholder="Paste names here, one per line (optional -- you can add them later in Update rosters below)..." style="margin-top:8px;"></textarea>
      <button class="primary-btn" style="margin-top:8px;" onclick="addNewClass()">Add class</button>
    </div>

    <!-- Rosters -->
    <div class="section">
      <p class="sec-label" style="margin-bottom:10px;">Update rosters</p>
      <div id="cfg-rosters"></div>
      <button class="primary-btn" style="margin-top:8px;" onclick="saveRosterUpdates()">Save roster changes</button>
    </div>'''
src = replace_once(src, old, new, "Add-a-class HTML section")

# 2. JS: addNewClass() -- same id/passData/watchList/cfg.classes pattern
#    saveSetup() uses for the initial classes, then refreshes everywhere a
#    class list is rendered (roster editor, CSV checklist, class tabs) and
#    switches the tracker to the new class so it's ready to use right away.
old = "function saveRosterUpdates(){cfg.classes.forEach(function(c){var ta=document.getElementById('cfgr-'+c.id);if(ta&&ta.value.trim())c.students=parseNames(ta.value.trim());});save();showPhase('phase-tracker');renderAll();}"
new = old + '''
function addNewClass(){
  var nameEl=document.getElementById('newclass-name');
  var name=nameEl.value.trim();
  if(!name){alert('Give the new class a name first.');return;}
  var rosterEl=document.getElementById('newclass-roster');
  var raw=rosterEl?rosterEl.value:'';
  var id=uid();
  if(!passData[id])passData[id]={};
  if(!watchList[id])watchList[id]=new Set();
  cfg.classes.push({id:id,name:name,students:raw.trim()?parseNames(raw.trim()):[]});
  save();
  nameEl.value='';
  if(rosterEl)rosterEl.value='';
  activeClassId=id;
  renderCfgRosters();
  renderCsvClassChecks();
  renderAll();
  alert('"'+name+'" added. It\\'s now the active class tab -- hit Back to see it, or add/edit students below.');
}'''
src = replace_once(src, old, new, "addNewClass() function")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK - added an 'Add a class' section to Settings -> Rosters (addNewClass())")
