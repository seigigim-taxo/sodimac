# Live reload Android en una sola terminal (USB + ADB reverse, funciona con VPN)
# Uso: npm run android

adb reverse tcp:8100 tcp:8100
ionic capacitor run android -l --host=127.0.0.1 --port=8100
