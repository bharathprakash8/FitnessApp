# Tests the deployed admin-users Edge Function with temporary users on example.com.
# Sends no email; deletes every test user at the end. Run: .\scripts\test-admin-users.ps1
param([string]$RepoDir = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
Set-Location $RepoDir

$base = 'https://updctclaxbawgtrhtdor.supabase.co'
$ua = 'fitcoach-test'
$keys = npx supabase projects api-keys --project-ref updctclaxbawgtrhtdor --reveal -o json 2>$null | ConvertFrom-Json
$secret = ($keys | Where-Object { $_.type -eq 'secret' } | Select-Object -First 1).api_key
$pub = ($keys | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1).api_key
$keys = $null
$svc = @{ apikey = $secret; Authorization = "Bearer $secret" }

$script:pass = 0; $script:fail = 0
function Check($name, $cond) { if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" } }

function Call($token, $body) {
  $h = @{ apikey = $pub }
  if ($token) { $h.Authorization = "Bearer $token" }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -UserAgent $ua -Uri "$base/functions/v1/admin-users" -Headers $h -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress)
    return @{ status = [int]$r.StatusCode; body = ($r.Content | ConvertFrom-Json) }
  } catch {
    $resp = $_.Exception.Response
    $content = $_.ErrorDetails.Message
    if (-not $content -and $resp) {
      try { $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $content = $sr.ReadToEnd() } catch {}
    }
    $parsed = $null
    if ($content) { try { $parsed = $content | ConvertFrom-Json } catch { $parsed = @{ raw = $content } } }
    return @{ status = [int]$resp.StatusCode; body = $parsed }
  }
}

function SessionFor($email) {
  $link = Invoke-RestMethod -Method Post -UserAgent $ua -Uri "$base/auth/v1/admin/generate_link" -Headers $svc -ContentType 'application/json' -Body (@{ type = 'magiclink'; email = $email } | ConvertTo-Json)
  $otp = $link.email_otp
  if (-not $otp) { $otp = $link.properties.email_otp }
  if (-not $otp) { throw "generate_link returned no email_otp" }
  foreach ($t in 'magiclink','email') {
    try {
      $s = Invoke-RestMethod -Method Post -UserAgent $ua -Uri "$base/auth/v1/verify" -Headers @{ apikey = $pub } -ContentType 'application/json' -Body (@{ type = $t; email = $email; token = $otp } | ConvertTo-Json)
      return $s.access_token
    } catch { "verify type=$t failed: $($_.ErrorDetails.Message)" | Write-Host }
  }
  throw "could not get a session for $email"
}

function DeleteAuthUser($id) {
  try { Invoke-RestMethod -Method Delete -UserAgent $ua -Uri "$base/auth/v1/admin/users/$id" -Headers $svc | Out-Null } catch {}
}

