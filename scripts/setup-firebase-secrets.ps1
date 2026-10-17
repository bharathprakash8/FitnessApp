# One time per Firebase project: store the two files downloaded from the Firebase console.
#   google-services.json            -> GitHub secret GOOGLE_SERVICES_JSON_BASE64 (Android build)
#   <project>-firebase-adminsdk-*.json -> Supabase secret FIREBASE_SERVICE_ACCOUNT_JSON (send-push),
#                                      then deleted from Downloads
# Prints no secret values. Run from the repo folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-firebase-secrets.ps1
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$repo = 'bharathprakash8/FitnessApp'
$downloads = Join-Path $env:USERPROFILE 'Downloads'

$gs = Get-ChildItem $downloads -Filter 'google-services*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sa = Get-ChildItem $downloads -Filter '*firebase-adminsdk*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $gs) { Write-Host 'google-services.json not found in Downloads' -ForegroundColor Red; exit 1 }
if (-not $sa) { Write-Host 'Service account key (*firebase-adminsdk*.json) not found in Downloads' -ForegroundColor Red; exit 1 }

# Check they are the right files before storing anything.
$gsJson = Get-Content $gs.FullName -Raw | ConvertFrom-Json
$pkgs = @($gsJson.client | ForEach-Object { $_.client_info.android_client_info.package_name })
if ($pkgs -notcontains 'com.fitcoach.app') { Write-Host 'google-services.json is not for com.fitcoach.app' -ForegroundColor Red; exit 1 }
$saJson = Get-Content $sa.FullName -Raw | ConvertFrom-Json
if ($saJson.type -ne 'service_account' -or -not $saJson.private_key) { Write-Host 'The adminsdk file is not a service account key' -ForegroundColor Red; exit 1 }
if ($saJson.project_id -ne $gsJson.project_info.project_id) { Write-Host 'The two files are from different Firebase projects' -ForegroundColor Red; exit 1 }
Write-Host "Firebase project: $($saJson.project_id)"

# 1. google-services.json -> GitHub secret
# Pass as --body: piping from PowerShell 5 can garble the value.
gh secret set GOOGLE_SERVICES_JSON_BASE64 --repo $repo --body ([Convert]::ToBase64String([IO.File]::ReadAllBytes($gs.FullName)))
if ($LASTEXITCODE -ne 0) { Write-Host 'Could not save the GitHub secret' -ForegroundColor Red; exit 1 }

# 2. service account -> Supabase secret (one line of JSON via a temp env file)
$tmp = Join-Path $env:TEMP ('fcm-' + [guid]::NewGuid().ToString() + '.env')
try {
  $compact = $saJson | ConvertTo-Json -Compress -Depth 5
  Set-Content -Path $tmp -Value ("FIREBASE_SERVICE_ACCOUNT_JSON=" + $compact) -Encoding ascii -NoNewline
  npx supabase secrets set --env-file $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set failed' }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

# 3. The key is now stored; remove the downloaded copy.
Remove-Item $sa.FullName -Force
Write-Host 'Saved: GitHub secret GOOGLE_SERVICES_JSON_BASE64, Supabase secret FIREBASE_SERVICE_ACCOUNT_JSON.' -ForegroundColor Green
Write-Host "Deleted the service account key from Downloads ($($sa.Name))." -ForegroundColor Green
