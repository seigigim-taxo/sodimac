import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.taxo.sodimac.inventario',
  /*
   * El nombre visible bajo el ícono en la PDA. El appId de arriba es la
   * identidad del APK y NO se toca: si cambiara, Android trataría la app como
   * otra distinta y en vez de actualizar instalaría una segunda copia al lado,
   * dejando la base local del operador en la vieja.
   */
  appName: 'Sodimac',
  webDir: 'www',
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
  },
  server: {
    // El backend (ws/api) es HTTP plano en la LAN; servir la app tambien
    // sobre http://localhost evita que el WebView bloquee las llamadas
    // como "mixed content" (https -> http).
    androidScheme: 'http'
  }
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
