"""mkhelp.py ORIG_HELP_DIR OUT_DIR - writes OUT_DIR/SORT (replaces LINK) and
OUT_DIR/FILE (the original FILE help plus a page 5 about CSV import/export)."""
import sys, os
files, outdir = sys.argv[1], sys.argv[2]        # original HELP files, output folder
here = os.path.dirname(os.path.abspath(__file__))
def page(n, total, title, body, last=False):
    hdr = ('Page %d of %d' % (n, total)).ljust(27) + title
    nav = '<ESC> Mouse Calc'
    if n > 1: nav = nav.ljust(27) + '<- previous page'
    if n < total: nav = nav.ljust(51) + '-> next page'
    lines = [hdr, ''] + body
    assert len(lines) <= 23 and all(len(l) <= 79 for l in lines), [l for l in lines if len(l) > 79]
    return '\r'.join(lines + [''] * (23 - len(lines)) + [nav]) + '  &'
# ---- SORT (sort text from the earlier LINK help, DIF part dropped)
body = open(os.path.join(here, 'sort_section.txt')).read().rstrip('\n').split('\n')
body += ['', 'MERGE (+) and MERGE (-)', '=======================',
         'These two commands are unchanged from the original Link menu.']
sortp = '1\r' + page(1, 1, 'SORT MENU HELP SCREEN', body)
open(outdir + '/SORT', 'wb').write(sortp.encode('ascii'))
# ---- FILE: keep pages 1-4, add page 5 for CSV
f = open(files + '/FILE', 'rb').read().decode('ascii')
pages = f[2:].split('&\r')
pages[-1] = pages[-1].rstrip('&').rstrip()
fixed = []
for k, p in enumerate(pages):
    L = p.split('\r')
    L[0] = L[0].replace('of 4', 'of 5')
    if k == 3:                               # was the last page: add "next page"
        L[-1] = L[-1].rstrip().ljust(51) + '-> next page'
    fixed.append('\r'.join(L).rstrip(' ') + '  ')
csv = ['IMPORT CSV FILE / EXPORT CSV FILE',
       '=================================',
       'CSV files open in Excel, LibreOffice, Numbers and Google Sheets.',
       '',
       'EXPORT CSV FILE: type a name (".CSV" is added if you give no extension).',
       'Every used row is written, columns separated by commas.  Numbers are saved',
       'plainly (formulas are saved as their results), text is put in quotes.',
       '',
       'IMPORT CSV FILE: replaces the current spreadsheet (you are asked first',
       'whether to save it).  Click the CSV file in the window; it must be a text',
       '(TXT) file on the Apple disk.  Plain numbers become numbers,',
       'everything else (including numbers in quotes) becomes text.  Files that use',
       'semicolons or tabs between columns are read too.  Up to 63 columns and 254',
       'rows are read (a completely full sheet takes about 3 minutes).',
       'Characters the Apple II cannot show (such as accented letters) become "?".',
       '',
       'To move files between the Apple II and a PC use a disk image tool such as',
       'CiderPress II; when copying a CSV onto the Apple disk, give it type TXT.']
fixed.append(page(5, 5, 'FILE MENU HELP SCREEN', csv)[:-3] + '  ')
out = '5\r' + '&\r'.join(fixed) + '&'
open(outdir + '/FILE', 'wb').write(out.encode('ascii'))
print(len(sortp), len(out))
