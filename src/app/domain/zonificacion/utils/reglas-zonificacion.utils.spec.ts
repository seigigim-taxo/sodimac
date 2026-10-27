import { CATALOGO_V1 } from './reglas-zonificacion.fixtures';
import {
  ContextoRango,
  DatosRango,
  TAG_TOPE_ZONIFICACION,
  buscarCruce,
  calcularCantidad,
  evaluarCantidad,
  validarAnularTag,
  validarConfirmarLocal,
  validarGuardarRango,
  validarMotivo,
  validarReabrir,
  zonaDelTag,
} from './reglas-zonificacion.utils';

/*
 * Espejo de sodimac-ws/tests/zonificacion/reglas_test.php: los mismos casos, con
 * los mismos códigos de error y los mismos campos `data`.
 */
const rango = (id: number | string, tagDesde: number, tagHasta: number) => ({ id, tagDesde, tagHasta });

const datos = (extra: Partial<DatosRango> = {}): DatosRango => ({
  idRango: null,
  codigoZona: 'ALTILLO',
  tagDesde: 1135,
  tagHasta: 1140,
  referenciaUbicacion: 'P49',
  ...extra,
});

const ctx = (extra: Partial<ContextoRango> = {}): ContextoRango => ({
  estado: 'BORRADOR',
  catalogo: CATALOGO_V1,
  rangosActivos: [rango(758, 1128, 1131), rango(761, 1132, 1134)],
  tagsAnulados: [],
  ...extra,
});

describe('zonaDelTag', () => {
  it('devuelve la zona de cada banda, incluidos los extremos', () => {
    expect(zonaDelTag(CATALOGO_V1.zonas, 1000)?.codigoZona).toBe('ALTILLO');
    expect(zonaDelTag(CATALOGO_V1.zonas, 2999)?.codigoZona).toBe('ALTILLO');
    expect(zonaDelTag(CATALOGO_V1.zonas, 3000)?.codigoZona).toBe('PUNTO_VENTA');
    expect(zonaDelTag(CATALOGO_V1.zonas, 8000)?.codigoZona).toBe('VENTAS_ADICIONALES');
  });

  it('un TAG fuera de toda banda, o sobre el tope de 8000, no tiene zona', () => {
    expect(zonaDelTag(CATALOGO_V1.zonas, 999)).toBeNull();
    expect(zonaDelTag(CATALOGO_V1.zonas, TAG_TOPE_ZONIFICACION + 1)).toBeNull();
  });

  it('el tope aplica aunque el catálogo cubra más allá de 8000', () => {
    const ancha = [{ ...CATALOGO_V1.zonas[4], tagHasta: 9999 }];
    expect(zonaDelTag(ancha, 8001)).toBeNull();
  });
});

describe('calcularCantidad', () => {
  it('cuenta ambos extremos', () => {
    expect(calcularCantidad(1135, 1140)).toBe(6);
    expect(calcularCantidad(3117, 3117)).toBe(1);
  });

  it('descuenta los TAG anulados dentro del rango, una sola vez cada uno', () => {
    expect(calcularCantidad(1135, 1140, [1136, 1136, 1139])).toBe(4);
  });

  it('ignora los anulados fuera del rango', () => {
    expect(calcularCantidad(1135, 1140, [1134, 1141])).toBe(6);
  });

  it('un rango invertido vale cero', () => {
    expect(calcularCantidad(1140, 1135)).toBe(0);
  });
});

describe('buscarCruce', () => {
  const rangos = [rango(1, 1100, 1110), rango(2, 1120, 1130)];

  it('contiguo no es cruce', () => {
    expect(buscarCruce(1111, 1119, rangos)).toBeNull();
  });

  it('un solo TAG en el borde es cruce', () => {
    expect(buscarCruce(1110, 1115, rangos)?.id).toBe(1);
    expect(buscarCruce(1115, 1120, rangos)?.id).toBe(2);
  });

  it('un rango que envuelve a otro es cruce', () => {
    expect(buscarCruce(1090, 1140, rangos)?.id).toBe(1);
  });

  it('editar un rango sobre sí mismo no cruza', () => {
    expect(buscarCruce(1100, 1112, rangos, 1)).toBeNull();
  });

  it('un rango pendiente (clave local) también cruza y también se puede excluir', () => {
    const conPendiente = [...rangos, rango('local-7', 1200, 1210)];
    expect(buscarCruce(1205, 1206, conPendiente)?.id).toBe('local-7');
    expect(buscarCruce(1205, 1206, conPendiente, 'local-7')).toBeNull();
  });
});

