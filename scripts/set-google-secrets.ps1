# Saves the Google OAuth client (for "Connect Google Calendar") as Supabase secrets without
# showing them on screen or storing them in the repo. Also creates the key that encrypts
# trainers' Google tokens (only the first time - changing it would disconnect everyone).
# Run from the repo folder:  powershell -ExecutionPolicy Bypass -File .\scripts\set-google-secrets.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function Read-Secret([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    # Drop spaces and quotes that sometimes come along with a paste.
    return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) -replace '[\s"'']', '')
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$clientId = Read-Secret 'Paste the Google Client ID and press Enter (it will not be shown)'
if ($clientId -notmatch '\.apps\.googleusercontent\.com$') {
  Write-Host 'That does not look like a Client ID (it ends with .apps.googleusercontent.com). Nothing was saved.' -ForegroundColor Red
  exit 1
}
$clientSecret = Read-Secret 'Paste the Google Client secret and press Enter (it will not be shown)'
if ($clientSecret.Length -lt 20) {
  Write-Host 'That does not look like a full Client secret. Nothing was saved.' -ForegroundColor Red
  exit 1
}
Write-Host ("Client ID received ({0} characters), secret received ({1} characters)." -f $clientId.Length, $clientSecret.Length)

$lines = @(
  "GOOGLE_CLIENT_ID=$clientId",
  "GOOGLE_CLIENT_SECRET=$clientSecret",
  'APP_URL=https://fitcoach-ten-nu.vercel.app'
)

# Create the encryption key only if it does not exist yet.
$existing = (npx supabase secrets list 2>$null) -join "`n"
if ($existing -notmatch 'GOOGLE_TOKEN_KEY') {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $lines += 'GOOGLE_TOKEN_KEY=' + [Convert]::ToBase64String($bytes)
  Write-Host 'Created a new encryption key for Google tokens.'
} else {
  Write-Host 'Keeping the existing encryption key.'
}

# Pass the values through a temporary env file (not the command line), then delete it.
$tmp = Join-Path $env:TEMP ('google-' + [guid]::NewGuid().ToString() + '.env')
try {
  Set-Content -Path $tmp -Value ($lines -join "`n") -Encoding ascii -NoNewline
  npx supabase secrets set --env-file $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set failed' }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  $clientId = $null
  $clientSecret = $null
  $lines = $null
}
Write-Host 'Saved the Google settings to Supabase. You can close this window.' -ForegroundColor Green
