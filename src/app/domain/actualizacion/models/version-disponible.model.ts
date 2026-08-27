/*
 * Lo que el servidor dice sobre la última versión publicada.
 *
 * Se lee de un archivo estático en el host — ver server/README.md. Que sea
 * estático y no un PHP es deliberado: no hay nada que calcular, y un archivo
 * no tiene base de datos que se caiga.
 */
export interface VersionDisponible {
  /*
   * LO ÚNICO que decide si hay que actualizar. Es el entero que Android compara
   * internamente. El nombre no sirve para eso: "1.10.0" es menor que "1.9.0" en
   * orden alfabético, y comparar versiones por texto es un clásico que rompe
   * recién en la décima versión.
   */
  versionCode: number;

  /** Sólo para mostrarle al operador. */
  versionName: string;

  /** URL absoluta del APK. La descarga nativa no resuelve rutas relativas. */
  url: string;

  /*
   * Huella del archivo, para verificar la descarga antes de instalar.
   *
   * Sin esto, una descarga cortada por mala señal de tienda le llega al
   * instalador de Android como archivo corrupto, y el operador ve un error del
   * sistema sin contexto. Con esto la app puede decir "la descarga falló,
   * reintentá" y borrar el archivo.
   */
  sha256: string;

  /** Si es true, la app no deja seguir contando hasta actualizar. */
  obligatoria: boolean;
}

/*
 * El manifiesto trae además un campo `notas`. La app NO lo lee: lo escribe
 * quien publica la APK, sale en lenguaje de desarrollo y al operador no le dice
 * nada. Queda en el archivo como referencia de qué APK es cada una para quien
 * lo mantiene.
 */

/** Estado de la comparación entre lo instalado y lo publicado. */
export interface EstadoActualizacion {
  versionInstalada: number;
  disponible: VersionDisponible | null;
  hayActualizacion: boolean;
}
