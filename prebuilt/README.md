# Prebuilt 6502 code

Assembled copies of the sources in [`src/`](../src/), so `build.py` works with only Python installed.
They contain only this project's own code: `M.SYSTEM.front` is the new front part of M.SYSTEM —
Version Soft's original loader is appended from your disk during the build.

Refresh after changing `src/` (needs cc65): `python3 build.py --update-prebuilt`
