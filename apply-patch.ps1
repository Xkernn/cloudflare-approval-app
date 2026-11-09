$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$entry = Join-Path $root "public/company-world/index.html"
$main = Join-Path $root "public/index.html"
$legacy = Join-Path $root "public/virtual-office"

if (!(Test-Path $entry)) { throw "New Company Hub not found: $entry. Extract the patch into the project root first." }
if (!(Test-Path $main)) { throw "Main app entry not found: $main. Refusing to continue." }

if (Test-Path $legacy) {
  Remove-Item -LiteralPath $legacy -Recurse -Force
  Write-Host "Removed old 3D runtime: public/virtual-office/"
} else {
  Write-Host "Old 3D runtime already absent."
}
Write-Host "Company Hub is installed at /company-world/."
Write-Host "Existing archive/ backup (if present) was not touched."
