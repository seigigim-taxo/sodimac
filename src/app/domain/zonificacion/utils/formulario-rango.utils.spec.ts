import { VistaZonificacion } from '../models/vista-zonificacion.model';
import { CATALOGO_V1 } from './reglas-zonificacion.fixtures';
import { ContextoFormularioRango, EntradaFormularioRango, evaluarAnulacion, evaluarFormularioRango, parsearTag } from './formulario-rango.utils';

const rangoVista = (id: number | string, desde: number, hasta: number, extra: object = {}) => ({
  id, idServidor: typeof id === 'number' ? id : null, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', tagDesde: desde, tagHasta: hasta,
  referenciaUbicacion: null, cantidad: hasta - desde + 1, pendiente: false, operacionUid: null, ...extra,
});

const vista = (extra: Partial<VistaZonificacion> = {}): VistaZonificacion => ({
  estado: 'BORRADOR',
  confirmacionPendiente: false,
  reaperturaPendiente: false,
  rangos: [rangoVista(758, 1128, 1131), rangoVista(761, 1132, 1134)],
  tagsAnulados: [],
  pendientes: [],
  rechazadas: [],
  ...extra,
});

const ctx = (extra: Partial<ContextoFormularioRango> = {}): ContextoFormularioRango => ({ estado: 'BORRADOR', catalogo: CATALOGO_V1, vista: vista(), ...extra });
const entrada = (extra: Partial<EntradaFormularioRango> = {}): EntradaFormularioRango => ({ desde: '', hasta: '', referencia: '', idRango: null, ...extra });

describe('parsearTag', () => {
  it('acepta dígitos con espacios sobrantes (lo que entrega el escáner)', () => {
    expect(parsearTag(' 1135 ')).toBe(1135);
    expect(parsearTag('3117')).toBe(3117);
  });

  it('rechaza lo que no es un entero positivo', () => {
    for (const malo of ['', '   ', 'abc', '12a', '-5', '0', '1.5', '1e3', '1 2']) {
      expect(parsearTag(malo)).toBeNull(malo);
    }
  });

  it('rechaza números tan grandes que ya no son exactos', () => {
    expect(parsearTag('99999999999999999999')).toBeNull();
  });
});

