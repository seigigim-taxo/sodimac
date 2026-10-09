import { mismoContenido, resumirPayload } from './payload-envio';

describe('resumirPayload', () => {
  const payload = (extra: Record<string, unknown> = {}) => JSON.stringify({
    carga_uid: 'UID-1', codigo_tienda: '4093', tag_codigo: '7001', iteracion: 1, numero_agenda: 'AG-1',
    detalles: [
      { sku: 'A', lecturas: [{ lectura_uid: 'L1', cantidad: 1 }, { lectura_uid: 'L2', cantidad: 2 }] },
      { sku: 'B', lecturas: [{ lectura_uid: 'L3', cantidad: 3 }] },
    ],
    ...extra,
  });

  it('lee la identidad del envío', () => {
    expect(resumirPayload(payload())).toEqual(jasmine.objectContaining({
      codigoTienda: '4093', tagCodigo: '7001', iteracion: 1, numeroAgenda: 'AG-1',
    }));
  });

  it('cuenta los productos y las lecturas (no las unidades)', () => {
    const r = resumirPayload(payload())!;

    expect(r.totalProductos).toBe(2);
    expect(r.totalLecturas).toBe(3);
  });

  it('un TAG sin detalles tiene cero de ambos', () => {
    const r = resumirPayload(payload({ detalles: [] }))!;

    expect(r.totalProductos).toBe(0);
    expect(r.totalLecturas).toBe(0);
  });

  // Un payload guardado por una versión anterior a las lecturas individuales.
  it('un detalle sin lecturas suma cero lecturas pero sí cuenta como producto', () => {
    const r = resumirPayload(payload({ detalles: [{ sku: 'A' }, { sku: 'B', lecturas: [{ lectura_uid: 'L1' }] }] }))!;

    expect(r.totalProductos).toBe(2);
    expect(r.totalLecturas).toBe(1);
  });

  it('un dato ausente queda en null', () => {
    const r = resumirPayload(JSON.stringify({ detalles: [] }))!;

    expect(r.codigoTienda).toBeNull();
    expect(r.tagCodigo).toBeNull();
    expect(r.iteracion).toBeNull();
    expect(r.numeroAgenda).toBeNull();
  });

  it('un TAG numérico se lee como texto y una iteración en texto como número', () => {
    const r = resumirPayload(payload({ tag_codigo: 7001, iteracion: '2' }))!;

    expect(r.tagCodigo).toBe('7001');
    expect(r.iteracion).toBe(2);
  });

  it('recorta espacios', () => {
    expect(resumirPayload(payload({ tag_codigo: ' 7001 ' }))!.tagCodigo).toBe('7001');
  });

  describe('lo que no se puede leer', () => {
    it('sin payload', () => {
      expect(resumirPayload(null)).toBeNull();
      expect(resumirPayload('')).toBeNull();
    });

    it('JSON roto', () => {
      expect(resumirPayload('{no es json')).toBeNull();
    });

    it('algo que no es un objeto', () => {
      expect(resumirPayload('42')).toBeNull();
      expect(resumirPayload('null')).toBeNull();
      expect(resumirPayload('"texto"')).toBeNull();
    });

    it('detalles que no es una lista no rompe', () => {
      const r = resumirPayload(JSON.stringify({ detalles: 'x', tag_codigo: '1' }))!;

      expect(r.totalProductos).toBe(0);
      expect(r.totalLecturas).toBe(0);
    });

    it('un detalle que no es objeto se ignora para las lecturas', () => {
      const r = resumirPayload(JSON.stringify({ detalles: [null, 5, { lecturas: [{}] }] }))!;

      expect(r.totalLecturas).toBe(1);
    });
  });
});

/*
 * La red de seguridad: si un TAG cambia después de un envío que el servidor tiene
 * o pudo haber recibido, lo nuevo no viajaría. Compara solo las lecturas.
 */
describe('mismoContenido', () => {
  const con = (lecturas: { uid: string; cantidad: number }[], extra: Record<string, unknown> = {}) => JSON.stringify({
    carga_uid: 'U', version_app: '1.0.14',
    detalles: [{ sku: 'A', lecturas: lecturas.map((l) => ({ lectura_uid: l.uid, cantidad: l.cantidad })) }],
    ...extra,
  });

  const BASE = [{ uid: 'L1', cantidad: 1 }, { uid: 'L2', cantidad: 2 }];

  it('las mismas lecturas con las mismas cantidades', () => {
    expect(mismoContenido(con(BASE), con(BASE))).toBeTrue();
  });

  it('en cualquier orden', () => {
    expect(mismoContenido(con(BASE), con([...BASE].reverse()))).toBeTrue();
  });

  it('no mira nada más que las lecturas (la versión de la app puede cambiar)', () => {
    expect(mismoContenido(con(BASE, { version_app: '1.0.14' }), con(BASE, { version_app: '1.0.15', version_code: 20 }))).toBeTrue();
  });

  it('repartidas en otros productos da lo mismo si son las mismas lecturas', () => {
    const repartido = JSON.stringify({ detalles: [{ lecturas: [{ lectura_uid: 'L1', cantidad: 1 }] }, { lecturas: [{ lectura_uid: 'L2', cantidad: 2 }] }] });

    expect(mismoContenido(con(BASE), repartido)).toBeTrue();
  });

  describe('cuando cambió', () => {
    it('se agregó una lectura', () => {
      expect(mismoContenido(con(BASE), con([...BASE, { uid: 'L3', cantidad: 5 }]))).toBeFalse();
    });

    it('se quitó una lectura', () => {
      expect(mismoContenido(con(BASE), con([BASE[0]]))).toBeFalse();
    });

    it('cambió la cantidad de una lectura', () => {
      expect(mismoContenido(con(BASE), con([BASE[0], { uid: 'L2', cantidad: 3 }]))).toBeFalse();
    });

    it('cambió el identificador de una lectura', () => {
      expect(mismoContenido(con(BASE), con([BASE[0], { uid: 'L9', cantidad: 2 }]))).toBeFalse();
    });

    it('uno quedó vacío', () => {
      expect(mismoContenido(con(BASE), con([]))).toBeFalse();
    });
  });

  describe('cuando no se puede saber', () => {
    it('un payload ausente', () => {
      expect(mismoContenido(null, con(BASE))).toBeNull();
      expect(mismoContenido(con(BASE), null)).toBeNull();
      expect(mismoContenido('', con(BASE))).toBeNull();
    });

    it('un payload ilegible', () => {
      expect(mismoContenido('{roto', con(BASE))).toBeNull();
      expect(mismoContenido(con(BASE), '42')).toBeNull();
    });

    it('dos vacíos son iguales entre sí', () => {
      expect(mismoContenido(con([]), con([]))).toBeTrue();
    });
  });
});
