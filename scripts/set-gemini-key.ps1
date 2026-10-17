# Saves the Gemini API key as a Supabase secret without showing it on screen or storing it in the repo.
# Run from the repo folder:  .\scripts\set-gemini-key.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

$secure = Read-Host -Prompt 'Paste your Gemini API key and press Enter (it will not be shown)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  # Drop spaces and quotes that sometimes come along with a paste.
  $key = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) -replace '[\s"'']', '')
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ($key.Length -lt 30) { Write-Host 'That does not look like a full key. Nothing was saved.' -ForegroundColor Red; exit 1 }
Write-Host ("Key received: {0} characters, starts with {1}..." -f $key.Length, $key.Substring(0, 4))

# Pass it through a temporary env file (not the command line), then delete the file.
$tmp = Join-Path $env:TEMP ("gemini-" + [guid]::NewGuid().ToString() + '.env')
try {
  Set-Content -Path $tmp -Value "GEMINI_API_KEY=$key" -Encoding ascii -NoNewline
  npx supabase secrets set --env-file $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set failed' }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  $key = $null
}
Write-Host 'Saved GEMINI_API_KEY to Supabase. You can close this tab.' -ForegroundColor Green
