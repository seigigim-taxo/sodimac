import { TestBed } from '@angular/core/testing';
import { SqliteMuestraDetalleRepository } from './muestra-detalle.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { LineaMuestraParaGuardar } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';

const BD = 'sodimac';
const MUESTRA_ID = 1;
const LINEAS = 2500;

/* Una muestra de tamaño real: varios lotes de productos, de códigos y de detalle. */
function muestra(n: number): LineaMuestraParaGuardar[] {
  return Array.from({ length: n }, (_, i) => {
    const sku = String(600000 + i);
    return {
      idMuestraDet: 1000 + i,
      sku: i % 7 === 0 ? `${sku}.0` : sku,
      codigoBarras: `20${sku}1`,
      descripcion: `PRODUCTO ${i}`,
      stockSistema: i % 5,
      codigos: [
        { codigoLectura: `20${sku}1`, tipoCodigo: 'BARRA_MUESTRA', codigoBarras: `20${sku}1` },
        { codigoLectura: `78${sku}2`, tipoCodigo: 'BARRA_MUESTRA', codigoBarras: `78${sku}2` },
        { codigoLectura: i % 7 === 0 ? `${sku}.0` : sku, tipoCodigo: 'SKU', codigoBarras: null },
      ],
    };
  });
}

/*
 * El caso que dejó sin entrar a operadores de tres tiendas: la descarga inicial
 * guarda la muestra dentro de una transacción y, en medio, otra parte de la app
 * escribe con el modo por defecto del plugin. Eso revertía lo guardado hasta ahí
 * y la descarga fallaba con `FOREIGN KEY constraint failed`, `no current
 * transaction` o `No se pudo resolver producto para SKU …`.
 *
 * Se prueba en cinco momentos distintos del guardado, porque cada uno rompía de
 * una manera diferente.
 */
describe('SqliteMuestraDetalleRepository.reemplazarDetalles — escritura ajena en medio', () => {
  let servicio: SqliteConnectionService;
  let repo: SqliteMuestraDetalleRepository;
  let cruda: ConexionFalsa & { open(): Promise<void>; delete(): Promise<void> };

  const MOMENTOS: { nombre: string; patron: RegExp }[] = [
    { nombre: 'al insertar productos',        patron: /INSERT INTO sod_producto \(sku/ },
    { nombre: 'al borrar códigos anteriores', patron: /DELETE FROM sod_producto_detalle/ },
    { nombre: 'al insertar códigos',          patron: /INSERT INTO sod_producto_detalle/ },
    { nombre: 'al borrar el detalle',         patron: /DELETE FROM sod_muestra_detalle/ },
    { nombre: 'al insertar el detalle',       patron: /INSERT INTO sod_muestra_detalle/ },
  ];

  beforeEach(async () => {
    cruda = Object.assign(
      await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL + `
        INSERT INTO sod_sucursal (id, codigo_tienda, nombre) VALUES (1, '4724', 'HC BIOBIO');
        INSERT INTO sod_evento_inventario (id, sucursal_id, nombre, fecha_programada) VALUES (1, 1, 'Inventario', '2026-10-20');
        INSERT INTO sod_muestra (id, evento_id, sucursal_id, iteracion, codigo_muestra) VALUES (${MUESTRA_ID}, 1, 1, 1, 'MUE-1');
      `),
      { open: async () => undefined, delete: async () => undefined }
    );

    servicio = TestBed.inject(SqliteConnectionService);
    spyOnProperty(servicio, 'isSupported', 'get').and.returnValue(true);
    (servicio as unknown as { sqlite: unknown }).sqlite = {
      checkConnectionsConsistency: async () => ({ result: false }),
      isConnection: async () => ({ result: false }),
      retrieveConnection: async () => cruda,
      createConnection: async () => cruda,
      closeConnection: async () => undefined,
    };
    repo = TestBed.inject(SqliteMuestraDetalleRepository);
  });

  afterEach(() => cruda.cerrar());

  const cuenta = async (tabla: string) =>
    (await cruda.query(`SELECT COUNT(*) AS n FROM ${tabla}`)).values?.[0]?.['n'] as number;

  /*
   * Dispara una escritura ajena la primera vez que el guardado ejecuta una
   * sentencia que calza con `patron`. Es el equivalente de la cola de reportes
   * o de marcar un envío: un `run` sin tercer argumento por la conexión normal.
   */
  function conEscrituraAjenaEn(patron: RegExp, escribirPor: () => Promise<{ run: ConexionFalsa['run'] }>) {
    let disparada = false;
    let ajena: Promise<unknown> = Promise.resolve();
    const original = cruda.run.bind(cruda);
    const originalSet = cruda.executeSet.bind(cruda);

    const disparar = (sql: string) => {
      if (disparada || !patron.test(sql)) return;
      disparada = true;
      ajena = escribirPor()
        .then((c) => c.run(`INSERT INTO sod_meta (clave, valor) VALUES ('ajena', '1') ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`))
        .catch((e) => e);
    };

    cruda.run = (sql, valores, tx) => { disparar(sql); return original(sql, valores, tx); };
    cruda.executeSet = (set, tx) => { disparar(set[0]?.statement ?? ''); return originalSet(set, tx); };

    return { esperar: () => ajena, fueDisparada: () => disparada };
  }

  for (const { nombre, patron } of MOMENTOS) {
    it(`con la conexión del servicio, una escritura ajena ${nombre} no rompe el guardado`, async () => {
      const ajena = conEscrituraAjenaEn(patron, () => servicio.getConnection(BD) as never);

      await repo.reemplazarDetalles(MUESTRA_ID, muestra(LINEAS));
      const resultado = await ajena.esperar();

      expect(ajena.fueDisparada()).toBeTrue();
      expect(resultado).not.toBeInstanceOf(Error);
      expect(await cuenta('sod_muestra_detalle')).toBe(LINEAS);
      expect(await cuenta('sod_producto')).toBe(LINEAS);
      expect(await cuenta('sod_producto_detalle')).toBe(LINEAS * 3);
      expect(((await cruda.query(`SELECT valor FROM sod_meta WHERE clave = 'ajena'`)).values ?? []).length).toBe(1);
      expect(cruda.transaccionAbierta).toBeFalse();
    });
  }

  /*
   * El control: si el test no pudiera fallar, no probaría nada. Con la conexión
   * CRUDA —sin cola— la misma escritura ajena rompe el guardado, al menos en
   * alguno de los cinco momentos.
   */
  it('CONTROL: sin serializar, la misma escritura ajena rompe el guardado en algún momento', async () => {
    const fallos: string[] = [];

    for (const { nombre, patron } of MOMENTOS) {
      await cruda.execute(`DELETE FROM sod_muestra_detalle; DELETE FROM sod_producto_detalle; DELETE FROM sod_producto; DELETE FROM sod_meta;`);
      const ajena = conEscrituraAjenaEn(patron, async () => cruda);
      try {
        await repo.reemplazarDetalles(MUESTRA_ID, muestra(LINEAS));
      } catch {
        fallos.push(nombre);
      }
      await ajena.esperar();
      if (cruda.transaccionAbierta) await cruda.rollbackTransaction();
    }

    expect(fallos.length).toBeGreaterThan(0);
  });
});
