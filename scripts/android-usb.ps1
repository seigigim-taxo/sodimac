# Live reload Android via USB con ADB reverse (funciona aunque haya VPN)
# Uso: npm run android:usb

adb reverse tcp:8100 tcp:8100
$env:CAPACITOR_LIVE_RELOAD='true'
$env:CAPACITOR_SERVER_URL='http://localhost:8100'
npx cap sync android
npx cap run android
