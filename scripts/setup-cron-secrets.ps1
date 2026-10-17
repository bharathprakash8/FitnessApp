# One-time per Supabase project: create a random cron secret, save it as the CRON_SECRET
# function secret and in Vault (with the project URL) for pg_cron jobs. Prints no secrets.
# Run from the repo folder:  .\scripts\setup-cron-secrets.ps1 [-ProjectRef updctclaxbawgtrhtdor]
param([string]$ProjectRef = 'updctclaxbawgtrhtdor')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$url = "https://$ProjectRef.supabase.co"

$envFile = Join-Path $env:TEMP ('cron-' + [guid]::NewGuid().ToString() + '.env')
$sqlFile = Join-Path $env:TEMP ('cron-' + [guid]::NewGuid().ToString() + '.sql')
try {
  Set-Content -Path $envFile -Value "CRON_SECRET=$secret" -Encoding ascii -NoNewline
  npx supabase secrets set --env-file $envFile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'secrets set failed' }

  @"
do `$`$
begin
  delete from vault.secrets where name in ('cron_secret', 'project_url');
  perform vault.create_secret('$secret', 'cron_secret', 'Header value for scheduled Edge Function calls');
  perform vault.create_secret('$url', 'project_url', 'Base URL of this Supabase project');
end `$`$;
"@ | Set-Content -Path $sqlFile -Encoding ascii
  npx supabase db query --linked -f $sqlFile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'vault update failed' }
} finally {
  Remove-Item $envFile, $sqlFile -Force -ErrorAction SilentlyContinue
  $secret = $null
}
Write-Host 'Cron secret saved (function secret + Vault).' -ForegroundColor Green
