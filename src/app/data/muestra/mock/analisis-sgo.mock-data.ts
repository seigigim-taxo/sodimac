import { LineaMuestraParaGuardar } from '../../../domain/muestra/repositories/muestra-detalle.repository';

/*
 * SKUs que el "SGO" agrega a la muestra de cada ronda sin que se hayan contado
 * antes. Existen para ejercitar una regla del flujo que no se puede probar solo
 * con diferencias: una iteración puede traer productos que no estaban en la
 * muestra anterior.
 *
 * También son los que garantizan que la maqueta sea recorrible: si el operador
 * contara todo exacto, no habría diferencias y la ronda 2 nunca se abriría.
 *
 * A partir de la iteración 4 no hay nada: es el corte que hace alcanzable el
 * final del ciclo.
 */
export const SKUS_NUEVOS_POR_ITERACION: Record<number, Omit<LineaMuestraParaGuardar, 'idMuestraDet'>[]> = {
  2: [
    { sku: '8412345', codigoBarras: '7801234084125', descripcion: 'Taladro percutor 650W',      stockSistema: 12 },
    { sku: '8412346', codigoBarras: '7801234084132', descripcion: 'Set brocas HSS 19 piezas',   stockSistema: 30 },
  ],
  3: [
    { sku: '8412347', codigoBarras: '7801234084149', descripcion: 'Cinta métrica 5m',           stockSistema: 45 },
  ],
};
