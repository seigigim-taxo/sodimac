# Sync Android via USB con ADB reverse (funciona aunque haya VPN)
# Uso: npm run android:usb:sync
# Después levantá el dev server con: npm run start:usb

adb reverse tcp:8100 tcp:8100
$env:CAPACITOR_LIVE_RELOAD='true'
$env:CAPACITOR_SERVER_URL='http://localhost:8100'
npx cap sync android
