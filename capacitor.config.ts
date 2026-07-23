import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'sodimac-app',
  webDir: 'www',
  server: {
    // El backend (ws/api) es HTTP plano en la LAN; servir la app tambien
    // sobre http://localhost evita que el WebView bloquee las llamadas
    // como "mixed content" (https -> http).
    androidScheme: 'http'
  }
};

export default config;
