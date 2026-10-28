# Prints the setup guides (public/guides/*.html) to PDF with Microsoft Edge.
# The PDFs are attached to the welcome email. Run after changing a guide:
#   powershell -ExecutionPolicy Bypass -File scripts/build-guides.ps1
$dir = Join-Path $PSScriptRoot '..\public\guides' | Resolve-Path
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
foreach ($g in 'android', 'iphone') {
  $url = 'file:///' + $dir.Path.Replace([char]92, [char]47) + "/$g.html"
  $out = Join-Path $dir "FitCoach-$g-setup.pdf"
  Start-Process -FilePath $edge -Wait -ArgumentList '--headless=new', '--disable-gpu', '--no-pdf-header-footer', "--user-data-dir=$env:TEMP\edge-pdf", "--print-to-pdf=$out", $url
  Write-Host "Saved $out"
}
