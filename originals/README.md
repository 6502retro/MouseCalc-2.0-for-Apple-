# Your original disks go here

Put images of your own Mouse Calc disks in this folder, then run `python3 build.py`:

* the **program disk** — file name containing "Program", e.g. `Mouse Calc - Program.woz` (required)
* the **samples disk** — file name containing "Samples", e.g. `Mouse Calc - Samples.woz` (recommended)

`.woz` (WOZ 1 or 2), `.po`, `.dsk` and `.2mg` all work. You can also pass the paths directly:
`python3 build.py PROGRAM.woz SAMPLES.woz`.

The build was made against the English Mouse Calc program disk whose `MOUSE.CALC` has SHA-1
`94c3a7eed4789c65931748e4736047069e44393c` (printed during the build). Every patch checks the
bytes it replaces, so a different release stops with an error rather than producing a broken disk.

Nothing in this folder is committed to git (see `.gitignore`): these are copyrighted disks.
