export const environment = {
  production: false,
  apiUrl: 'http://50.16.13.230/app/ws/sodimac/api',
  authEndpoint: 'auth/login_mockup.php',
  preparacionEndpoint: 'sincronizaciones/preparacion_mockup.php',
  // Manifiesto de version para la autoactualizacion. Archivo estatico; cuelga
  // de api/ para heredar CORS. Ver server/README.md.
  actualizacionEndpoint: 'actualizaciones/version.json',
  alwaysSyncAfterLogin: false,
  // El mockup no implementa el contrato de jornadas (jornadas[]); mandar la
  // fecha local no serviría de nada y solo confundiría qué environment hace qué.
  enviarVentanaLocal: false
};
