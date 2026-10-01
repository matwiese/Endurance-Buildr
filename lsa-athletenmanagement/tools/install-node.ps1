# Laedt eine portable Node.js-Version von nodejs.org in den Ordner "runtime" und prueft die SHA-256-Pruefsumme.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$version = 'v22.22.0'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'runtime'
$zipName = "node-$version-$arch.zip"
$base = "https://nodejs.org/dist/$version"
$tmp = Join-Path $env:TEMP $zipName

try {
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  Write-Host "  Lade $zipName von nodejs.org ..."
  Invoke-WebRequest -Uri "$base/$zipName" -OutFile $tmp -UseBasicParsing

  Write-Host '  Pruefe Pruefsumme ...'
  $sums = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing).Content
  $line = ($sums -split "`n" | Where-Object { $_ -like "*$zipName*" } | Select-Object -First 1)
  if (-not $line) { throw 'Pruefsumme nicht gefunden.' }
  $expected = ($line.Trim() -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 -Path $tmp).Hash.ToLower()
  if ($expected -ne $actual) { Remove-Item $tmp -Force; throw 'Die Pruefsumme der heruntergeladenen Datei stimmt nicht. Abbruch.' }

  Write-Host '  Entpacke ...'
  Expand-Archive -Path $tmp -DestinationPath $runtime -Force
  $extracted = Join-Path $runtime "node-$version-$arch"
  $target = Join-Path $runtime 'node'
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Rename-Item -Path $extracted -NewName 'node'
  Remove-Item $tmp -Force
  Write-Host '  Fertig.'
} catch {
  Write-Host ''
  Write-Host "  FEHLER: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '  Bitte Internetverbindung pruefen oder Node.js manuell von https://nodejs.org installieren.'
  exit 1
}
