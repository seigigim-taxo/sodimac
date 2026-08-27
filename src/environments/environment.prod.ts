export const environment = {
  production: true,
  apiUrl: 'http://50.16.13.230/app/ws/sodimac/api',
  authEndpoint: 'auth/login.php',
  preparacionEndpoint: 'sincronizaciones/preparacion.php',
  // Consulta liviana de conteo nuevo. Pendiente de que el backend lo exponga.
  asignacionEndpoint: 'asignaciones/nuevo-conteo.php',
  // Manifiesto de version para la autoactualizacion. Archivo estatico; cuelga
  // de api/ para heredar CORS. Ver server/README.md.
  actualizacionEndpoint: 'actualizaciones/version.json',
  alwaysSyncAfterLogin: false
};
