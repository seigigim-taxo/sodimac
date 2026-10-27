import { EstadoAgenda } from '../models/estado-agenda.model';
import { OperacionEnCola } from '../models/operacion-zonificacion.model';
import { aplicarPendientes, rangosParaReglas } from './vista-con-pendientes.utils';

/*
 * La vista es lo que el operador ve y contra lo que se validan los rangos nuevos:
 * el estado del servidor con lo que hizo sin señal aplicado encima, en orden.
 */
const estadoBase = (extra: Partial<EstadoAgenda> = {}): EstadoAgenda => ({
  agenda: { idAgenda: 3120, numeroAgenda: 'AG-1', fechaAgenda: '2026-10-23', codigoEstado: 'PLANIFICADA', operable: true, soloLectura: false },
  zonificacion: { idZonificacion: 1, estado: 'BORRADOR', fechaModificacion: null, loginModificacion: null, fechaConfirmacion: null },
  resumen: { cantidadZonas: 2, tagsZonificados: 9, tagsUsados: 0, tagsPendientes: 9, porcentajeTagsContados: 0, desbalance: false, zonificacionOk: false },
  rangos: [
    { id: 758, orden: 1, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', codigoTipoUbicacion: 'ALTILLO', tagDesde: 1128, tagHasta: 1131, referenciaUbicacion: 'P48', qtyZonificado: 4, qtyUsado: 0, qtyPendiente: 4, porcentajeCierre: 0, desbalance: false },
    { id: 761, orden: 2, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', codigoTipoUbicacion: 'ALTILLO', tagDesde: 1132, tagHasta: 1134, referenciaUbicacion: null, qtyZonificado: 3, qtyUsado: 0, qtyPendiente: 3, porcentajeCierre: 0, desbalance: false },
  ],
  tagsAnulados: [],
  tagsFuera: { total: 0, ejemplos: [] },
  horaServidor: null,
  ...extra,
});

let secuencia = 0;
const op = (tipo: OperacionEnCola['tipo'], datos: Record<string, unknown>, extra: Partial<OperacionEnCola> = {}): OperacionEnCola => ({
  id: ++secuencia,
  operacionUid: `uid-${secuencia}`,
  idAgenda: 3120,
  numeroAgenda: 'AG-1',
  tipo,
  claveRango: null,
  datos,
  operadorLogin: 'op@taxo.cl',
  operadorRut: '1',
  fechaHoraLocal: '2026-10-23 10:00:00',
  estado: 'PENDIENTE',
  error: null,
  mensajeError: null,
  intentos: 0,
  fechaCreacion: '2026-10-23 10:00:00',
  fechaUltimoIntento: null,
  ...extra,
});

const guardar = (desde: number, hasta: number, extra: Record<string, unknown> = {}, opExtra: Partial<OperacionEnCola> = {}) =>
  op('GUARDAR_RANGO', { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: desde, tag_hasta: hasta, referencia_ubicacion: null, ...extra }, opExtra);

describe('aplicarPendientes', () => {
  it('sin cola, la vista es el estado del servidor', () => {
    const v = aplicarPendientes(estadoBase(), []);

    expect(v.estado).toBe('BORRADOR');
    expect(v.rangos.map((r) => [r.id, r.pendiente])).toEqual([[758, false], [761, false]]);
    expect(v.rangos[0].cantidad).toBe(4);
    expect(v.pendientes).toEqual([]);
  });

  it('sin estado del servidor (agenda nunca descargada) la vista parte vacía y SIN_ZONIFICACION', () => {
    const v = aplicarPendientes(null, []);
    expect(v.estado).toBe('SIN_ZONIFICACION');
    expect(v.rangos).toEqual([]);
  });

  it('un rango nuevo sin enviar aparece con su clave local, marcado pendiente', () => {
    const v = aplicarPendientes(estadoBase(), [guardar(1135, 1140, {}, { claveRango: 'local-1' })]);

    const nuevo = v.rangos.find((r) => r.id === 'local-1');
    expect(nuevo).toEqual(jasmine.objectContaining({ idServidor: null, pendiente: true, tagDesde: 1135, tagHasta: 1140, cantidad: 6 }));
    expect(v.rangos.length).toBe(3);
  });

  it('un rango nuevo sin clave local usa el operacion_uid como id', () => {
    const o = guardar(1135, 1140);
    expect(aplicarPendientes(estadoBase(), [o]).rangos[2].id).toBe(o.operacionUid);
  });

  it('editar un rango del servidor lo reemplaza, conserva su id y queda pendiente', () => {
    const v = aplicarPendientes(estadoBase(), [guardar(1128, 1133, { id_zonificacion_det: 758, referencia_ubicacion: 'P50' })]);

    expect(v.rangos.length).toBe(2);
    expect(v.rangos[0]).toEqual(jasmine.objectContaining({ id: 758, idServidor: 758, tagHasta: 1133, referenciaUbicacion: 'P50', pendiente: true }));
  });

  it('eliminar un rango del servidor lo oculta', () => {
    const v = aplicarPendientes(estadoBase(), [op('ELIMINAR_RANGO', { id_zonificacion_det: 758 })]);
    expect(v.rangos.map((r) => r.id)).toEqual([761]);
  });

  it('las operaciones se aplican en el orden en que se hicieron', () => {
    const v = aplicarPendientes(estadoBase(), [
      guardar(1135, 1140, {}, { claveRango: 'local-1' }),
      op('ELIMINAR_RANGO', { id_zonificacion_det: 761 }),
      guardar(1200, 1210, {}, { claveRango: 'local-2' }),
    ]);
    expect(v.rangos.map((r) => r.id)).toEqual([758, 'local-1', 'local-2']);
  });

  it('un TAG anulado pendiente descuenta de la cantidad de su rango', () => {
    const v = aplicarPendientes(estadoBase(), [op('ANULAR_TAG', { numero_tag: 1129, motivo: 'etiqueta rota' })]);

    expect(v.tagsAnulados).toEqual([{ numeroTag: 1129, motivo: 'etiqueta rota', pendiente: true }]);
    expect(v.rangos[0].cantidad).toBe(3);
  });

  it('anular dos veces el mismo TAG lo cuenta una vez', () => {
    const v = aplicarPendientes(estadoBase(), [
      op('ANULAR_TAG', { numero_tag: 1129, motivo: 'etiqueta rota' }),
      op('ANULAR_TAG', { numero_tag: 1129, motivo: 'etiqueta rota' }),
    ]);
    expect(v.tagsAnulados.length).toBe(1);
    expect(v.rangos[0].cantidad).toBe(3);
  });

  it('un confirmar pendiente deja el estado efectivo CONFIRMADA (no se puede seguir editando)', () => {
    const v = aplicarPendientes(estadoBase(), [op('CONFIRMAR', {})]);
    expect(v.estado).toBe('CONFIRMADA');
    expect(v.confirmacionPendiente).toBeTrue();
  });

  it('un reabrir pendiente sobre una confirmada la deja BORRADOR', () => {
    const base = estadoBase({ zonificacion: { ...estadoBase().zonificacion, estado: 'CONFIRMADA' } });
    const v = aplicarPendientes(base, [op('REABRIR', {})]);
    expect(v.estado).toBe('BORRADOR');
    expect(v.reaperturaPendiente).toBeTrue();
  });

  it('confirmar y después reabrir deja la última palabra al reabrir', () => {
    const v = aplicarPendientes(estadoBase(), [op('CONFIRMAR', {}), op('REABRIR', {})]);
    expect(v.estado).toBe('BORRADOR');
    expect(v.confirmacionPendiente).toBeFalse();
    expect(v.reaperturaPendiente).toBeTrue();
  });

  it('un primer rango en una agenda sin zonificar la deja en BORRADOR', () => {
    const v = aplicarPendientes(null, [guardar(1135, 1140)]);
    expect(v.estado).toBe('BORRADOR');
  });

  it('las operaciones rechazadas no se aplican: solo se listan aparte', () => {
    const rechazada = guardar(1135, 1140, {}, { estado: 'RECHAZADO', claveRango: 'local-9' });
    const v = aplicarPendientes(estadoBase(), [rechazada, op('ELIMINAR_RANGO', { id_zonificacion_det: 761 })]);

    expect(v.rangos.map((r) => r.id)).toEqual([758]);
    expect(v.rechazadas).toEqual([rechazada]);
    expect(v.pendientes.length).toBe(1);
  });

  describe('rangosParaReglas', () => {
    it('incluye los pendientes, para que un rango nuevo se valide contra ellos', () => {
      const v = aplicarPendientes(estadoBase(), [guardar(1135, 1140, {}, { claveRango: 'local-1' })]);
      expect(rangosParaReglas(v)).toEqual([
        { id: 758, tagDesde: 1128, tagHasta: 1131 },
        { id: 761, tagDesde: 1132, tagHasta: 1134 },
        { id: 'local-1', tagDesde: 1135, tagHasta: 1140 },
      ]);
    });
  });
});
