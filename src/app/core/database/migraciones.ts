/*
 * Evolución del esquema local sin perder lo contado.
 *
 * Hasta acá, cualquier cambio de SODIMAC_DB_VERSION borraba y recreaba todas
 * las tablas. Sirve en desarrollo y es inaceptable en terreno: una PDA con TAGs
 * finalizados sin sincronizar perdería ese trabajo al instalar una APK nueva.
 *
 * LO QUE **NO** NECESITA MIGRACIÓN
 *
 * Las tablas y los índices nuevos, no. El esquema se aplica siempre con
 * CREATE TABLE / CREATE INDEX IF NOT EXISTS *después* de las migraciones, así
 * que aparecen solos sobre una base existente. Escribir una migración para eso
 * es trabajo de más y una fuente de errores.
 *
 * Las migraciones son solo para lo que ese IF NOT EXISTS no puede: columnas
 * nuevas en tablas que ya existen, constraints cambiados y transformaciones de
 * datos.
 *
 * (Por eso el registro arranca vacío: el salto de la v43 publicada a la v46
 * solo agrega la tabla sod_conteo_lectura y cambia DEFAULTs que ya no se
 * disparan —los repositorios pasan la fecha explícita desde el arreglo de zona
 * horaria—. No hay una sola columna que agregar.)
 */

/* Una migración lleva la base de `version - 1` a `version`. */
export interface Migracion {
  version: number;
  descripcion: string;
  sql: readonly string[];
}

export const MIGRACIONES: readonly Migracion[] = [
  // Sin migraciones pendientes. Ver el comentario de arriba antes de agregar una.
];

/*
 * Última versión publicada antes de que la versión viviera dentro de la base.
 * Una PDA con datos pero sin registro de versión estaba en esta.
 */
export const VERSION_PREVIA_A_META = 43;

/*
 * Piso migrable. Por debajo de la v43 el esquema era de otra generación
 * (cat_operador, conteo_local, sesion_trabajo...) y no hay camino incremental
 * razonable: se recrea. No es una pérdida real, esas versiones nunca salieron.
 */
export const VERSION_MINIMA_MIGRABLE = 43;

export type PlanEsquema =
  /* Base vacía: se crea el esquema y se marca la versión destino. */
  | { tipo: 'NUEVA' }
  /* Nada que hacer. */
  | { tipo: 'AL_DIA' }
  | { tipo: 'MIGRAR'; migraciones: Migracion[] }
  /* Último recurso: borrar y recrear. Siempre con motivo, nunca en silencio. */
  | { tipo: 'RECREAR'; motivo: string };

/*
 * De dónde viene esta base.
 *
 * El caso que importa es el segundo: una PDA que ya trabajó con el esquema
 * viejo guarda su versión en Capacitor Preferences, fuera de la base. Si no se
 * la reconociera, se la trataría como instalación nueva y se borraría todo —
 * exactamente lo que este archivo existe para evitar.
 *
 * Devuelve null solo cuando de verdad no hay nada: instalación limpia.
 */
export function resolverVersionInicial(estado: {
  versionEnMeta: number | null;
  versionEnPreferences: number | null;
  hayTablas: boolean;
}): number | null {
  if (estado.versionEnMeta !== null) return estado.versionEnMeta;
  if (estado.versionEnPreferences !== null) return estado.versionEnPreferences;
  /*
   * Hay tablas pero nadie dejó registro de versión. No debería pasar; si pasa,
   * asumir la última publicada es mejor que borrar datos por las dudas.
   */
  if (estado.hayTablas) return VERSION_PREVIA_A_META;
  return null;
}

export function planificarEsquema(
  actual: number | null,
  destino: number,
  registro: readonly Migracion[] = MIGRACIONES
): PlanEsquema {
  if (actual === null) return { tipo: 'NUEVA' };
  if (actual === destino) return { tipo: 'AL_DIA' };

  /*
   * Versión guardada mayor que la del código: alguien instaló una APK más
   * vieja. No escribimos migraciones hacia atrás, así que recrear es lo único
   * honesto — seguir con un esquema del futuro rompería de formas peores.
   */
  if (actual > destino) {
    return { tipo: 'RECREAR', motivo: `la base está en v${actual} y esta versión es v${destino}` };
  }

  if (actual < VERSION_MINIMA_MIGRABLE) {
    return { tipo: 'RECREAR', motivo: `v${actual} es anterior a la mínima migrable (v${VERSION_MINIMA_MIGRABLE})` };
  }

  const migraciones = registro
    .filter((m) => m.version > actual && m.version <= destino)
    .sort((a, b) => a.version - b.version);

  return { tipo: 'MIGRAR', migraciones };
}
