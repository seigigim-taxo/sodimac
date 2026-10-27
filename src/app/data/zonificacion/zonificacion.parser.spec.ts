import {
  AGENDAS_V1_DATA,
  ANULAR_TAG_APLICADA_V1_DATA,
  CATALOGO_V1_DATA,
  CONFIRMAR_APLICADA_V1_DATA,
  ELIMINAR_APLICADA_V1_DATA,
  ESTADO_V1_DATA,
  GUARDAR_APLICADA_V1_DATA,
  GUARDAR_YA_APLICADA_V1_DATA,
  REABRIR_APLICADA_V1_DATA,
} from './zonificacion.fixtures';
import {
  RespuestaZonificacionInvalida,
  parsearCatalogo,
  parsearListaAgendas,
  parsearRespuestaEstado,
  parsearResultadoOperacion,
} from './zonificacion.parser';

/* Las respuestas son las reales del contrato v1; ver zonificacion.fixtures.ts. */
const clonar = <T>(valor: unknown): T => JSON.parse(JSON.stringify(valor)) as T;

describe('parsearCatalogo', () => {
  it('lee las 5 zonas y los parámetros', () => {
    const c = parsearCatalogo(CATALOGO_V1_DATA);
    expect(c.version).toBe('2026-10-21');
    expect(c.zonas.map((z) => z.codigoZona)).toEqual(['ALTILLO', 'PUNTO_VENTA', 'BODEGA_TRASTIENDA', 'EXHIBICIONES', 'VENTAS_ADICIONALES']);
    expect(c.zonas[0]).toEqual(jasmine.objectContaining({ tagDesde: 1000, tagHasta: 2999, codigoTipoUbicacion: 'ALTILLO', idTipoUbicacion: 2 }));
    expect(c.parametros).toEqual({ cantidadAdvertencia: null, cantidadMaxima: null, motivoLargoMinimo: 10, referenciaLargoMaximo: 250 });
  });

  it('Ventas adicionales lleva tipo OTRO, no VENTAS_ADICIONALES', () => {
    const va = parsearCatalogo(CATALOGO_V1_DATA).zonas.find((z) => z.codigoZona === 'VENTAS_ADICIONALES');
    expect(va?.codigoTipoUbicacion).toBe('OTRO');
  });

  it('una zona sin tipo se lee con tipo nulo (la regla ZONA_SIN_TIPO la rechaza después)', () => {
    const d = clonar<{ zonas: Record<string, unknown>[] }>(CATALOGO_V1_DATA);
    d.zonas[0]['codigo_tipo_ubicacion'] = null;
    d.zonas[0]['id_tipo_ubicacion'] = null;
    expect(parsearCatalogo(d).zonas[0].codigoTipoUbicacion).toBeNull();
  });

  it('lanza si falta la lista de zonas', () => {
    expect(() => parsearCatalogo({ version: 'x', parametros: {} })).toThrowError(RespuestaZonificacionInvalida);
  });
});

describe('parsearListaAgendas', () => {
  it('lee las agendas con su tienda y el resumen de zonificación', () => {
    const l = parsearListaAgendas(AGENDAS_V1_DATA);
    expect(l.hoy).toBe('2026-10-23');
    expect(l.agendas.length).toBe(2);
    expect(l.agendas[0]).toEqual({
      idAgenda: 3120,
      numeroAgenda: 'AG-20261023-1604-01',
      fechaAgenda: '2026-10-23',
      tienda: { idTienda: 78, codigoTienda: '1604', nombreTienda: 'HC TAXO' },
      codigoEstado: 'EN_CONTEO',
      operable: true,
      soloLectura: false,
      zonificacion: { estado: 'BORRADOR', cantidadZonas: 3, tagsZonificados: 11, tagsCapturados: 4 },
    });
    expect(l.agendas[1].zonificacion.estado).toBe('SIN_ZONIFICACION');
  });

  it('una lista vacía es válida (operador sin asignaciones)', () => {
    expect(parsearListaAgendas({ hoy: '2026-10-23', agendas: [] }).agendas).toEqual([]);
  });

  it('lanza con un estado de zonificación desconocido', () => {
    const d = clonar<{ agendas: { zonificacion: Record<string, unknown> }[] }>(AGENDAS_V1_DATA);
    d.agendas[0].zonificacion['estado'] = 'OTRO';
    expect(() => parsearListaAgendas(d)).toThrowError(RespuestaZonificacionInvalida);
  });
});

