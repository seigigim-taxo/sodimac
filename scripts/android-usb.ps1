# Live reload Android via USB con ADB reverse
# Uso: npm run android:usb

adb reverse tcp:8100 tcp:8100
$env:CAPACITOR_LIVE_RELOAD='true'
npx cap sync android
npx cap run android
