import { EstadoAgenda } from '../models/estado-agenda.model';
import { VistaZonificacion } from '../models/vista-zonificacion.model';
import { filasDeRangos, textoRango, totalesDeResumen } from './filas-resumen.utils';

const estado = (): EstadoAgenda =>
  ({
    rangos: [
      { id: 758, orden: 1, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', codigoTipoUbicacion: 'ALTILLO', tagDesde: 1128, tagHasta: 1131, referenciaUbicacion: 'P48', qtyZonificado: 4, qtyUsado: 3, qtyPendiente: 1, porcentajeCierre: 75, desbalance: false },
      { id: 761, orden: 2, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', codigoTipoUbicacion: 'ALTILLO', tagDesde: 1132, tagHasta: 1134, referenciaUbicacion: null, qtyZonificado: 3, qtyUsado: 5, qtyPendiente: 0, porcentajeCierre: 100, desbalance: true },
    ],
  }) as EstadoAgenda;

const vista = (extra: Partial<VistaZonificacion> = {}): VistaZonificacion => ({
  estado: 'BORRADOR',
  confirmacionPendiente: false,
  reaperturaPendiente: false,
  rangos: [
    { id: 758, idServidor: 758, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', tagDesde: 1128, tagHasta: 1131, referenciaUbicacion: 'P48', cantidad: 4, pendiente: false, operacionUid: null },
    { id: 761, idServidor: 761, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', tagDesde: 1132, tagHasta: 1134, referenciaUbicacion: null, cantidad: 3, pendiente: false, operacionUid: null },
  ],
  tagsAnulados: [],
  pendientes: [],
  rechazadas: [],
  ...extra,
});

describe('textoRango', () => {
  it('un rango de varios TAG se muestra con raya y uno de un solo TAG, solo el número', () => {
    expect(textoRango(1135, 1140)).toBe('1135–1140');
    expect(textoRango(3117, 3117)).toBe('3117');
  });
});

describe('filasDeRangos', () => {
  it('una fila por rango, con su avance de conteo tomado del servidor', () => {
    const filas = filasDeRangos(vista(), estado());

    expect(filas[0]).toEqual({ id: 758, zona: 'ALTILLO', rango: '1128–1131', referencia: 'P48', cantidad: 4, usados: 3, pendiente: false, desbalance: false });
    expect(filas[1].usados).toBe(5);
    expect(filas[1].desbalance).toBeTrue();
  });

  it('un rango nuevo sin enviar no tiene avance todavía y se marca pendiente', () => {
    const v = vista({
      rangos: [
        ...vista().rangos,
        { id: 'uid-9', idServidor: null, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', tagDesde: 1135, tagHasta: 1140, referenciaUbicacion: null, cantidad: 6, pendiente: true, operacionUid: 'uid-9' },
      ],
    });

    const nueva = filasDeRangos(v, estado())[2];

    expect(nueva).toEqual(jasmine.objectContaining({ id: 'uid-9', pendiente: true, usados: null, cantidad: 6, referencia: null }));
  });

  it('un rango del servidor editado y aún no enviado muestra lo nuevo pero conserva el avance del servidor', () => {
    const v = vista({
      rangos: [{ id: 758, idServidor: 758, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', tagDesde: 1128, tagHasta: 1133, referenciaUbicacion: 'P50', cantidad: 6, pendiente: true, operacionUid: 'u' }, vista().rangos[1]],
    });

    const fila = filasDeRangos(v, estado())[0];

    expect(fila).toEqual(jasmine.objectContaining({ rango: '1128–1133', referencia: 'P50', cantidad: 6, usados: 3, pendiente: true }));
  });

  it('sin estado del servidor no hay avance de ningún rango', () => {
    expect(filasDeRangos(vista(), null).every((f) => f.usados === null)).toBeTrue();
  });

  it('una referencia en blanco no se muestra', () => {
    const v = vista({ rangos: [{ ...vista().rangos[0], referenciaUbicacion: '   ' }] });
    expect(filasDeRangos(v, null)[0].referencia).toBeNull();
  });
});

describe('totalesDeResumen', () => {
  it('suma las cantidades de los rangos y cuenta los TAG anulados', () => {
    const v = vista({ tagsAnulados: [{ numeroTag: 1129, motivo: 'rota', pendiente: false }] });
    expect(totalesDeResumen(v)).toEqual({ tagsZonificados: 7, tagsAnulados: 1 });
  });

  it('sin rangos, cero', () => {
    expect(totalesDeResumen(vista({ rangos: [] }))).toEqual({ tagsZonificados: 0, tagsAnulados: 0 });
  });
});
