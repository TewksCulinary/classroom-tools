import sys

# Two fixes to classroom_tracker_sa.html's event-hours / kiosk background polling:
#
# 1. pollKioskEventHours() currently runs every 5s (and again, redundantly, every
#    15s) as soon as ANY event has ever been created -- even weeks after the
#    teacher has switched the kiosk back to plain class/hall-pass mode. Gate it
#    on kioskMode === 'event' instead, mirroring the same check the kiosk page
#    itself already uses -- so it only polls during the actual window the kiosk
#    is set to an event (via the existing "Set active" button), not forever
#    after the first time an event is created.
#
# 2. startSyncInterval() calls pollKioskEvents() and pollKioskEventHours() on
#    BOTH a 15-second interval and a dedicated 5-second interval. The 5-second
#    intervals already cover everything the 15-second calls to the same
#    functions would do, so those two calls inside the 15s tick are pure
#    duplicate network traffic. Remove them; syncToSheets() still runs every
#    15s as before.

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({count} occurrences): {label}")
    return src.replace(old, new, 1)

# 1. Gate pollKioskEventHours() on kioskMode, not on event history existing
old = "async function pollKioskEventHours() {\n  if (!SHEET_ID || !(cfg.events||[]).length) return;"
new = "async function pollKioskEventHours() {\n  if (!SHEET_ID || kioskMode !== 'event') return;"
src = replace_once(src, old, new, "pollKioskEventHours() kioskMode gate")

# 2. Remove the redundant 15s duplicate calls; keep the two dedicated 5s intervals
old = '''function startSyncInterval() {
  if(syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(function(){
    syncToSheets();
    pollKioskEvents();
    pollKioskEventHours();
  }, 15000);
  // Also poll kiosk more frequently
  setInterval(pollKioskEvents, 5000);
  setInterval(pollKioskEventHours, 5000);
}'''
new = '''function startSyncInterval() {
  if(syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(function(){
    syncToSheets();
  }, 15000);
  // Kiosk-facing reads run on their own faster cadence; the 15s tick above
  // only needs to push this device's local changes out to the sheet.
  setInterval(pollKioskEvents, 5000);
  setInterval(pollKioskEventHours, 5000);
}'''
src = replace_once(src, old, new, "startSyncInterval() dedupe")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK - pollKioskEventHours() gated on kioskMode + duplicate 15s polling removed")