describe('evaluarCantidad', () => {
  it('sin umbrales no hay límite ni advertencia', () => {
    expect(evaluarCantidad(100000, { cantidadAdvertencia: null, cantidadMaxima: null })).toEqual({ ok: true, advertencia: false });
  });

  it('sobre la advertencia se avisa pero se acepta', () => {
    expect(evaluarCantidad(51, { cantidadAdvertencia: 50, cantidadMaxima: 100 })).toEqual({ ok: true, advertencia: true });
    expect(evaluarCantidad(50, { cantidadAdvertencia: 50, cantidadMaxima: 100 })).toEqual({ ok: true, advertencia: false });
  });

  it('sobre el máximo se rechaza con CANTIDAD_EXCESIVA', () => {
    expect(evaluarCantidad(101, { cantidadAdvertencia: 50, cantidadMaxima: 100 })).toEqual({
      ok: false,
      codigo: 'CANTIDAD_EXCESIVA',
      data: { cantidad: 101, maximo: 100 },
    });
  });
});

describe('validarGuardarRango', () => {
  it('acepta el rango de ejemplo del contrato', () => {
    const r = validarGuardarRango(datos(), ctx());
    expect(r.ok).toBeTrue();
    if (r.ok) {
      expect(r.cantidad).toBe(6);
      expect(r.zona.codigoZona).toBe('ALTILLO');
      expect(r.advertencia).toBeFalse();
    }
  });

  it('acepta un solo TAG y los extremos justos de la banda', () => {
    expect(validarGuardarRango(datos({ tagDesde: 1300, tagHasta: 1300 }), ctx()).ok).toBeTrue();
    expect(validarGuardarRango(datos({ tagDesde: 1000, tagHasta: 2999 }), ctx({ rangosActivos: [] })).ok).toBeTrue();
  });

  it('descuenta los TAG anulados de la cantidad', () => {
    const r = validarGuardarRango(datos(), ctx({ tagsAnulados: [1136] }));
    expect(r.ok && r.cantidad).toBe(5);
  });

  it('una referencia vacía se guarda como null', () => {
    const r = validarGuardarRango(datos({ referenciaUbicacion: '' }), ctx());
    expect(r.ok && r.referenciaUbicacion).toBeNull();
  });

  it('ZONIFICACION_CONFIRMADA si la zonificación está confirmada', () => {
    expect(validarGuardarRango(datos(), ctx({ estado: 'CONFIRMADA' }))).toEqual({
      ok: false,
      codigo: 'ZONIFICACION_CONFIRMADA',
      data: { estado: 'CONFIRMADA' },
    });
  });

  it('PETICION_INVALIDA con el campo, si un TAG no es un entero positivo', () => {
    expect(validarGuardarRango(datos({ tagDesde: NaN }), ctx())).toEqual({ ok: false, codigo: 'PETICION_INVALIDA', data: { campo: 'tag_desde' } });
    expect(validarGuardarRango(datos({ tagHasta: 1.5 }), ctx())).toEqual({ ok: false, codigo: 'PETICION_INVALIDA', data: { campo: 'tag_hasta' } });
    expect(validarGuardarRango(datos({ tagDesde: 0 }), ctx())).toEqual({ ok: false, codigo: 'PETICION_INVALIDA', data: { campo: 'tag_desde' } });
  });

  it('ZONA_INVALIDA si la zona no existe en el catálogo', () => {
    expect(validarGuardarRango(datos({ codigoZona: 'NO_EXISTE' }), ctx())).toEqual({
      ok: false,
      codigo: 'ZONA_INVALIDA',
      data: { codigo_zona: 'NO_EXISTE' },
    });
  });

  it('ZONA_SIN_TIPO si la zona del catálogo no tiene tipo de ubicación', () => {
    const catalogo = { ...CATALOGO_V1, zonas: CATALOGO_V1.zonas.map((z) => ({ ...z, codigoTipoUbicacion: null, idTipoUbicacion: null })) };
    expect(validarGuardarRango(datos(), ctx({ catalogo }))).toEqual({ ok: false, codigo: 'ZONA_SIN_TIPO', data: { codigo_zona: 'ALTILLO' } });
  });

  it('RANGO_INVALIDO si hasta es menor que desde', () => {
    expect(validarGuardarRango(datos({ tagDesde: 1300, tagHasta: 1299 }), ctx())).toEqual({ ok: false, codigo: 'RANGO_INVALIDO', data: {} });
  });

  it('RANGO_FUERA_DE_ZONA indica la banda permitida y el extremo que falla', () => {
    expect(validarGuardarRango(datos({ tagDesde: 3000, tagHasta: 3001 }), ctx())).toEqual({
      ok: false,
      codigo: 'RANGO_FUERA_DE_ZONA',
      data: { codigo_zona: 'ALTILLO', permitido_desde: 1000, permitido_hasta: 2999, campo: 'tag_desde' },
    });
    const hastaFuera = validarGuardarRango(datos({ tagDesde: 2990, tagHasta: 3001 }), ctx());
    expect(!hastaFuera.ok && hastaFuera.data['campo']).toBe('tag_hasta');
  });

  it('el tope de 8000 se acepta incluido y 8001 se rechaza', () => {
    const va = { codigoZona: 'VENTAS_ADICIONALES' };
    expect(validarGuardarRango(datos({ ...va, tagDesde: 7999, tagHasta: 8000 }), ctx()).ok).toBeTrue();
    const r = validarGuardarRango(datos({ ...va, tagDesde: 7990, tagHasta: 8001 }), ctx());
    expect(!r.ok && r.codigo).toBe('RANGO_FUERA_DE_ZONA');
    expect(!r.ok && r.data['permitido_hasta']).toBe(8000);
  });

  it('REFERENCIA_LARGA sobre 250 caracteres; 250 exactos se aceptan', () => {
    expect(validarGuardarRango(datos({ referenciaUbicacion: 'x'.repeat(250) }), ctx()).ok).toBeTrue();
    expect(validarGuardarRango(datos({ referenciaUbicacion: 'x'.repeat(251) }), ctx())).toEqual({
      ok: false,
      codigo: 'REFERENCIA_LARGA',
      data: { maximo: 250 },
    });
  });

  it('RANGO_CRUZADO con el rango que se cruza', () => {
    expect(validarGuardarRango(datos({ tagDesde: 1130, tagHasta: 1135 }), ctx())).toEqual({
      ok: false,
      codigo: 'RANGO_CRUZADO',
      data: { con: { id_zonificacion_det: 758, tag_desde: 1128, tag_hasta: 1131 } },
    });
  });

  it('editar un rango sobre sí mismo no es cruce', () => {
    expect(validarGuardarRango(datos({ idRango: 761, tagDesde: 1132, tagHasta: 1136 }), ctx()).ok).toBeTrue();
  });

  it('CANTIDAD_EXCESIVA solo si el catálogo trae un máximo', () => {
    const catalogo = { ...CATALOGO_V1, parametros: { ...CATALOGO_V1.parametros, cantidadMaxima: 5 } };
    const r = validarGuardarRango(datos(), ctx({ catalogo }));
    expect(r).toEqual({ ok: false, codigo: 'CANTIDAD_EXCESIVA', data: { cantidad: 6, maximo: 5 } });
  });

  it('sin umbral en el catálogo avisa sobre 99 TAG (100 sí, 99 no) y deja guardar', () => {
    const solo = ctx({ rangosActivos: [] });
    const justo = validarGuardarRango(datos({ tagDesde: 1500, tagHasta: 1598 }), solo);
    const pasa = validarGuardarRango(datos({ tagDesde: 1500, tagHasta: 1599 }), solo);

    expect(justo.ok && justo.advertencia).toBeFalse();
    expect(pasa.ok && pasa.advertencia).toBeTrue();
    expect(pasa.ok && pasa.cantidad).toBe(100);
  });

  it('el máximo del catálogo sigue bloqueando aunque el umbral sea el de por defecto', () => {
    const catalogo = { ...CATALOGO_V1, parametros: { ...CATALOGO_V1.parametros, cantidadMaxima: 150 } };
    const r = validarGuardarRango(datos({ tagDesde: 1500, tagHasta: 1699 }), ctx({ catalogo, rangosActivos: [] }));
    expect(r).toEqual({ ok: false, codigo: 'CANTIDAD_EXCESIVA', data: { cantidad: 200, maximo: 150 } });
  });

  it('marca advertencia con el umbral del catálogo', () => {
    const catalogo = { ...CATALOGO_V1, parametros: { ...CATALOGO_V1.parametros, cantidadAdvertencia: 5 } };
    const r = validarGuardarRango(datos(), ctx({ catalogo }));
    expect(r.ok && r.advertencia).toBeTrue();
  });

  it('el orden de comprobación: el estado gana sobre todo lo demás', () => {
    const r = validarGuardarRango(datos({ codigoZona: 'NO_EXISTE', tagDesde: 9 }), ctx({ estado: 'CONFIRMADA' }));
    expect(!r.ok && r.codigo).toBe('ZONIFICACION_CONFIRMADA');
  });

  it('el orden de comprobación: la zona gana sobre el rango invertido', () => {
    const r = validarGuardarRango(datos({ codigoZona: 'NO_EXISTE', tagDesde: 1300, tagHasta: 1299 }), ctx());
    expect(!r.ok && r.codigo).toBe('ZONA_INVALIDA');
  });
});

