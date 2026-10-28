# Prints the setup guides (public/guides/*.html) to PDF with Microsoft Edge.
# The PDFs are attached to the welcome email. Run after changing a guide:
#   powershell -ExecutionPolicy Bypass -File scripts/build-guides.ps1
$dir = Join-Path $PSScriptRoot '..\public\guides' | Resolve-Path
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
foreach ($g in 'android', 'iphone', 'how-to-use') {
  $url = 'file:///' + $dir.Path.Replace([char]92, [char]47) + "/$g.html"
  $file = "FitCoach-$g-setup.pdf"
  if ($g -eq 'how-to-use') { $file = 'FitCoach-user-guide.pdf' }
  $out = Join-Path $dir $file
  Start-Process -FilePath $edge -Wait -ArgumentList '--headless=new', '--disable-gpu', '--no-pdf-header-footer', "--user-data-dir=$env:TEMP\edge-pdf", "--print-to-pdf=$out", $url
  Write-Host "Saved $out"
}
