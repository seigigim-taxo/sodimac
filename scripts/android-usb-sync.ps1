# Sync Android con live reload por USB
# Uso: npm run android:usb:sync
# Después levantá el dev server con: npm start -- --host=127.0.0.1

adb reverse tcp:8100 tcp:8100
$env:CAPACITOR_LIVE_RELOAD='true'
npx cap sync android
