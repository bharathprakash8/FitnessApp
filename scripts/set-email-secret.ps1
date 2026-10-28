# Saves the Gmail app password used for welcome emails as a Supabase secret, without showing it
# on screen or storing it in the repo. Run from the repo folder:
#   powershell -ExecutionPolicy Bypass -File scripts/set-email-secret.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

$user = Read-Host -Prompt 'Sending Gmail address (press Enter for nidhi@samhithe.in)'
if (-not $user) { $user = 'nidhi@samhithe.in' }
$user = $user.Trim()

$secure = Read-Host -Prompt 'Paste the 16-letter Google app password and press Enter (it will not be shown)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  # Google shows it in groups of four with spaces; drop spaces and quotes.
  $pass = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) -replace '[\s"'']', '')
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ($pass.Length -ne 16) { Write-Host 'An app password has 16 letters. Nothing was saved.' -ForegroundColor Red; exit 1 }

# Pass it through a temporary env file (not the command line), then delete the file.
$tmp = Join-Path $env:TEMP ("smtp-" + [guid]::NewGuid().ToString() + '.env')
try {
  Set-Content -Path $tmp -Value "SMTP_USER=$user`nSMTP_PASS=$pass`nSMTP_FROM_NAME=FitCoach" -Encoding ascii -NoNewline
  npx supabase secrets set --env-file $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set failed' }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  $pass = $null
}
Write-Host "Saved. Welcome emails will be sent from $user. You can close this tab." -ForegroundColor Green