describe('evaluarFormularioRango', () => {
  it('vacío: sin errores y sin poder guardar (el operador todavía no escribió)', () => {
    const e = evaluarFormularioRango(entrada(), ctx());
    expect(e).toEqual(jasmine.objectContaining({ desde: null, hasta: null, zona: null, cantidad: null, errorDesde: null, errorHasta: null, bloqueo: null, puedeGuardar: false }));
  });

  it('solo el primer TAG: detecta la zona y muestra su banda, sin cantidad todavía', () => {
    const e = evaluarFormularioRango(entrada({ desde: '1135' }), ctx());

    expect(e.zona?.codigoZona).toBe('ALTILLO');
    expect(e.banda).toBe('1000–2999');
    expect(e.cantidad).toBeNull();
    expect(e.puedeGuardar).toBeFalse();
  });

  it('dos TAG válidos: zona, cantidad y se puede guardar', () => {
    const e = evaluarFormularioRango(entrada({ desde: '1135', hasta: '1140', referencia: 'P49' }), ctx());

    expect(e).toEqual(jasmine.objectContaining({ desde: 1135, hasta: 1140, cantidad: 6, errorDesde: null, errorHasta: null, bloqueo: null, advertencia: null, puedeGuardar: true }));
  });

  it('un solo TAG (desde = hasta) vale uno', () => {
    expect(evaluarFormularioRango(entrada({ desde: '1300', hasta: '1300' }), ctx()).cantidad).toBe(1);
  });

  it('la cantidad descuenta los TAG anulados dentro', () => {
    const v = vista({ tagsAnulados: [{ numeroTag: 1136, motivo: 'rota', pendiente: false }] });
    expect(evaluarFormularioRango(entrada({ desde: '1135', hasta: '1140' }), ctx({ vista: v })).cantidad).toBe(5);
  });

  it('un valor que no es número se señala en su campo', () => {
    expect(evaluarFormularioRango(entrada({ desde: 'abc' }), ctx()).errorDesde).toBe('El TAG debe ser un número.');
    expect(evaluarFormularioRango(entrada({ desde: '1135', hasta: '11x' }), ctx()).errorHasta).toBe('El TAG debe ser un número.');
  });

  it('un primer TAG que no es de ninguna zona lo dice y no inventa banda', () => {
    const e = evaluarFormularioRango(entrada({ desde: '999', hasta: '1010' }), ctx());

    expect(e.errorDesde).toContain('no pertenece a ninguna zona');
    expect(e.banda).toBeNull();
    expect(e.cantidad).toBeNull(); // sin zona no hay cantidad que mostrar
    expect(e.puedeGuardar).toBeFalse();
  });

  it('sobre el tope de 8000 no hay zona', () => {
    expect(evaluarFormularioRango(entrada({ desde: '8001' }), ctx()).errorDesde).toContain('no pertenece a ninguna zona');
  });

  it('el último TAG en otra zona se marca en el último TAG, con la banda permitida', () => {
    const e = evaluarFormularioRango(entrada({ desde: '2990', hasta: '3001' }), ctx());

    expect(e.errorHasta).toBe('El TAG final queda fuera de la zona: debe estar entre 1000 y 2999.');
    expect(e.bloqueo).toBeNull();
    expect(e.puedeGuardar).toBeFalse();
  });

  it('un último TAG menor que el primero bloquea', () => {
    const e = evaluarFormularioRango(entrada({ desde: '1300', hasta: '1299' }), ctx());

    expect(e.bloqueo).toBe('El último TAG no puede ser menor que el primero.');
    expect(e.cantidad).toBeNull();
    expect(e.puedeGuardar).toBeFalse();
  });

  it('cruce con otro rango: dice con cuál y no deja guardar', () => {
    const e = evaluarFormularioRango(entrada({ desde: '1130', hasta: '1135' }), ctx());

    expect(e.bloqueo).toBe('El rango se cruza con otro (1128–1131).');
    expect(e.cantidad).toBe(6);
    expect(e.puedeGuardar).toBeFalse();
  });

  it('cruce con un rango pendiente de envío', () => {
    const v = vista({ rangos: [...vista().rangos, rangoVista('uid-9', 1200, 1210, { pendiente: true })] });
    expect(evaluarFormularioRango(entrada({ desde: '1205', hasta: '1206' }), ctx({ vista: v })).bloqueo).toContain('1200–1210');
  });

  it('al editar, el rango no se cruza consigo mismo', () => {
    const e = evaluarFormularioRango(entrada({ desde: '1132', hasta: '1136', idRango: 761 }), ctx());
    expect(e.bloqueo).toBeNull();
    expect(e.puedeGuardar).toBeTrue();
  });

  it('referencia de más de 250 caracteres bloquea', () => {
    const e = evaluarFormularioRango(entrada({ desde: '1135', hasta: '1140', referencia: 'x'.repeat(251) }), ctx());
    expect(e.bloqueo).toBe('La referencia es muy larga: máximo 250 caracteres.');
  });

  it('zonificación confirmada: no se puede guardar', () => {
    const e = evaluarFormularioRango(entrada({ desde: '1135', hasta: '1140' }), ctx({ estado: 'CONFIRMADA' }));
    expect(e.puedeGuardar).toBeFalse();
    expect(e.bloqueo).toContain('confirmada');
  });

  describe('cantidad alta', () => {
    const conUmbrales = (advertencia: number | null, maxima: number | null) => ({
      ...CATALOGO_V1,
      parametros: { ...CATALOGO_V1.parametros, cantidadAdvertencia: advertencia, cantidadMaxima: maxima },
    });

    it('sobre el umbral de advertencia avisa pero deja guardar', () => {
      const e = evaluarFormularioRango(entrada({ desde: '1000', hasta: '1480' }), ctx({ catalogo: conUmbrales(100, null), vista: vista({ rangos: [] }) }));

      expect(e.advertencia).toBe('Son 481 TAG. Revisa que el último TAG sea correcto.');
      expect(e.puedeGuardar).toBeTrue();
    });

    it('sobre el máximo bloquea', () => {
      const e = evaluarFormularioRango(entrada({ desde: '1000', hasta: '1480' }), ctx({ catalogo: conUmbrales(100, 300), vista: vista({ rangos: [] }) }));

      expect(e.bloqueo).toBe('El rango tiene 481 TAG y el máximo es 300.');
      expect(e.puedeGuardar).toBeFalse();
    });

    it('sin umbral en el catálogo (hoy) avisa desde 100 TAG: 99 no avisa y 100 sí', () => {
      const sinRangos = ctx({ vista: vista({ rangos: [] }) });

      const noba = evaluarFormularioRango(entrada({ desde: '1500', hasta: '1598' }), sinRangos); // 99 TAG
      expect(noba.cantidad).toBe(99);
      expect(noba.advertencia).toBeNull();

      const si = evaluarFormularioRango(entrada({ desde: '1500', hasta: '1599' }), sinRangos); // 100 TAG
      expect(si.cantidad).toBe(100);
      expect(si.advertencia).toBe('Son 100 TAG. Revisa que el último TAG sea correcto.');
      expect(si.puedeGuardar).toBeTrue(); // es un aviso, no un bloqueo
    });

    it('si el catálogo trae su propio umbral, manda ese', () => {
      const catalogo = { ...CATALOGO_V1, parametros: { ...CATALOGO_V1.parametros, cantidadAdvertencia: 500 } };
      const e = evaluarFormularioRango(entrada({ desde: '1000', hasta: '1199' }), ctx({ catalogo, vista: vista({ rangos: [] }) }));
      expect(e.cantidad).toBe(200);
      expect(e.advertencia).toBeNull();
    });
  });
});

