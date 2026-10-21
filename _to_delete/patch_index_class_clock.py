import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({count} occurrences): {label}")
    return src.replace(old, new, 1)

old = '''  <div class="kiosk-section">
    <p class="section-label">Student kiosk</p>'''
new = '''  <a class="tool-card" href="class_clock.html">
    <div class="tool-icon" style="background:#FDEFD9;">&#128336;</div>
    <div class="tool-body">
      <div class="tool-name">Class Clock</div>
      <div class="tool-desc">A big clock for the front of the room, with an editable message above it. Pop it out or go fullscreen on a projector.</div>
    </div>
    <div class="tool-arrow">›</div>
  </a>

  <div class="kiosk-section">
    <p class="section-label">Student kiosk</p>'''
src = replace_once(src, old, new, "Class Clock tool card before kiosk section")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK - Class Clock tool card added to index")
