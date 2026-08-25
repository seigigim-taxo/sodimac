import { Zona } from '../models/zona.model';
import {
  contieneTag,
  detectarSuperposiciones,
  resolverZonaPorTag,
  tieneRango,
} from './zona-por-tag.utils';

function zona(parcial: Partial<Zona> & { id: number }): Zona {
  return {
    sucursalId: 1,
    nombre: `Z${parcial.id}`,
    descripcion: null,
    tagDesde: null,
    tagHasta: null,
    ...parcial,
  };
}

const SALA    = zona({ id: 1, nombre: 'SALA',    tagDesde: 1000, tagHasta: 1999 });
const BODEGA  = zona({ id: 2, nombre: 'BODEGA',  tagDesde: 2000, tagHasta: 2999 });
const ALTILLO = zona({ id: 3, nombre: 'ALTILLO', tagDesde: 3000, tagHasta: 3999 });
const TIENDA  = [SALA, BODEGA, ALTILLO];

describe('resolverZonaPorTag', () => {
  it('resuelve un TAG que cae dentro de un rango', () => {
    expect(resolverZonaPorTag('2500', TIENDA)).toEqual({ estado: 'RESUELTA', zona: BODEGA });
  });

  /*
   * Los bordes son el caso que más se rompe al refactorizar: el rango se define
   * como lo dice el operador ("del 1000 al 1999"), o sea con las dos puntas
   * incluidas. Un `<` de más deja el primer o el último TAG de cada zona sin
   * poder contarse, y eso aparece en terreno, no acá.
   */
  it('incluye el extremo inferior', () => {
    expect(resolverZonaPorTag('1000', TIENDA)).toEqual({ estado: 'RESUELTA', zona: SALA });
  });

  it('incluye el extremo superior', () => {
    expect(resolverZonaPorTag('1999', TIENDA)).toEqual({ estado: 'RESUELTA', zona: SALA });
  });

  it('el número siguiente ya es de la zona de al lado', () => {
    expect(resolverZonaPorTag('2000', TIENDA)).toEqual({ estado: 'RESUELTA', zona: BODEGA });
  });

  it('tolera espacios alrededor del número', () => {
    expect(resolverZonaPorTag('  2500  ', TIENDA)).toEqual({ estado: 'RESUELTA', zona: BODEGA });
  });

  describe('sin coincidencia', () => {
    it('un TAG por debajo de todos los rangos', () => {
      expect(resolverZonaPorTag('500', TIENDA)).toEqual({ estado: 'SIN_COINCIDENCIA' });
    });

    it('un TAG por encima de todos los rangos', () => {
      expect(resolverZonaPorTag('9999', TIENDA)).toEqual({ estado: 'SIN_COINCIDENCIA' });
    });

    it('un TAG en un hueco entre dos rangos', () => {
      const conHueco = [SALA, zona({ id: 9, tagDesde: 5000, tagHasta: 5999 })];
      expect(resolverZonaPorTag('3000', conHueco)).toEqual({ estado: 'SIN_COINCIDENCIA' });
    });

    it('un TAG no numérico', () => {
      expect(resolverZonaPorTag('ABC', TIENDA)).toEqual({ estado: 'SIN_COINCIDENCIA' });
    });

    it('un TAG con decimales', () => {
      expect(resolverZonaPorTag('2500.5', TIENDA)).toEqual({ estado: 'SIN_COINCIDENCIA' });
    });
  });

  /*
   * SIN_RANGOS es un problema de datos del WS, no del operador, y por eso se
   * distingue de SIN_COINCIDENCIA: reintentar no lo arregla. Si los dos casos
   * devolvieran lo mismo, el operador tipearía TAGs para siempre sin saber que
   * la tienda nunca va a resolver ninguno.
   */
  describe('sin rangos configurados', () => {
    it('cuando ninguna zona tiene rango', () => {
      const sinRangos = [zona({ id: 1 }), zona({ id: 2 })];
      expect(resolverZonaPorTag('2500', sinRangos)).toEqual({ estado: 'SIN_RANGOS' });
    });

    it('cuando no hay zonas', () => {
      expect(resolverZonaPorTag('2500', [])).toEqual({ estado: 'SIN_RANGOS' });
    });

    it('una zona con solo una cota no cuenta como configurada', () => {
      const media = [zona({ id: 1, tagDesde: 1000, tagHasta: null })];
      expect(resolverZonaPorTag('1500', media)).toEqual({ estado: 'SIN_RANGOS' });
    });

    // Basta una zona bien configurada para que la tienda sea operable: las
    // demás simplemente no participan de la derivación.
    it('con al menos una zona con rango ya no es SIN_RANGOS', () => {
      const mixta = [zona({ id: 1 }), BODEGA];
      expect(resolverZonaPorTag('7777', mixta)).toEqual({ estado: 'SIN_COINCIDENCIA' });
    });
  });
});

describe('tieneRango', () => {
  it('exige las dos cotas', () => {
    expect(tieneRango(BODEGA)).toBe(true);
    expect(tieneRango(zona({ id: 4, tagDesde: 10, tagHasta: null }))).toBe(false);
    expect(tieneRango(zona({ id: 5, tagDesde: null, tagHasta: 10 }))).toBe(false);
    expect(tieneRango(zona({ id: 6 }))).toBe(false);
  });
});

describe('contieneTag', () => {
  it('una zona sin rango no contiene ningún TAG', () => {
    expect(contieneTag(zona({ id: 7 }), 1500)).toBe(false);
  });
});

/*
 * El cliente confirmó que hoy los rangos no se superponen. Esto no existe para
 * el presente sino para el día que el WS mande datos malos: sin la detección,
 * la derivación devolvería la primera zona que encuentre y el conteo entero se
 * imputaría a la zona equivocada sin que nadie lo note.
 */
describe('detectarSuperposiciones', () => {
  it('no encuentra nada con rangos contiguos', () => {
    expect(detectarSuperposiciones(TIENDA)).toEqual([]);
  });

  it('detecta dos rangos que se pisan parcialmente', () => {
    const a = zona({ id: 1, tagDesde: 1000, tagHasta: 2000 });
    const b = zona({ id: 2, tagDesde: 1500, tagHasta: 2500 });
    expect(detectarSuperposiciones([a, b])).toEqual([[a, b]]);
  });

  it('detecta un rango contenido dentro de otro', () => {
    const grande  = zona({ id: 1, tagDesde: 1000, tagHasta: 5000 });
    const chico   = zona({ id: 2, tagDesde: 2000, tagHasta: 2500 });
    expect(detectarSuperposiciones([grande, chico])).toEqual([[grande, chico]]);
  });

  it('detecta el solapamiento de un solo número en el borde', () => {
    const a = zona({ id: 1, tagDesde: 1000, tagHasta: 2000 });
    const b = zona({ id: 2, tagDesde: 2000, tagHasta: 3000 });
    expect(detectarSuperposiciones([a, b])).toEqual([[a, b]]);
  });

  it('ignora las zonas sin rango', () => {
    expect(detectarSuperposiciones([zona({ id: 1 }), zona({ id: 2 }), BODEGA])).toEqual([]);
  });
});
