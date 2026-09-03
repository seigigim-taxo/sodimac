import { contarTagsDistintos } from './tag.utils';
import { ConteoResumen } from '../models/conteo-resumen.model';

/*
 * Cuenta ubicaciones recorridas, no filas de la base. La diferencia importa en
 * el resumen que mira el supervisor: si un TAG se reabrió, sigue siendo una
 * sola ubicación.
 */
const conteo = (tag: string | null): ConteoResumen => ({
  conteoId: 1, eventoId: 1, ubicacionId: 1, operadorId: 1, pdaId: 1,
  estado: 'FINALIZADO', tag, zonaCodigo: 'PUNTO_VENTA', zonaNombre: 'Punto de venta',
  totalProductos: 1, totalUnidades: 1, iteracion: 1, fechaUltima: '2026-09-02 10:00:00',
});

describe('contarTagsDistintos', () => {
  it('cuenta uno por cada TAG diferente', () => {
    expect(contarTagsDistintos([conteo('3001'), conteo('3002'), conteo('3003')])).toBe(3);
  });

  /* El caso que motivó esto: el mismo TAG contado dos veces vale uno. */
  it('el mismo TAG repetido cuenta una sola vez', () => {
    expect(contarTagsDistintos([conteo('3001'), conteo('3001')])).toBe(1);
  });

  it('mezcla de repetidos y distintos', () => {
    const conteos = [conteo('3001'), conteo('3002'), conteo('3001'), conteo('3002'), conteo('3003')];

    expect(contarTagsDistintos(conteos)).toBe(3);
  });

  it('sin conteos da cero', () => {
    expect(contarTagsDistintos([])).toBe(0);
  });

  /*
   * Un TAG escrito a mano puede llegar con espacios o en otra caja. Es la
   * misma ubicación física: contarlo dos veces sería el error que esta función
   * viene a evitar.
   */
  describe('normalización', () => {
    it('ignora los espacios sobrantes', () => {
      expect(contarTagsDistintos([conteo('3001'), conteo(' 3001 ')])).toBe(1);
    });

    it('ignora mayúsculas y minúsculas', () => {
      expect(contarTagsDistintos([conteo('a12'), conteo('A12')])).toBe(1);
    });
  });

  /*
   * Un conteo sin TAG no identifica ninguna ubicación. Agruparlos todos bajo la
   * cadena vacía inventaría un TAG que no existe.
   */
  describe('conteos sin TAG', () => {
    it('no cuentan', () => {
      expect(contarTagsDistintos([conteo(null), conteo('')])).toBe(0);
    });

    it('no inflan el total de los que sí tienen', () => {
      expect(contarTagsDistintos([conteo('3001'), conteo(null), conteo('   ')])).toBe(1);
    });
  });
});