describe('evaluarAnulacion', () => {
  const anula = (numero: string, motivo: string, v = vista()) => evaluarAnulacion({ numero, motivo }, v, 10);

  it('vacío: nada que mostrar todavía', () => {
    expect(anula('', '')).toEqual({ numero: null, rango: null, errorNumero: null, errorMotivo: null, caracteres: 0, puedeAnular: false });
  });

  it('un TAG de un rango: dice en cuál está y cuánto baja', () => {
    const e = anula('1129', '');

    expect(e.rango).toEqual({ zona: 'ALTILLO', texto: '1128–1131', cantidadAntes: 4, cantidadDespues: 3 });
    expect(e.puedeAnular).toBeFalse();
  });

  it('con motivo suficiente se puede anular', () => {
    expect(anula('1129', 'No se encontró en la tienda').puedeAnular).toBeTrue();
  });

  it('cuenta los caracteres del motivo sin espacios en los extremos', () => {
    expect(anula('1129', '  abc  ').caracteres).toBe(3);
  });

  it('motivo corto: no es error mientras está vacío, sí cuando ya escribió algo', () => {
    expect(anula('1129', '').errorMotivo).toBeNull();
    expect(anula('1129', 'rota').errorMotivo).toBe('El motivo debe tener al menos 10 caracteres.');
  });

  it('un número que no es TAG', () => {
    expect(anula('abc', 'No se encontró en la tienda').errorNumero).toBe('El TAG debe ser un número.');
  });

  it('un TAG que no está en ningún rango', () => {
    const e = anula('2500', 'No se encontró en la tienda');

    expect(e.errorNumero).toBe('El TAG 2500 no pertenece a ningún rango de esta agenda.');
    expect(e.rango).toBeNull();
    expect(e.puedeAnular).toBeFalse();
  });

  it('un TAG ya anulado: lo dice y la cantidad no baja otra vez', () => {
    const v = vista({ tagsAnulados: [{ numeroTag: 1129, motivo: 'rota', pendiente: false }], rangos: [rangoVista(758, 1128, 1131, { cantidad: 3 })] });

    const e = anula('1129', 'No se encontró en la tienda', v);

    expect(e.errorNumero).toBe('Ese TAG ya está anulado.');
    expect(e.rango?.cantidadDespues).toBe(3);
    expect(e.puedeAnular).toBeFalse();
  });
});
