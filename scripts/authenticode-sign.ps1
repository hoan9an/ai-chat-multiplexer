param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$FilePath
)

$ErrorActionPreference = 'Stop'

$resolvedFile = Resolve-Path -LiteralPath $FilePath -ErrorAction Stop
if (-not (Test-Path -LiteralPath $resolvedFile.Path -PathType Leaf)) {
  throw 'Authenticode target must be a file'
}

if (-not $env:WINDOWS_SIGNING_CERT_THUMBPRINT) {
  throw 'WINDOWS_SIGNING_CERT_THUMBPRINT is required'
}
if (-not $env:WINDOWS_TIMESTAMP_URL) {
  throw 'WINDOWS_TIMESTAMP_URL is required'
}

$signtool = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe |
  Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $signtool) {
  throw 'signtool.exe was not found'
}

& $signtool.FullName sign /sha1 $env:WINDOWS_SIGNING_CERT_THUMBPRINT /fd SHA256 /tr $env:WINDOWS_TIMESTAMP_URL /td SHA256 $resolvedFile.Path
if ($LASTEXITCODE -ne 0) {
  throw "signtool sign failed for the requested artifact"
}

& $signtool.FullName verify /pa /all /v $resolvedFile.Path
if ($LASTEXITCODE -ne 0) {
  throw "signtool verify failed for the requested artifact"
}