$created = @()
try {
  # --- unauthenticated ---
  $r = Call $null @{ action = 'deactivate'; user_id = [guid]::NewGuid().ToString() }
  Check 'no token -> 401' ($r.status -eq 401)
  $r = Call $pub @{ action = 'deactivate'; user_id = [guid]::NewGuid().ToString() }
  Check 'publishable key as token -> 401' ($r.status -eq 401)

  # --- temporary admin ---
  $adm = Invoke-RestMethod -Method Post -UserAgent $ua -Uri "$base/auth/v1/admin/users" -Headers $svc -ContentType 'application/json' -Body (@{ email = 'fc-test-admin@example.com'; email_confirm = $true } | ConvertTo-Json)
  $created += $adm.id
  Invoke-RestMethod -Method Patch -UserAgent $ua -Uri "$base/rest/v1/profiles?id=eq.$($adm.id)" -Headers $svc -ContentType 'application/json' -Body (@{ role = 'admin' } | ConvertTo-Json) | Out-Null
  $adminToken = SessionFor 'fc-test-admin@example.com'

  # --- create ---
  $r = Call $adminToken @{ action = 'create'; email = 'FC-Test-Trainer@example.com'; full_name = 'Test Trainer'; role = 'trainer' }
  Check 'create trainer -> 200, role trainer, email lowercased' ($r.status -eq 200 -and $r.body.data.role -eq 'trainer' -and $r.body.data.email -eq 'fc-test-trainer@example.com')
  $trainerId = $r.body.data.id; $created += $trainerId

  $r = Call $adminToken @{ action = 'create'; email = 'fc-test-client@example.com'; full_name = 'Test Client'; role = 'client' }
  Check 'create client without trainer -> 400 trainer_required' ($r.status -eq 400 -and $r.body.error.code -eq 'trainer_required')

  $r = Call $adminToken @{ action = 'create'; email = 'fc-test-client@example.com'; full_name = 'Test Client'; phone = '+91 98765 43210'; role = 'client'; trainer_id = $trainerId }
  Check 'create client with trainer -> mapped' ($r.status -eq 200 -and $r.body.data.trainer_id -eq $trainerId -and $r.body.data.phone -eq '+91 98765 43210')
  $clientId = $r.body.data.id; $created += $clientId

  $r = Call $adminToken @{ action = 'create'; email = 'fc-test-client@example.com'; full_name = 'Dup'; role = 'trainer' }
  Check 'duplicate email -> 409' ($r.status -eq 409 -and $r.body.error.code -eq 'email_exists')

  $r = Call $adminToken @{ action = 'create'; email = 'bad'; full_name = 'X'; role = 'trainer' }
  Check 'invalid email -> 400' ($r.status -eq 400)

  # --- non-admin caller ---
  $trainerToken = SessionFor 'fc-test-trainer@example.com'
  $r = Call $trainerToken @{ action = 'deactivate'; user_id = $clientId }
  Check 'trainer calling admin-users -> 403' ($r.status -eq 403)

  # --- update ---
  $r = Call $adminToken @{ action = 'update'; user_id = $clientId; full_name = 'Renamed Client' }
  Check 'update name' ($r.status -eq 200 -and $r.body.data.full_name -eq 'Renamed Client' -and $r.body.data.trainer_id -eq $trainerId)

  $r = Call $adminToken @{ action = 'update'; user_id = $trainerId; role = 'client' }
  Check 'trainer with clients cannot change role -> 409' ($r.status -eq 409 -and $r.body.error.code -eq 'trainer_has_clients')

  $r = Call $adminToken @{ action = 'update'; user_id = $adm.id; role = 'trainer' }
  Check 'admin cannot change own role -> 409' ($r.status -eq 409)

  # --- assign ---
  $r = Call $adminToken @{ action = 'assign'; client_id = $trainerId; trainer_id = $trainerId }
  Check 'assign a trainer as client -> 400' ($r.status -eq 400)

  # --- deactivate / reactivate ---
  $r = Call $adminToken @{ action = 'deactivate'; user_id = $clientId }
  Check 'deactivate client' ($r.status -eq 200 -and $r.body.data.is_active -eq $false)
  # generate_link sends no email; the sign-in itself must be refused for a banned user
  $signIn = try { $null = SessionFor 'fc-test-client@example.com' 6>$null; 'signed in' } catch { 'refused' }
  Check 'deactivated user cannot sign in' ($signIn -eq 'refused')

  $r = Call $adminToken @{ action = 'reactivate'; user_id = $clientId }
  Check 'reactivate client' ($r.status -eq 200 -and $r.body.data.is_active -eq $true)

  $r = Call $adminToken @{ action = 'deactivate'; user_id = $adm.id }
  Check 'admin cannot deactivate self -> 409' ($r.status -eq 409)

  # --- delete ---
  $r = Call $adminToken @{ action = 'delete'; user_id = $trainerId }
  Check 'delete trainer with clients -> 409 has_data' ($r.status -eq 409 -and $r.body.error.code -eq 'has_data')

  $r = Call $adminToken @{ action = 'delete'; user_id = $clientId }
  Check 'delete client' ($r.status -eq 200 -and $r.body.data.deleted -eq $true)

  # role change now allowed (no clients left)
  $r = Call $adminToken @{ action = 'update'; user_id = $trainerId; role = 'client'; trainer_id = $trainerId }
  Check 'trainer -> client with self as trainer -> 400' ($r.status -eq 400)
  $check = Invoke-RestMethod -UserAgent $ua -Uri "$base/rest/v1/profiles?id=eq.$trainerId&select=role" -Headers $svc
  Check '...and role is unchanged' ($check[0].role -eq 'trainer')

  $r = Call $adminToken @{ action = 'delete'; user_id = $trainerId }
  Check 'delete trainer without clients' ($r.status -eq 200)
}
finally {
  foreach ($u in $created) { DeleteAuthUser $u }
  $secret = $null; $svc = $null
}
"---"
"passed=$script:pass failed=$script:fail"
