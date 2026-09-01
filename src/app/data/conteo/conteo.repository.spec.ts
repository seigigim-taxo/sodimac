import { TestBed } from '@angular/core/testing';
import { SqliteConteoRepository } from './conteo.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';

/*
 * El repositorio de conteo contra SQLite de verdad.
 *
 * Es la pieza que más importa de la app y la que no tenía una sola prueba: toda
 * la lógica vive en SQL, así que un doble que devolviera filas inventadas no
 * habría probado nada. El motor en memoria replica además la regla de
 * transacciones del plugin — ver testing/sqlite-en-memoria.
 */

const CONTEO_ID = 1;
const UBICACION_ID = 1;
const OPERADOR_ID = 1;
const PDA_ID = 1;
const PRODUCTO_ID = 1;
const OTRO_PRODUCTO_ID = 2;

/*
 * Lo mínimo para que las FK de sod_conteo_detalle se satisfagan.
 *
 * El rol va con OR IGNORE porque el propio esquema trae un SEED que ya crea el
 * id 1; si existe se reutiliza, y sod_user.rol_id sigue apuntando bien.
 */
const SEMILLA = `
  INSERT OR IGNORE INTO sod_rol (id, nombre) VALUES (1, 'Operador');
  INSERT INTO sod_user (id, rol_id, rut, rut_dv, correo) VALUES (1, 1, 12345678, '5', 'op@sodimac.cl');
  INSERT INTO sod_sucursal (id, codigo_tienda, nombre) VALUES (1, 'T01', 'Ñuble');
  INSERT INTO sod_evento_inventario (id, sucursal_id, nombre, fecha_programada) VALUES (1, 1, 'Inventario', '2026-08-26');
  INSERT INTO sod_producto (id, sku, codigo_barras, descripcion) VALUES (1, 'AF001', '7801234567890', 'Taladro');
  INSERT INTO sod_producto (id, sku, codigo_barras, descripcion) VALUES (2, 'AF002', '7809999999999', 'Sierra');
  INSERT INTO sod_pda (id, codigo) VALUES (1, 'PDA-01');
  INSERT INTO sod_zona (id, sucursal_id, nombre, tag_desde, tag_hasta) VALUES (1, 1, 'SALA_VENTAS', 1000, 1999);
  INSERT INTO sod_ubicacion (id, zona_id, codigo, tag) VALUES (1, 1, 'PASILLO A', '1500');
  INSERT INTO sod_ubicacion (id, zona_id, codigo, tag) VALUES (2, 1, 'PASILLO B', '1600');
  INSERT INTO sod_conteo (id, evento_id, iteracion, estado) VALUES (1, 1, 1, 'ABIERTO');
`;

