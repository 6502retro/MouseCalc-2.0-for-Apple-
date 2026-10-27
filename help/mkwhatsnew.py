"""Build HELP/WHATS.NEW: the English counterpart of Version Calc 1.086's
AIDE/NOUVEAUTES page, plus the Version 2 additions."""
import sys
T = "WHAT'S NEW HELP SCREEN"
p1 = [
"FEATURES CARRIED OVER FROM VERSION CALC 1.086 (French edition)",
"==============================================================",
"FORMAT - CENTER JUSTIFY: center text and numbers in their cells.",
"",
"ANSWER QUESTIONS WITH THE MOUSE: when Mouse Calc asks something like",
'  "Save this file? (Yes/No)", click on the answer or type its first letter.',
"",
"JUMP STRAIGHT TO A CELL: type > and the cell reference, then RETURN.",
"  Example: to go to S20, type  >S20  and press RETURN.",
"",
"SELECT A RANGE WIDER THAN THE SCREEN: click the top-left cell of the range,",
"  scroll to its bottom-right cell, then hold down <Open-Apple> and click",
"  that cell.  The whole range is now selected.",
]
p2 = [
"VERSION 2 ADDITIONS (updated by 6502 Retro 2026)",
"================================================",
"HARD DISK: runs from any folder on a ProDOS hard disk - launch MCALC.SYSTEM",
"  (next to the MOUSECALC folder) or M.SYSTEM (inside it).  No key disk.",
"",
"SORT ROWS (Sort menu): select rows, choose Sort rows A-Z / Z-A, type the",
"  column letter to sort by.  See LINK help for details.",
"",
'OPEN/SAVE IN ANY FOLDER: click "(Up a level)" at the top of the file box to',
"  go up a folder; at the top of a disk it lists every disk.  Click a folder",
"  to open it.  File > Select volume also lists the disks.",
"",
"CSV FILES (File menu): Export CSV file / Import CSV file exchange sheets with",
"  Excel, LibreOffice, Numbers and Google Sheets.  See FILE help, page 5.",
"  The Link menu is now the Sort menu; the DIF commands were removed.",
]
pages = [p1, p2]; n = len(pages); out = []
for i, p in enumerate(pages):
    hdr = ('Page %d of %d' % (i + 1, n)).ljust(28) + T
    nav = '<ESC> Mouse Calc'
    if i > 0: nav = nav.ljust(28) + '<- previous page'
    if i < n - 1: nav = nav.ljust(52) + '-> next page'
    body = [hdr, ''] + p
    assert len(body) <= 23 and all(len(l) <= 79 for l in body), [l for l in body if len(l) > 79]
    body += [''] * (23 - len(body))
    out.append('\r'.join(body + [nav]) + '  &')
data = (str(n) + '\r' + '\r'.join(out)).encode('ascii')
open(sys.argv[1], 'wb').write(data); print(len(data))
