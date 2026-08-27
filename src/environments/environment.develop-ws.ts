export const environment = {
  production: false,
  apiUrl: 'http://50.16.13.230/app/ws/sodimac/api',
  authEndpoint: 'auth/login.php',
  preparacionEndpoint: 'sincronizaciones/preparacion_ws.php',
  // Consulta liviana de conteo nuevo. Pendiente de que el backend lo exponga.
  asignacionEndpoint: 'asignaciones/nuevo-conteo.php',
  alwaysSyncAfterLogin: false
};
