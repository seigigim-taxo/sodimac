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

// Live reload por USB con ADB reverse tcp:8100 tcp:8100
if (process.env.CAPACITOR_LIVE_RELOAD === 'true') {
  config.server = {
    url: 'http://localhost:8100',
    cleartext: true,
    androidScheme: 'http',
  };
}

export default config;
