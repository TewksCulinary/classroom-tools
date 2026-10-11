import sys

# Fixes the passes-tab "timestamp" column, which currently gets stamped with
# new Date() (the moment of each full-sheet rewrite) for every single row --
# so after any sync, every row shows the same sync time instead of that row's
# own event time. Also adds two new human-readable columns (outLocal,
# backLocal) in local Pacific time, computed from the existing raw
# millisecond out/back values, so an archived copy of the sheet is readable
# without the owner needing to apply a conversion formula herself.
#
# Nothing in the app ever reads column A (timestamp) back in, and nothing
# reads the new trailing columns either -- all parsing of this sheet only
# looks at indices 1-9 (eventId..backUnknown) -- so this is purely additive
# and does not touch any value the app's own pass-tracking logic depends on.
# The kiosk's own direct sheet writes (new pass out, clock in/out, sign back)
# are left untouched: the teacher-side full-rewrite in syncToSheets() runs at
# least every 15s and fully replaces the passes range from local state, so it
# naturally backfills the new columns for every row, including ones the
# kiosk just appended, without needing matching changes on the kiosk side.

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({count} occurrences): {label}")
    return src.replace(old, new, 1)

HEADER_OLD = "[['timestamp','eventId','classId','className','studentName','type','destination','out','back','backUnknown']]"
HEADER_NEW = "[['timestamp','eventId','classId','className','studentName','type','destination','out','back','backUnknown','outLocal','backLocal']]"

# 1. One-time header write in saveSheetId() (fresh sheet connections going
#    forward): extend to 12 columns so a brand-new sheet starts out right.
old = "await sheetsUpdate(SHEET_PASSES+'!A1:J1', " + HEADER_OLD + ");"
new = "await sheetsUpdate(SHEET_PASSES+'!A1:L1', " + HEADER_NEW + ");"
src = replace_once(src, old, new, "saveSheetId() header (A1:J1 -> A1:L1)")

# 2. Add a small helper to format a ms timestamp as a readable Pacific-time
#    string (handles DST automatically), placed right before syncToSheets().
old = "async function syncToSheets() {"
new = '''function fmtLocalPT(ms) {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(ms));
  } catch (e) { return ''; }
}

async function syncToSheets() {'''
src = replace_once(src, old, new, "fmtLocalPT() helper")

# 3. Row building: column A becomes this row's own event time (not "now"),
#    and two new trailing columns carry the human-readable local times.
old = '''          rows.push([new Date().toISOString(), t.eventId||'', cls.id, cls.name, name,
            t.type, t.destination||'', t.out||'', t.back||'', t.backUnknown?'1':'']);'''
new = '''          rows.push([t.out ? new Date(t.out).toISOString() : '', t.eventId||'', cls.id, cls.name, name,
            t.type, t.destination||'', t.out||'', t.back||'', t.backUnknown?'1':'',
            fmtLocalPT(t.out), fmtLocalPT(t.back)]);'''
src = replace_once(src, old, new, "per-row timestamp + readable columns")

# 4. Widen the data write range (10 cols -> 12) and refresh the header on
#    every sync too, so an ALREADY-connected sheet (like Valerie's current
#    one) picks up the new outLocal/backLocal column labels automatically,
#    with no manual edit needed on her end.
old = '''  try {
    await Promise.all([
      sheetsUpdate(SHEET_PASSES+'!A2:J'+(Math.max(rows.length,1)+1), rows.length ? rows : [['']]),
      sheetsUpdate(SHEET_CONFIG+'!A1:B8', configData)
    ]);'''
new = '''  try {
    await Promise.all([
      sheetsUpdate(SHEET_PASSES+'!A1:L1', ''' + HEADER_NEW + '''),
      sheetsUpdate(SHEET_PASSES+'!A2:L'+(Math.max(rows.length,1)+1), rows.length ? rows : [['']]),
      sheetsUpdate(SHEET_CONFIG+'!A1:B8', configData)
    ]);'''
src = replace_once(src, old, new, "syncToSheets() header refresh + widened write range")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK - passes timestamp fixed per-row, outLocal/backLocal columns added, header auto-refreshes on sync")
