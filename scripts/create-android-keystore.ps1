# One time: create the Android signing key and give it (encrypted) to GitHub Actions.
# Run from the repo folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-android-keystore.ps1
# The key is saved in %USERPROFILE%\FitCoach-keys (outside the repo). BACK IT UP with the
# password: without them the installed app can never be updated.
# Native tools write progress to stderr, which PowerShell 5 would treat as fatal; exit codes
# are checked explicitly instead.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$repo = 'bharathprakash8/FitnessApp'
$openssl = Join-Path $env:LOCALAPPDATA 'Programs\Git\usr\bin\openssl.exe'
if (-not (Test-Path $openssl)) { $openssl = 'openssl' }

# 1. GitHub sign-in (once)
gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nStep 1: sign in to GitHub. Press Enter, then follow the code in your browser." -ForegroundColor Cyan
  gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in did not finish' }
}

$dir = Join-Path $env:USERPROFILE 'FitCoach-keys'
$p12 = Join-Path $dir 'fitcoach-release.p12'
if (Test-Path $p12) {
  Write-Host "A key already exists at $p12 - not creating a new one (that would break updates)." -ForegroundColor Yellow
  Write-Host 'Delete it yourself first only if you really want a new key.'
  exit 1
}

# 2. Password (typed twice, hidden)
function Read-Plain([string]$prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
Write-Host "`nStep 2: choose a password for the app signing key (at least 10 characters)." -ForegroundColor Cyan
Write-Host 'Save it in your password manager now - you will need it if you ever move the key.'
$pw = Read-Plain 'Password'
if ($pw.Length -lt 10) { throw 'Password must be at least 10 characters' }
if ((Read-Plain 'Type it again') -ne $pw) { throw 'The two passwords do not match' }

# 3. Create the key (RSA 2048, valid 30 years) as a PKCS12 keystore with alias "fitcoach"
New-Item -ItemType Directory -Force $dir | Out-Null
$keyPem = Join-Path $dir 'key.tmp.pem'
$certPem = Join-Path $dir 'cert.tmp.pem'
$env:FC_KS_PASS = $pw
try {
  & $openssl req -x509 -newkey rsa:2048 -sha256 -days 10950 -subj '/CN=FitCoach/O=FitCoach/C=IN' `
    -keyout $keyPem -out $certPem -passout env:FC_KS_PASS 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'openssl could not create the key' }
  & $openssl pkcs12 -export -inkey $keyPem -in $certPem -name fitcoach -out $p12 `
    -passin env:FC_KS_PASS -passout env:FC_KS_PASS
  if ($LASTEXITCODE -ne 0) { throw 'openssl could not create the keystore' }
} finally {
  Remove-Item $keyPem, $certPem -Force -ErrorAction SilentlyContinue
  Remove-Item Env:FC_KS_PASS -ErrorAction SilentlyContinue
}
Write-Host "Key created: $p12" -ForegroundColor Green

# 4. Encrypted GitHub Secrets + public build variables
[Convert]::ToBase64String([IO.File]::ReadAllBytes($p12)) | gh secret set ANDROID_KEYSTORE_BASE64 --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'Could not save ANDROID_KEYSTORE_BASE64' }
$pw | gh secret set ANDROID_KEYSTORE_PASSWORD --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'Could not save ANDROID_KEYSTORE_PASSWORD' }
$pw = $null
Get-Content .env.local | Where-Object { $_ -match '^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  gh variable set $k --repo $repo --body $v.Trim().Trim('"') | Out-Null
}
Write-Host "`nDone. GitHub now has the signing key (encrypted) and the build settings." -ForegroundColor Green
Write-Host "BACK UP the folder $dir and the password (e.g. Google Drive + password manager)." -ForegroundColor Yellow