describe('validarMotivo', () => {
  it('exige el mínimo sin contar espacios en los extremos', () => {
    expect(validarMotivo('  corto  ', 10)).toEqual({ ok: false, codigo: 'MOTIVO_CORTO', data: { minimo: 10 } });
    expect(validarMotivo('  etiqueta dañada  ', 10).ok).toBeTrue();
    expect(validarMotivo('1234567890', 10).ok).toBeTrue();
    expect(validarMotivo('123456789', 10).ok).toBeFalse();
  });
});

describe('validarAnularTag', () => {
  const rangos = [rango(758, 1128, 1131)];

  it('acepta un TAG de un rango activo con motivo suficiente', () => {
    expect(validarAnularTag(1129, 'etiqueta rota', rangos, [], 10).ok).toBeTrue();
  });

  it('PETICION_INVALIDA si el número no es válido', () => {
    expect(validarAnularTag(0, 'etiqueta rota', rangos, [], 10)).toEqual({ ok: false, codigo: 'PETICION_INVALIDA', data: { campo: 'numero_tag' } });
  });

  it('MOTIVO_CORTO', () => {
    expect(validarAnularTag(1129, 'rota', rangos, [], 10).ok).toBeFalse();
  });

  it('TAG_NO_EXISTE si no pertenece a ningún rango activo', () => {
    expect(validarAnularTag(1500, 'etiqueta rota', rangos, [], 10)).toEqual({ ok: false, codigo: 'TAG_NO_EXISTE', data: { numero_tag: 1500 } });
  });

  it('TAG_YA_ANULADO', () => {
    expect(validarAnularTag(1129, 'etiqueta rota', rangos, [1129], 10)).toEqual({ ok: false, codigo: 'TAG_YA_ANULADO', data: { numero_tag: 1129 } });
  });
});

