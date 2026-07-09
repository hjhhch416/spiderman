param(
  [string]$ServerHost = "10.10.16.201",
  [string]$ServerUser = "lee",
  [string]$ServerPassword = "2222",
  [string]$DashboardDir = "/home/lee/AHJ/ship-defect-dashboard",
  [int]$DashboardPort = 5173,
  [string]$PlinkPath = "C:\Program Files\Common Files\MariaDBShared\HeidiSQL\plink.exe",
  [string]$HostKey = "ssh-ed25519 255 SHA256:kslFndjQRCLazgVN0Im3Uk6Ri3TIS5zyWoXUXwth5zI"
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

if (-not (Test-Path -LiteralPath $PlinkPath)) {
  throw "plink.exe not found: $PlinkPath"
}

$dashboardUrl = "http://${ServerHost}:${DashboardPort}"

$remoteScript = @"
set -e
cd "$DashboardDir"

if ! command -v npm >/dev/null 2>&1; then
  echo "[error] npm is not installed on the server"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[setup] node_modules not found. running npm install..."
  npm install
fi

if ss -lnt 2>/dev/null | grep -q ":$DashboardPort "; then
  echo "[ok] dashboard already listening on port $DashboardPort"
else
  echo "[start] starting dashboard on port $DashboardPort"
  nohup npm run dev -- --host 0.0.0.0 --port $DashboardPort > vite.log 2>&1 &
fi

for i in 1 2 3 4 5 6 7 8 9 10; do
  if ss -lnt 2>/dev/null | grep -q ":$DashboardPort "; then
    echo "[ok] dashboard ready: $dashboardUrl"
    exit 0
  fi
  sleep 1
done

echo "[error] dashboard did not open port $DashboardPort"
tail -80 vite.log 2>/dev/null || true
exit 1
"@

$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
$remoteCommand = "echo '$encoded' | base64 -d | bash"

Write-Step "Starting dashboard on Linux server $ServerHost"
& $PlinkPath -ssh -batch -hostkey $HostKey -pw $ServerPassword "$ServerUser@$ServerHost" $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Remote dashboard start failed. Exit code: $LASTEXITCODE"
}

Write-Step "Opening browser: $dashboardUrl"
Start-Process $dashboardUrl

Write-Host ""
Write-Host "Dashboard is ready: $dashboardUrl" -ForegroundColor Green
