/*
 * La sesión de trabajo que quedó abierta en la PDA: el TAG que el operador
 * estaba contando cuando la app dejó de correr (batería, apagón, kill del SO).
 *
 * No es una tabla nueva — se deduce de las líneas EN_CURSO de
 * sod_conteo_detalle y de la ubicación a la que cuelgan. SQLite ya guarda todo
 * lo necesario para volver exactamente al mismo TAG; lo que se perdía era el
 * estado en memoria que apuntaba a ello.
 */
export interface SesionTrabajoEnCurso {
  eventoId:         number;
  conteoId:         number;
  ubicacionId:      number;
  zonaId:           number;
  tag:              string;
  /* sod_ubicacion.codigo: la ubicación precisa que tecleó el operador (pasillo, cabecera). */
  ubicacionPrecisa: string;
}
