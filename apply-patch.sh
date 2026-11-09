#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
[ -f "$ROOT/public/company-world/index.html" ] || { echo "New Company Hub not found. Extract patch into project root first." >&2; exit 1; }
[ -f "$ROOT/public/index.html" ] || { echo "Main app entry not found. Refusing to continue." >&2; exit 1; }
if [ -d "$ROOT/public/virtual-office" ]; then
  rm -rf -- "$ROOT/public/virtual-office"
  echo "Removed old 3D runtime: public/virtual-office/"
else
  echo "Old 3D runtime already absent."
fi
echo "Company Hub is installed at /company-world/."
echo "Existing archive/ backup (if present) was not touched."
