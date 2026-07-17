import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'sodimac-app',
  webDir: 'www',
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
  },
};

// Live reload por USB/WiFi. Se activa con CAPACITOR_LIVE_RELOAD=true.
// Por defecto usa localhost:8100 (requiere adb reverse tcp:8100 tcp:8100).
// Para WiFi, setear CAPACITOR_SERVER_URL=http://<ip-pc>:8100
if (process.env.CAPACITOR_LIVE_RELOAD === 'true') {
  config.server = {
    url: process.env.CAPACITOR_SERVER_URL || 'http://localhost:8100',
    cleartext: true,
    androidScheme: 'http',
  };
}

export default config;