describe('SqliteConteoRepository', () => {
  let repo: SqliteConteoRepository;
  let db: ConexionFalsa;

  /* Lecturas crudas de la línea, en el orden en que se registraron. */
  async function lecturasDe(detalleId: number) {
    const r = await db.query(
      `SELECT codigo_lectura, medio_captura, cantidad FROM sod_conteo_lectura
       WHERE detalle_id = ? ORDER BY id`,
      [detalleId]
    );
    return r.values ?? [];
  }

  async function cantidadFisica(productoId = PRODUCTO_ID): Promise<number | null> {
    const r = await db.query(
      `SELECT cantidad_fisica FROM sod_conteo_detalle WHERE producto_id = ?`,
      [productoId]
    );
    const fila = r.values?.[0];
    return fila ? Number(fila['cantidad_fisica']) : null;
  }

  async function sumaLecturas(detalleId: number): Promise<number> {
    const r = await db.query(
      `SELECT COALESCE(SUM(cantidad), 0) AS total FROM sod_conteo_lectura WHERE detalle_id = ?`,
      [detalleId]
    );
    return Number(r.values?.[0]?.['total'] ?? 0);
  }

  function scan(cantidad: number, codigo = 'AF001', medio: 'ESCANER' | 'MANUAL' = 'ESCANER', producto = PRODUCTO_ID) {
    return repo.upsert(CONTEO_ID, UBICACION_ID, producto, OPERADOR_ID, PDA_ID, cantidad, codigo, medio);
  }

  beforeEach(async () => {
    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL + SEMILLA);

    TestBed.configureTestingModule({ providers: [SqliteConteoRepository, SqliteConnectionService] });

    /*
     * Se usa el SqliteConnectionService REAL y solo se le cambia de dónde saca
     * la conexión: así enTransaccion() —donde vivía el bug— se ejecuta tal cual
     * está en producción, en vez de reimplementarse en el test.
     */
    const conexion = TestBed.inject(SqliteConnectionService);
    spyOn(conexion, 'getConnection').and.resolveTo(db as never);

    repo = TestBed.inject(SqliteConteoRepository);
  });

  // Con guarda: si beforeEach falla, db queda sin asignar y el cierre taparía el error real.
  afterEach(() => db?.cerrar());

  describe('upsert', () => {
    /*
     * El caso que rompió la app en el dispositivo: upsert corre dentro de
     * enTransaccion, y cada db.run() del plugin abre la suya salvo que se le
     * pase false. Sin ese false, el operador no podía registrar un solo SKU.
     */
    it('registra un SKU sin chocar con la transacción abierta', async () => {
      const item = await scan(1);

      expect(item.cantidadFisica).toBe(1);
      expect(db.transaccionAbierta).toBeFalse();
    });

    it('acumula al escanear el mismo SKU dos veces', async () => {
      await scan(1);
      const item = await scan(1);

      expect(item.cantidadFisica).toBe(2);
    });

    it('suma la cantidad declarada, no de a uno', async () => {
      await scan(40);

      expect(await cantidadFisica()).toBe(40);
    });

    it('mantiene separadas las líneas de productos distintos', async () => {
      await scan(3);
      await scan(5, 'AF002', 'ESCANER', OTRO_PRODUCTO_ID);

      expect(await cantidadFisica(PRODUCTO_ID)).toBe(3);
      expect(await cantidadFisica(OTRO_PRODUCTO_ID)).toBe(5);
    });

    /*
     * Cero no es "sumar nada": es declarar que del SKU no hay unidades,
     * típicamente corrigiendo un conteo previo. Por eso REEMPLAZA el total.
     */
    it('cantidad 0 reemplaza el total en vez de sumarse', async () => {
      await scan(5);
      await scan(0);

      expect(await cantidadFisica()).toBe(0);
    });

    it('una línea ya sincronizada no se puede volver a contar', async () => {
      const item = await scan(1);
      await db.run(`UPDATE sod_conteo_detalle SET estado = 'SINCRONIZADO' WHERE id = ?`, [item.id]);

      await expectAsync(scan(1)).toBeRejectedWithError(/ya se sincronizó/);
    });

    it('un rechazo deja la transacción cerrada, no colgada', async () => {
      const item = await scan(1);
      await db.run(`UPDATE sod_conteo_detalle SET estado = 'SINCRONIZADO' WHERE id = ?`, [item.id]);

      await expectAsync(scan(1)).toBeRejected();

      expect(db.transaccionAbierta).toBeFalse();
    });
  });

  describe('lecturas', () => {
    it('guarda el código y el medio de cada captura', async () => {
      await scan(2, 'AF001', 'MANUAL');
      const item = await scan(3, '7801234567890', 'ESCANER');

      expect(await lecturasDe(item.id)).toEqual([
        { codigo_lectura: 'AF001', medio_captura: 'MANUAL', cantidad: 2 },
        { codigo_lectura: '7801234567890', medio_captura: 'ESCANER', cantidad: 3 },
      ]);
    });

    it('no deduplica: diez escaneos del mismo código dejan diez lecturas', async () => {
      for (let i = 0; i < 10; i++) await scan(1);
      const item = await scan(1);

      expect((await lecturasDe(item.id)).length).toBe(11);
    });

    /*
     * Los botones +/- declaran unidades sin leer nada. Atribuirles el código de
     * la línea diría que ese código se tipeó a mano — y si venía de la pistola,
     * el reporte concluiría que el EAN no se escaneó.
     */
    it('un ajuste con +/- no inventa un código', async () => {
      const item = await scan(5);
      await repo.adjust(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 2, 'EN_CURSO');

      const lecturas = await lecturasDe(item.id);
      expect(lecturas[lecturas.length - 1]).toEqual({
        codigo_lectura: null, medio_captura: 'MANUAL', cantidad: 2,
      });
    });

    it('quitar unidades agrega un movimiento negativo, no borra la lectura anterior', async () => {
      const item = await scan(5);
      await repo.adjust(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, -2, 'EN_CURSO');

      const lecturas = await lecturasDe(item.id);
      // El escaneo original sigue constando: es lo que el reporte necesita.
      expect(lecturas[0]).toEqual({ codigo_lectura: 'AF001', medio_captura: 'ESCANER', cantidad: 5 });
      expect(lecturas[1]).toEqual({ codigo_lectura: null, medio_captura: 'MANUAL', cantidad: -2 });
    });
  });

  /*
   * El invariante que sostiene el dato que viaja al SGO. Si se rompe, el
   * servidor recibe un desglose por vía de captura que no suma el total de la
   * línea, y nadie se entera hasta que alguien cuadra un informe.
   */
  describe('invariante: la suma de las lecturas da cantidad_fisica', () => {
    it('tras varios escaneos', async () => {
      await scan(3);
      await scan(7);
      const item = await scan(2);

      expect(await sumaLecturas(item.id)).toBe(await cantidadFisica() as number);
    });

    it('tras sumar y restar con los botones', async () => {
      const item = await scan(5);
      await repo.adjust(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 3, 'EN_CURSO');
      await repo.adjust(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, -4, 'EN_CURSO');

      expect(await cantidadFisica()).toBe(4);
      expect(await sumaLecturas(item.id)).toBe(4);
    });

    it('tras declarar cantidad 0', async () => {
      await scan(5);
      const item = await scan(0);

      expect(await cantidadFisica()).toBe(0);
      expect(await sumaLecturas(item.id)).toBe(0);
    });

    /*
     * MAX(0, ...) impide dejar la línea en negativo, así que pedir -10 sobre un
     * total de 3 mueve -3. Registrar el delta PEDIDO en vez del APLICADO
     * rompería el invariante justo acá.
     */
    it('cuando el ajuste se topa con el cero', async () => {
      const item = await scan(3);
      await repo.adjust(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, -10, 'EN_CURSO');

      expect(await cantidadFisica()).toBe(0);
      expect(await sumaLecturas(item.id)).toBe(0);
    });
  });

  describe('adjust', () => {
    it('no escribe nada cuando el movimiento real es cero', async () => {
      const item = await scan(0);
      const antes = (await lecturasDe(item.id)).length;

      await repo.adjust(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, -1, 'EN_CURSO');

      expect((await lecturasDe(item.id)).length).toBe(antes);
    });

    it('falla si la línea no existe en ese estado', async () => {
      await expectAsync(
        repo.adjust(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 1, 'EN_CURSO')
      ).toBeRejectedWithError(/No se encontró el detalle/);
    });
  });

  describe('delete', () => {
    it('borra la línea y sus lecturas, sin dejar huérfanas', async () => {
      const item = await scan(5);

      await repo.delete(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 'EN_CURSO');

      expect(await cantidadFisica()).toBeNull();
      expect((await lecturasDe(item.id)).length).toBe(0);
    });

    it('no toca las lecturas de otra línea', async () => {
      await scan(5);
      const otro = await scan(2, 'AF002', 'ESCANER', OTRO_PRODUCTO_ID);

      await repo.delete(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 'EN_CURSO');

      expect((await lecturasDe(otro.id)).length).toBe(1);
    });
  });

  /*
   * ¿Se puede terminar más de un TAG y que al servidor llegue uno solo?
   *
   * Cada apertura de TAG crea su propia fila en sod_ubicacion, y de ahí cuelga
   * todo: el carga_uid, la fila en sod_sincronizacion y el marcado. Si alguna de
   * esas tres cosas se escapara del ubicacion_id, dos TAGs terminados quedarían
   * pisándose y el operador vería ambos como enviados con uno solo en el SGO —
   * trabajo perdido en silencio y sin error a la vista.
   */
  describe('dos TAGs terminados no se pisan entre sí', () => {
    const OTRA_UBICACION = 2;

    async function contarYCerrar(ubicacionId: number, cantidad: number) {
      await repo.upsert(CONTEO_ID, ubicacionId, PRODUCTO_ID, OPERADOR_ID, PDA_ID, cantidad, 'AF001', 'ESCANER');
      await repo.cerrarTag(CONTEO_ID, ubicacionId, OPERADOR_ID);
    }

    it('cada uno recibe su propio carga_uid', async () => {
      await contarYCerrar(UBICACION_ID, 3);
      await contarYCerrar(OTRA_UBICACION, 7);

      const uidA = await repo.asegurarCargaUid(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID);
      const uidB = await repo.asegurarCargaUid(CONTEO_ID, OTRA_UBICACION, OPERADOR_ID, PDA_ID);

      expect(uidA).not.toBe(uidB);
    });

    // Reintentar el envío del mismo TAG no puede generar un uid nuevo: en el SGO
    // entraría como una carga distinta y el conteo se contaría dos veces.
    it('el carga_uid de un TAG es estable entre llamadas', async () => {
      await contarYCerrar(UBICACION_ID, 3);

      const primera = await repo.asegurarCargaUid(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID);
      const segunda = await repo.asegurarCargaUid(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID);

      expect(segunda).toBe(primera);
    });

    /*
     * El caso que de verdad haría perder un TAG: si marcar uno como sincronizado
     * alcanzara al otro, el segundo nunca se enviaría y se vería como hecho.
     */
    it('marcar uno como sincronizado no toca al otro', async () => {
      await contarYCerrar(UBICACION_ID, 3);
      await contarYCerrar(OTRA_UBICACION, 7);

      await repo.marcarSincronizado(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID);

      const resumenes = await repo.getResumenes(OPERADOR_ID, PDA_ID);
      const a = resumenes.find((r) => r.ubicacionId === UBICACION_ID);
      const b = resumenes.find((r) => r.ubicacionId === OTRA_UBICACION);

      expect(a?.estado).toBe('SINCRONIZADO');
      expect(b?.estado).toBe('FINALIZADO');
    });

    it('los dos aparecen como sesiones separadas, con sus totales', async () => {
      await contarYCerrar(UBICACION_ID, 3);
      await contarYCerrar(OTRA_UBICACION, 7);

      const resumenes = await repo.getResumenes(OPERADOR_ID, PDA_ID);

      expect(resumenes.length).toBe(2);
      expect(resumenes.find((r) => r.ubicacionId === UBICACION_ID)?.totalUnidades).toBe(3);
      expect(resumenes.find((r) => r.ubicacionId === OTRA_UBICACION)?.totalUnidades).toBe(7);
    });
  });

  describe('getBySesion', () => {
    it('devuelve las líneas de la sesión con su SKU y descripción', async () => {
      await scan(4);

      const items = await repo.getBySesion(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID, 'EN_CURSO');

      expect(items.length).toBe(1);
      expect(items[0].sku).toBe('AF001');
      expect(items[0].descripcion).toBe('Taladro');
      expect(items[0].cantidadFisica).toBe(4);
    });

    it('no devuelve las de otro estado', async () => {
      await scan(4);
      await repo.cerrarTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID);

      expect((await repo.getBySesion(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID, 'EN_CURSO')).length).toBe(0);
      expect((await repo.getBySesion(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID, 'FINALIZADO')).length).toBe(1);
    });
  });

  /*
   * El detalle_uid es la clave con la que el SGO deduplica: si llega dos veces
   * el mismo, responde DUPLICADO_IGNORADO en vez de insertar el producto otra
   * vez. Eso vuelve seguro reintentar un envío incierto —lo probamos contra el
   * servidor real— pero SOLO mientras el identificador no cambie entre un
   * intento y el siguiente. Estas pruebas cuidan esa propiedad.
   */
  describe('detalle_uid del payload', () => {
    async function payloadDelTag() {
      const resumen = (await repo.getResumenes(OPERADOR_ID, PDA_ID))
        .find((r) => r.ubicacionId === UBICACION_ID)!;
      return repo.getPayloadSincronizacion(resumen);
    }

    /*
     * La version con la que se conto viaja en la carga, y es lo unico que
     * permite atribuir despues un dato raro en el SGO a un APK concreto. Sin
     * esta asercion, borrar las dos lineas del payload deja los tests en verde
     * y la regresion solo aparece mirando una carga en el servidor.
     *
     * En el navegador no hay App.getInfo(), asi que AppInfoService degrada a la
     * constante: lo que se verifica aca es el cableado --que el campo llegue al
     * payload-- y no el valor, que ya cubre app-info.service.spec.ts.
     */
    it('lleva la version de la app con que se conto', async () => {
      await repo.upsert(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 3, 'AF001', 'ESCANER');
      await repo.cerrarTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID);

      const payload = await payloadDelTag();

      expect(payload.version_app).toBeTruthy();
      expect(typeof payload.version_code).toBe('number');
    });

    it('cada producto trae el suyo', async () => {
      await repo.upsert(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 3, 'AF001', 'ESCANER');
      await repo.upsert(CONTEO_ID, UBICACION_ID, OTRO_PRODUCTO_ID, OPERADOR_ID, PDA_ID, 5, 'AF002', 'ESCANER');
      await repo.cerrarTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID);

      const { detalles } = await payloadDelTag();
      const uids = detalles.map((d) => d.detalle_uid);

      expect(uids.length).toBe(2);
      expect(new Set(uids).size).toBe(2);
    });

    it('lleva el carga_uid del TAG y un sello de 17 dígitos', async () => {
      await repo.upsert(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 3, 'AF001', 'ESCANER');
      await repo.cerrarTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID);

      const payload = await payloadDelTag();
      const uid = payload.detalles[0].detalle_uid;

      expect(uid.startsWith(`${payload.carga_uid}-DET`)).toBeTrue();
      expect(uid).toMatch(/-DET\d+-\d{17}$/);
    });

    /*
     * La propiedad que importa. Si el UID cambiara entre reintentos, el SGO no
     * reconocería el duplicado y cargaría el producto dos veces — justo el error
     * que la deduplicación existe para evitar.
     */
    it('es el mismo si se vuelve a armar el payload', async () => {
      await repo.upsert(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 3, 'AF001', 'ESCANER');
      await repo.cerrarTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID);

      const primero = (await payloadDelTag()).detalles[0].detalle_uid;
      const segundo = (await payloadDelTag()).detalles[0].detalle_uid;

      expect(segundo).toBe(primero);
    });

    /*
     * El sello sale de la PRIMERA lectura, no de la última: seguir contando el
     * mismo SKU tiene que dejar el identificador quieto. Con la última, cada
     * escaneo extra lo movería.
     */
    it('no se mueve al agregar más unidades del mismo SKU', async () => {
      await repo.upsert(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 1, 'AF001', 'ESCANER');
      await repo.cerrarTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID);
      const antes = (await payloadDelTag()).detalles[0].detalle_uid;

      await repo.reabrirTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID, PDA_ID);
      await repo.upsert(CONTEO_ID, UBICACION_ID, PRODUCTO_ID, OPERADOR_ID, PDA_ID, 2, 'AF001', 'ESCANER');
      await repo.cerrarTag(CONTEO_ID, UBICACION_ID, OPERADOR_ID);

      const despues = await payloadDelTag();
      expect(despues.detalles[0].cantidad_fisica).toBe(3);
      expect(despues.detalles[0].detalle_uid).toBe(antes);
    });
  });
});
