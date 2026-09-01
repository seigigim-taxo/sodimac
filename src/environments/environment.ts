// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiUrl: 'http://50.16.13.230/app/ws/sodimac/api',
  authEndpoint: 'auth/login_dev.php',
  preparacionEndpoint: 'sincronizaciones/preparacion_dev.php',
  /*
   * Manifiesto de version para la autoactualizacion. Archivo estatico; cuelga
   * de api/ para heredar CORS. Ver server/README.md.
   *
   * Desarrollo apunta a un manifiesto APARTE del de produccion. Los dos
   * environments comparten apiUrl, asi que mientras los dos leyeran
   * version.json no habia forma de probar la oferta de actualizacion sin
   * ofrecersela tambien a las PDAs en terreno: se toca version_test.json, se
   * prueba, y lo que ven los operadores no se movio nunca.
   *
   * Si version_test.json no existe en el servidor, la consulta falla y
   * simplemente no se ofrece nada — la app sigue funcionando igual.
   */
  actualizacionEndpoint: 'actualizaciones/version_test.json',
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
