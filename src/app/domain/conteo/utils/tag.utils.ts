import { ConteoResumen } from '../models/conteo-resumen.model';

/*
 * Cuántos TAGs FÍSICOS distintos se usaron.
 *
 * No es lo mismo que la cantidad de filas de conteo. Un mismo TAG puede
 * aparecer más de una vez —se cerró, se volvió a abrir, o dos operadores
 * contaron la misma ubicación— y en el resumen eso tiene que valer uno: el
 * número responde "cuántas ubicaciones se recorrieron", no "cuántos registros
 * hay en la base".
 *
 * Existe como función y no repetido en la pantalla porque el resumen lo muestra
 * en DOS lugares —el avance de arriba y el resumen global de abajo— sobre
 * conjuntos distintos. Con dos cuentas separadas, un día iban a discrepar y
 * nadie sabría cuál creer.
 *
 * Se normaliza el texto antes de comparar: un TAG escrito a mano puede venir
 * con espacios de sobra o en otra caja. "3001" y " 3001 " son la misma
 * ubicación física, y contarlos como dos sería justamente el error que esto
 * viene a evitar.
 *
 * Los conteos sin TAG no suman. No representan una ubicación identificable, y
 * agruparlos todos bajo la cadena vacía inventaría un TAG que no existe.
 */
export function contarTagsDistintos(conteos: readonly ConteoResumen[]): number {
  const distintos = new Set<string>();

  for (const conteo of conteos) {
    const tag = (conteo.tag ?? '').trim().toUpperCase();
    if (tag !== '') distintos.add(tag);
  }

  return distintos.size;
}
