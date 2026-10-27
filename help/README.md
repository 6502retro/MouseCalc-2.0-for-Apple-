# Help page generators

Run by `build.py`:

* `mkhelp.py ORIG_HELP_DIR OUT_DIR` — writes `SORT` (the text in `sort_section.txt` plus a note on Merge) and `FILE` (the original FILE help with a fifth page about CSV).
* `mkwhatsnew.py OUT` — writes `WHATS.NEW`: the English version of Version Calc 1.086's "Nouveautés" page, plus the Version 2 additions.

Mouse Calc help files are plain ASCII: the page count on the first line, then 24-line pages separated by `&`, 79 columns at most.