describe('validarConfirmarLocal', () => {
  const r = (id: number, d: number, h: number, tipo: number | null = 2) => ({ id, tagDesde: d, tagHasta: h, idTipoUbicacion: tipo });

  it('acepta rangos válidos', () => {
    expect(validarConfirmarLocal('BORRADOR', [r(1, 1100, 1110), r(2, 1111, 1120)], []).ok).toBeTrue();
  });

  it('ZONIFICACION_CONFIRMADA si ya está confirmada', () => {
    expect(validarConfirmarLocal('CONFIRMADA', [r(1, 1100, 1110)], [])).toEqual({ ok: false, codigo: 'ZONIFICACION_CONFIRMADA', data: { estado: 'CONFIRMADA' } });
  });

  it('ZONIFICACION_VACIA sin rangos, o si los TAG anulados dejan la cantidad en cero', () => {
    expect(validarConfirmarLocal('BORRADOR', [], [])).toEqual({ ok: false, codigo: 'ZONIFICACION_VACIA', data: {} });
    expect(validarConfirmarLocal('BORRADOR', [r(1, 1100, 1100)], [1100]).ok).toBeFalse();
  });

  it('ZONA_SIN_TIPO si un rango no tiene tipo de ubicación', () => {
    expect(validarConfirmarLocal('BORRADOR', [r(1, 1100, 1110), r(2, 1120, 1125, null)], [])).toEqual({
      ok: false,
      codigo: 'ZONA_SIN_TIPO',
      data: { codigo_zona: null, id_zonificacion_det: 2 },
    });
  });

  it('RANGO_CRUZADO con el segundo rango del par que se cruza', () => {
    expect(validarConfirmarLocal('BORRADOR', [r(1, 1100, 1110), r(2, 1110, 1120)], [])).toEqual({
      ok: false,
      codigo: 'RANGO_CRUZADO',
      data: { con: { id_zonificacion_det: 2, tag_desde: 1110, tag_hasta: 1120 } },
    });
  });
});

describe('validarReabrir', () => {
  it('solo se reabre una zonificación CONFIRMADA', () => {
    expect(validarReabrir('CONFIRMADA').ok).toBeTrue();
    expect(validarReabrir('BORRADOR')).toEqual({ ok: false, codigo: 'ZONIFICACION_NO_CONFIRMADA', data: { estado: 'BORRADOR' } });
    expect(validarReabrir('SIN_ZONIFICACION').ok).toBeFalse();
  });
});
