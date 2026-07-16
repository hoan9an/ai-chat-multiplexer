param(
  [Parameter(Mandatory = $true)]
  [string]$BundleRoot,
  [bool]$Required = $true,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$files = Get-ChildItem -LiteralPath $BundleRoot -Recurse -File |
  Where-Object { $_.Extension -in @('.exe', '.msi') -and $_.Name -notmatch '^uninstall' }

if (-not $files) {
  throw 'No Windows executable or installer was found for Authenticode verification'
}

$assets = foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  if ($Required) {
    if ($signature.Status -ne 'Valid') {
      throw "Authenticode status is $($signature.Status) for $($file.Name)"
    }
    if (-not $signature.SignerCertificate -or -not $signature.TimeStamperCertificate) {
      throw "Authenticode signer or timestamp is missing for $($file.Name)"
    }
  }
  [ordered]@{
    name = $file.Name
    sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    status = $signature.Status.ToString()
    signerSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    timestampSubject = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { $null }
  }
}

$report = [ordered]@{
  schemaVersion = 1
  required = $Required
  verifiedAt = [DateTime]::UtcNow.ToString('o')
  assets = @($assets)
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding utf8NoBOM
