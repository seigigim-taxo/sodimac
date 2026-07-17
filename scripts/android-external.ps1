# Live reload Android por WiFi (sin VPN, PC y celular en la misma red)
# Uso: npm run start:external en una terminal y npm run android:external en otra

$ip = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp | Where-Object { $_.IPAddress -like '192.168.*' }).IPAddress | Select-Object -First 1

if (-not $ip) {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -like '192.168.*' }).IPAddress | Select-Object -First 1
}

if (-not $ip) {
  Write-Host 'No se detectó IP WiFi. Seteá manualmente $env:CAPACITOR_SERVER_URL antes de correr este script.' -ForegroundColor Red
  exit 1
}

Write-Host "Usando IP detectada: $ip" -ForegroundColor Green

$env:CAPACITOR_LIVE_RELOAD='true'
$env:CAPACITOR_SERVER_URL="http://$ip`:8100"
npx cap sync android
npx cap run android