describe('parsearRespuestaEstado', () => {
  it('lee la agenda, la cabecera, el resumen y los rangos', () => {
    const e = parsearRespuestaEstado(ESTADO_V1_DATA);
    expect(e.agenda).toEqual({ idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01', fechaAgenda: '2026-09-09', codigoEstado: 'EN_CONTEO', operable: true, soloLectura: false });
    expect(e.zonificacion.estado).toBe('BORRADOR');
    expect(e.zonificacion.idZonificacion).toBe(4647);
    expect(e.resumen.cantidadZonas).toBe(4);
    expect(e.resumen.desbalance).toBeFalse();
    expect(e.rangos.length).toBe(4);
  });

  it('el id del rango es el del servidor y los límites son números', () => {
    const r = parsearRespuestaEstado(ESTADO_V1_DATA).rangos[0];
    expect(r).toEqual(jasmine.objectContaining({ id: 758, tagDesde: 1128, tagHasta: 1131, codigoZona: 'ALTILLO', referenciaUbicacion: 'P48', qtyZonificado: 4 }));
  });

  it('lee los TAG fuera con su total', () => {
    expect(parsearRespuestaEstado(ESTADO_V1_DATA).tagsFuera).toEqual({ total: 0, ejemplos: [] });
  });

  it('una agenda sin zonificar viene con cabecera nula y sin rangos', () => {
    const d = clonar<{ estado: Record<string, unknown> }>(ESTADO_V1_DATA);
    d.estado['zonificacion'] = { id_zonificacion: null, estado: 'SIN_ZONIFICACION', fecha_modificacion: null, login_modificacion: null, fecha_confirmacion: null };
    d.estado['rangos'] = [];
    const e = parsearRespuestaEstado(d);
    expect(e.zonificacion).toEqual({ idZonificacion: null, estado: 'SIN_ZONIFICACION', fechaModificacion: null, loginModificacion: null, fechaConfirmacion: null });
    expect(e.rangos).toEqual([]);
  });

  it('lanza si el resumen no viene', () => {
    const d = clonar<{ estado: Record<string, unknown> }>(ESTADO_V1_DATA);
    delete d.estado['resumen'];
    expect(() => parsearRespuestaEstado(d)).toThrowError(RespuestaZonificacionInvalida);
  });

  it('lanza si una bandera no es S/N', () => {
    const d = clonar<{ estado: { resumen: Record<string, unknown> } }>(ESTADO_V1_DATA);
    d.estado.resumen['fl_desbalance'] = 'quizas';
    expect(() => parsearRespuestaEstado(d)).toThrowError(RespuestaZonificacionInvalida);
  });
});

describe('parsearResultadoOperacion', () => {
  it('guardar rango: APLICADA con el id que asignó el servidor y el estado nuevo', () => {
    const r = parsearResultadoOperacion(GUARDAR_APLICADA_V1_DATA);
    expect(r.resultado).toBe('APLICADA');
    expect(r.operacionUid).toBe('6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a01');
    expect(r.idZonificacionDet).toBe(764);
    expect(r.numeroTag).toBeNull();
    expect(r.estado.resumen.cantidadZonas).toBe(5);
  });

  it('YA_APLICADA devuelve el mismo resultado: un reintento no duplica', () => {
    const r = parsearResultadoOperacion(GUARDAR_YA_APLICADA_V1_DATA);
    expect(r.resultado).toBe('YA_APLICADA');
    expect(r.idZonificacionDet).toBe(764);
  });

  it('eliminar rango trae el id eliminado', () => {
    expect(parsearResultadoOperacion(ELIMINAR_APLICADA_V1_DATA).idZonificacionDet).toBe(763);
  });

  it('anular TAG trae el número y el TAG aparece anulado en el estado', () => {
    const r = parsearResultadoOperacion(ANULAR_TAG_APLICADA_V1_DATA);
    expect(r.numeroTag).toBe(1133);
    expect(r.estado.tagsAnulados).toEqual([
      { numeroTag: 1133, motivo: 'No se encontro el TAG en la tienda', fechaAnulacion: '2026-09-09 10:44:03', loginAnulacion: 'operador1@prueba.local' },
    ]);
  });

  it('confirmar deja la cabecera CONFIRMADA y reabrir la devuelve a BORRADOR', () => {
    expect(parsearResultadoOperacion(CONFIRMAR_APLICADA_V1_DATA).estado.zonificacion.estado).toBe('CONFIRMADA');
    expect(parsearResultadoOperacion(REABRIR_APLICADA_V1_DATA).estado.zonificacion.estado).toBe('BORRADOR');
  });

  it('lanza si el resultado no es APLICADA ni YA_APLICADA', () => {
    const d = clonar<Record<string, unknown>>(GUARDAR_APLICADA_V1_DATA);
    d['resultado'] = 'TAL_VEZ';
    expect(() => parsearResultadoOperacion(d)).toThrowError(RespuestaZonificacionInvalida);
  });

  it('lanza ante algo que no es un objeto', () => {
    expect(() => parsearResultadoOperacion(null)).toThrowError(RespuestaZonificacionInvalida);
    expect(() => parsearResultadoOperacion('texto')).toThrowError(RespuestaZonificacionInvalida);
  });
});
