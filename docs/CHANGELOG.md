# Changelog

## Version 2 (2026)

**New**
* CSV import and export on the File menu (replaces DIF), two-pass import that sizes the sheet once.
* Sort menu (was Link) with *Sort rows A-Z / Z-A*; *Merge (+)* / *Merge (-)* kept.
* "(Up a level)" label in the Open/Save file box; folders and disks reachable from it.
* `HELP/SORT`, `HELP/CSV`, `HELP/WHATS.NEW`.

**Fixed after first release**
* The CSV help was a fifth page of FILE help, but Mouse Calc only reads about 3,000 characters of a help file, so that page was cut off. CSV now has its own help page; FILE help is back to the original.
* Info menu and start-up picture show *Version 2* and *Updated by 6502 Retro 2026*.
* `SAMPLES/SORT.DEMO` practice sheet.
* Offline PC converter page (Mouse Calc ↔ `.xlsx`/`.csv`).

**Hard disk**
* No key disk check.
* Program folder path buffer moved, so deep folders no longer overwrite code.
* New `M.SYSTEM` finds its own folder and reports a missing `MOUSE.CALC` instead of crashing.
* New `MCALC.SYSTEM` launcher finds `MOUSECALC/` next to itself anywhere — fixes "goes straight back to DeskTop" when launched from a sub-folder.

**Removed**
* *Read a DIF file*, *Write a DIF file*, `DIF.SEGMENT`, *Copy to Mouse Word*.

**Fixed during development** (for anyone who had an early build)
* First hard-disk build skipped `JSR $A9F7` along with the copy protection, which crashed Help.
* Sort loader borrowed overlay table entry 4 ("PRINTER/"); SORT.SEGMENT now restores it, so *Set printer type* works after sorting.
* CSV import of lower-case exponents (`1e-7`).
