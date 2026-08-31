// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiUrl: 'http://50.16.13.230/app/ws/sodimac/api',
  authEndpoint: 'auth/login_dev.php',
  /*
   * preparacion.php y no preparacion_dev.php: el _dev da 404 en 50.16.13.230.
   * Nunca se subió, aunque login_dev.php sí está.
   *
   * El 404 no se ve como 404: Apache no le pone headers de CORS a sus páginas
   * de error, así que el WebView reporta "blocked by CORS policy — no
   * Access-Control-Allow-Origin header" y manda a buscar un problema de CORS
   * que no existe. Si vuelve a aparecer ese mensaje, mirar primero si la URL
   * existe.
   */
  preparacionEndpoint: 'sincronizaciones/preparacion.php',
  // Manifiesto de version para la autoactualizacion. Archivo estatico; cuelga
  // de api/ para heredar CORS. Ver server/README.md.
  actualizacionEndpoint: 'actualizaciones/version.json',
  alwaysSyncAfterLogin: false
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
