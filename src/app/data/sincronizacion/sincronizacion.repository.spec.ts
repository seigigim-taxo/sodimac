import { TestBed } from '@angular/core/testing';
import { SqliteSincronizacionRepository } from './sincronizacion.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';
import { hoySql, manianaSql } from '../../shared/utils/fecha.utils';

/*
 * La regla que se prueba acá es de negocio, no técnica: un conteo vale para la
 * jornada a la que pertenece, y si no alcanzó a subir mientras esa jornada
 * estaba vigente —hoy o mañana— se da por perdido.
 *
 * Es fácil de deshacer sin querer —basta con "arreglar" la consulta para que
 * devuelva todos los pendientes— y el efecto sería mandarle al SGO conteos con
 * la fecha corrida, que es peor que no mandarlos.
 */
const AYER = '2026-08-25';

const SEMILLA = `
  INSERT OR IGNORE INTO sod_rol (id, nombre) VALUES (1, 'Operador');
  INSERT INTO sod_user (id, rol_id, rut, rut_dv, correo) VALUES (1, 1, 18306696, 'K', 'op@taxo.cl');
  INSERT INTO sod_sucursal (id, codigo_tienda, nombre) VALUES (1, 'T01', 'Maipú');
  INSERT INTO sod_pda (id, codigo) VALUES (1, 'PDA-01');
`;

describe('SqliteSincronizacionRepository', () => {
  let repo: SqliteSincronizacionRepository;
  let db: ConexionFalsa;

  /* Deja un TAG pendiente de envío para un evento con la fecha indicada. */
  async function pendienteDeEvento(eventoId: number, fechaProgramada: string, cargaUid: string) {
    await db.run(
      `INSERT OR IGNORE INTO sod_evento_inventario (id, sucursal_id, nombre, fecha_programada)
       VALUES (?, 1, 'Inventario', ?)`,
      [eventoId, fechaProgramada]
    );
    await repo.guardarSyncTag({
      eventoId, pdaId: 1, iteracion: 1, perfil: 'OPERADOR',
      conteoId: null, ubicacionId: null, operadorId: 1,
      cargaUid,
      // El payload no importa para esta regla; solo tiene que existir.
      payload: { carga_uid: cargaUid, detalles: [] } as never,
    });
  }

  beforeEach(async () => {
    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL + SEMILLA);

    TestBed.configureTestingModule({
      providers: [SqliteSincronizacionRepository, SqliteConnectionService],
    });
    const conexion = TestBed.inject(SqliteConnectionService);
    spyOn(conexion, 'getConnection').and.resolveTo(db as never);
    repo = TestBed.inject(SqliteSincronizacionRepository);
  });

  afterEach(() => db?.cerrar());

  describe('listarPendientes', () => {
    it('ofrece los pendientes del día en curso', async () => {
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');

      const pendientes = await repo.listarPendientes();

      expect(pendientes.map((p) => p.cargaUid)).toEqual(['UID-HOY']);
    });

    /*
     * El operador puede adelantar la jornada de mañana. Antes del corte por
     * ventana operativa, un TAG cerrado contra esa jornada nunca calificaba
     * como pendiente: se cerraba bien, quedaba PENDIENTE y no se ofrecía para
     * envío jamás. Se perdía en silencio.
     */
    it('también ofrece los de la jornada de mañana', async () => {
      await pendienteDeEvento(2, manianaSql(), 'UID-MANIANA');

      const pendientes = await repo.listarPendientes();

      expect(pendientes.map((p) => p.cargaUid)).toEqual(['UID-MANIANA']);
    });

    it('con hoy y mañana mezclados, ofrece los dos', async () => {
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');
      await pendienteDeEvento(2, manianaSql(), 'UID-MANIANA');

      const pendientes = await repo.listarPendientes();

      expect(pendientes.map((p) => p.cargaUid).sort()).toEqual(['UID-HOY', 'UID-MANIANA']);
    });

    /*
     * El corazón de la regla. Estos TAGs siguen en la tabla —se pueden auditar—
     * pero no se vuelven a ofrecer para envío.
     */
    it('NO ofrece los de un día anterior', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');

      expect(await repo.listarPendientes()).toEqual([]);
    });

    it('con los dos mezclados, devuelve solo el de hoy', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');

      const pendientes = await repo.listarPendientes();

      expect(pendientes.map((p) => p.cargaUid)).toEqual(['UID-HOY']);
    });

    // Que no se ofrezcan no significa que se borren: quedan como registro de lo
    // que no llegó, que es lo que permitió diagnosticar el caso del 26/08.
    it('los vencidos siguen guardados en la tabla', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');

      const filas = await db.query(`SELECT carga_uid FROM sod_sincronizacion`);

      expect(filas.values?.length).toBe(1);
    });

    it('un envío que falló también deja de ofrecerse al día siguiente', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');
      await repo.marcarError('UID-AYER', 'Failed to fetch');

      expect(await repo.listarPendientes()).toEqual([]);
    });

    it('un envío que falló hoy sí se puede reintentar', async () => {
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');
      await repo.marcarError('UID-HOY', 'Failed to fetch');

      expect((await repo.listarPendientes()).map((p) => p.cargaUid)).toEqual(['UID-HOY']);
    });

    it('lo ya enviado no se vuelve a ofrecer', async () => {
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');
      await repo.marcarEnviado('UID-HOY', 2);

      expect(await repo.listarPendientes()).toEqual([]);
    });
  });

  /*
   * EL CORAZÓN DE ESTE ARREGLO: qué se sabe del envío de un TAG.
   *
   * Un TAG es editable solo si el servidor NO lo recibió. La dificultad es que
   * la PDA no siempre lo sabe: el servidor puede haber guardado el TAG y la
   * respuesta perderse. Esa duda tiene su propio estado (EN_DUDA), distinto de
   * "no se pudo enviar" (NO_RECIBIDO), y mientras dure el TAG no se toca.
   */
  describe('estado del envío de un TAG', () => {
    const CONTEO = 10;
    const UBICACION = 228;

    /*
     * La base de pruebas hace cumplir las claves foráneas: el envío cuelga de un
     * conteo y de una ubicación que tienen que existir de verdad.
     */
    async function sembrar(ubicacionId: number) {
      await db.run(
        `INSERT OR IGNORE INTO sod_evento_inventario (id, sucursal_id, nombre, fecha_programada)
         VALUES (10, 1, 'Inventario', ?)`,
        [hoySql()]
      );
      await db.run(`INSERT OR IGNORE INTO sod_conteo (id, evento_id, iteracion) VALUES (?, 10, 1)`, [CONTEO]);
      await db.run(`INSERT OR IGNORE INTO sod_zona (id, sucursal_id, nombre) VALUES (1, 1, 'OTRO')`);
      await db.run(`INSERT OR IGNORE INTO sod_ubicacion (id, zona_id, codigo, tag) VALUES (?, 1, '7001', '7001')`, [ubicacionId]);
    }

    /* Deja un envío de TAG para esa ubicación, recién guardado (PENDIENTE). */
    async function envio(uid: string, ubicacionId = UBICACION, payload: object = { carga_uid: uid }) {
      await sembrar(ubicacionId);
      await repo.guardarSyncTag({
        eventoId: 10, pdaId: 1, iteracion: 1, perfil: 'OPERADOR',
        conteoId: CONTEO, ubicacionId, operadorId: 1,
        cargaUid: uid, payload: payload as never,
      });
    }

    const fila = async (uid: string) => {
      const r = await db.query(`SELECT estado, error, intentos, payload_json FROM sod_sincronizacion WHERE carga_uid = ?`, [uid]);
      return r.values?.[0] as Record<string, unknown>;
    };

    describe('qué estado tiene', () => {
      it('sin ningún envío: SIN_ENVIO', async () => {
        expect(await repo.estadoEnvioTag(CONTEO, UBICACION)).toEqual({ estado: 'SIN_ENVIO', cargaUid: null, detalle: null });
      });

      // La fila se guarda ANTES del POST. Si la app se cierra ahí, no se sabe
      // si el servidor llegó a recibirlo: tiene que figurar en duda.
      it('guardado y sin resolver: EN_DUDA', async () => {
        await envio('UID-1');

        const e = await repo.estadoEnvioTag(CONTEO, UBICACION);

        expect(e.estado).toBe('EN_DUDA');
        expect(e.cargaUid).toBe('UID-1');
      });

      it('con un error con certeza: NO_RECIBIDO, y trae el motivo', async () => {
        await envio('UID-1');
        await repo.marcarError('UID-1', 'Falta TAG.');

        expect(await repo.estadoEnvioTag(CONTEO, UBICACION)).toEqual({
          estado: 'NO_RECIBIDO', cargaUid: 'UID-1', detalle: 'Falta TAG.',
        });
      });

      it('sin respuesta del servidor: EN_DUDA, y trae el motivo', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'El servidor no respondió a tiempo.');

        expect(await repo.estadoEnvioTag(CONTEO, UBICACION)).toEqual({
          estado: 'EN_DUDA', cargaUid: 'UID-1', detalle: 'El servidor no respondió a tiempo.',
        });
      });

      it('confirmado por el servidor: ENVIADO', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);

        const e = await repo.estadoEnvioTag(CONTEO, UBICACION);

        expect(e.estado).toBe('ENVIADO');
        expect(e.detalle).toBeNull();
      });

      it('confirmado, pero con otro contenido que la PDA: ENVIADO y deja anotado en qué difiere', async () => {
        await envio('UID-1');
        await repo.marcarEnviadoConDiferencias('UID-1', 1, 'El servidor tiene 1 lectura y la PDA 3.');

        expect(await repo.estadoEnvioTag(CONTEO, UBICACION)).toEqual({
          estado: 'ENVIADO', cargaUid: 'UID-1', detalle: 'El servidor tiene 1 lectura y la PDA 3.',
        });
      });

      it('una duda se resuelve cuando después llega la confirmación', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'corte');
        await repo.marcarEnviado('UID-1', 3);

        expect((await repo.estadoEnvioTag(CONTEO, UBICACION)).estado).toBe('ENVIADO');
      });

      it('una duda se resuelve cuando se sabe que el servidor no lo tiene', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'corte');
        await repo.marcarError('UID-1', 'El servidor no lo recibió.');

        expect((await repo.estadoEnvioTag(CONTEO, UBICACION)).estado).toBe('NO_RECIBIDO');
      });
    });

    describe('a qué TAG se refiere', () => {
      it('no mezcla un TAG con otro', async () => {
        await envio('UID-A', 228);
        await repo.marcarEnviado('UID-A', 1);

        expect((await repo.estadoEnvioTag(CONTEO, 999)).estado).toBe('SIN_ENVIO');
      });

      it('una validación del analista no cuenta como envío de TAG', async () => {
        await sembrar(UBICACION);
        await db.run(
          `INSERT INTO sod_sincronizacion (tipo, operacion, perfil, conteo_id, ubicacion_id, carga_uid, estado, fecha_hora)
           VALUES ('CARGA_DESDE_PDA', 'VALIDACION_OPERACIONAL', 'ANALISTA_CLIENTE', ?, ?, 'VAL-1', 'ENVIADO', ?)`,
          [CONTEO, UBICACION, hoySql()]
        );

        expect((await repo.estadoEnvioTag(CONTEO, UBICACION)).estado).toBe('SIN_ENVIO');
      });

      /*
       * Si hubiera dos envíos del mismo TAG, manda el más restrictivo, aunque NO
       * sea el último: recibido > en duda > error. Uno recibido hace tiempo no
       * deja de serlo porque después hubo un intento que falló.
       */
      it('un envío recibido pesa más que uno posterior con error', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);
        await envio('UID-2');
        await repo.marcarError('UID-2', 'x');

        expect((await repo.estadoEnvioTag(CONTEO, UBICACION)).estado).toBe('ENVIADO');
      });

      it('uno en duda pesa más que uno posterior con error', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'corte');
        await envio('UID-2');
        await repo.marcarError('UID-2', 'x');

        expect((await repo.estadoEnvioTag(CONTEO, UBICACION)).estado).toBe('EN_DUDA');
      });

      it('uno recibido pesa más que uno posterior en duda', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);
        await envio('UID-2');

        expect((await repo.estadoEnvioTag(CONTEO, UBICACION)).estado).toBe('ENVIADO');
      });
    });

    describe('qué estados no se pueden pisar', () => {
      // Dos intentos pueden cruzarse (uno automático, uno manual). Si el que
      // falla termina después del que llegó, el TAG sigue siendo recibido.
      it('un error tardío no baja un envío ya recibido', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);

        await repo.marcarError('UID-1', 'Sin conexión con el servidor.');

        expect((await fila('UID-1'))['estado']).toBe('ENVIADO');
      });

      it('una falta de respuesta tardía tampoco', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);

        await repo.marcarSinRespuesta('UID-1', 'corte');

        expect((await fila('UID-1'))['estado']).toBe('ENVIADO');
      });

      it('guardar de nuevo NO reinicia un envío recibido', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);

        await envio('UID-1', UBICACION, { carga_uid: 'UID-1', cambiado: true });

        const f = await fila('UID-1');
        expect(f['estado']).toBe('ENVIADO');
        expect(f['payload_json']).not.toContain('cambiado');
        expect(f['intentos']).toBe(1);
      });

      // Reescribir el payload de algo que el servidor pudo haber recibido hace
      // que el reenvío ya no sea el que recibió: eso termina en un 409.
      it('guardar de nuevo NO cambia el payload de un envío en duda', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'corte');

        await envio('UID-1', UBICACION, { carga_uid: 'UID-1', cambiado: true });

        const f = await fila('UID-1');
        expect(f['estado']).toBe('PENDIENTE');
        expect(f['payload_json']).not.toContain('cambiado');
        expect(f['error']).toBe('corte');
      });

      it('guardar de nuevo SÍ reemplaza un envío que se sabe que no llegó', async () => {
        await envio('UID-1');
        await repo.marcarError('UID-1', 'Falta TAG.');

        await envio('UID-1', UBICACION, { carga_uid: 'UID-1', cambiado: true });

        const f = await fila('UID-1');
        expect(f['estado']).toBe('PENDIENTE');
        expect(f['payload_json']).toContain('cambiado');
        expect(f['intentos']).toBe(0);
        expect(f['error']).toBeNull();
      });
    });

    describe('leer un envío guardado', () => {
      it('trae la fila completa, con el payload tal como se guardó', async () => {
        await envio('UID-1', UBICACION, { carga_uid: 'UID-1', original: true });
        await repo.marcarSinRespuesta('UID-1', 'corte');

        const e = await repo.obtenerEnvio('UID-1');

        expect(e?.cargaUid).toBe('UID-1');
        expect(e?.estado).toBe('PENDIENTE');
        expect(e?.error).toBe('corte');
        expect(e?.payloadJson).toContain('original');
        expect(e?.conteoId).toBe(CONTEO);
        expect(e?.ubicacionId).toBe(UBICACION);
      });

      it('si no existe, null', async () => {
        expect(await repo.obtenerEnvio('NO-EXISTE')).toBeNull();
      });
    });

    /* Deja una línea del conteo, en el estado indicado, para esa ubicación. */
    async function linea(ubicacionId: number, estado: 'EN_CURSO' | 'FINALIZADO' | 'SINCRONIZADO') {
      await sembrar(ubicacionId);
      await db.run(`INSERT OR IGNORE INTO sod_producto (id, sku) VALUES (100, 'SKU-100')`);
      await db.run(
        `INSERT INTO sod_conteo_detalle (conteo_id, ubicacion_id, producto_id, operador_id, pda_id, cantidad_fisica, estado)
         VALUES (?, ?, 100, 1, 1, 1, ?)`,
        [CONTEO, ubicacionId, estado]
      );
    }

    const existe = async (uid: string) => {
      const r = await db.query(`SELECT 1 FROM sod_sincronizacion WHERE carga_uid = ?`, [uid]);
      return (r.values?.length ?? 0) > 0;
    };

    /*
     * La fila 213 de la PDA del TAG 7001: el TAG se descartó (sus lecturas se
     * borraron) pero su envío fallido quedó en la cola, con el contenido viejo.
     * Con los reintentos automáticos se habría vuelto a enviar sola.
     */
    describe('limpiarEnviosHuerfanos', () => {
      it('borra el envío fallido de un TAG que ya no tiene lecturas', async () => {
        await envio('UID-1');
        await repo.marcarError('UID-1', 'sin red');

        await repo.limpiarEnviosHuerfanos();

        expect(await existe('UID-1')).toBeFalse();
      });

      it('NO borra el envío fallido de un TAG que sigue existiendo', async () => {
        await envio('UID-1');
        await linea(UBICACION, 'FINALIZADO');
        await repo.marcarError('UID-1', 'sin red');

        await repo.limpiarEnviosHuerfanos();

        expect(await existe('UID-1')).toBeTrue();
      });

      it('un TAG en curso (reabierto) tampoco es huérfano', async () => {
        await envio('UID-1');
        await linea(UBICACION, 'EN_CURSO');
        await repo.marcarError('UID-1', 'sin red');

        await repo.limpiarEnviosHuerfanos();

        expect(await existe('UID-1')).toBeTrue();
      });

      // Son la constancia de lo que el servidor tiene o pudo haber recibido.
      it('NUNCA borra un envío recibido, aunque el TAG ya no esté', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);

        await repo.limpiarEnviosHuerfanos();

        expect(await existe('UID-1')).toBeTrue();
      });

      it('NUNCA borra un envío en duda, aunque el TAG ya no esté', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'corte');

        await repo.limpiarEnviosHuerfanos();

        expect(await existe('UID-1')).toBeTrue();
      });

      it('borra solo al huérfano y deja el del otro TAG', async () => {
        await envio('UID-1', 228);
        await envio('UID-2', 229);
        await linea(229, 'FINALIZADO');
        await repo.marcarError('UID-1', 'x');
        await repo.marcarError('UID-2', 'x');

        await repo.limpiarEnviosHuerfanos();

        expect(await existe('UID-1')).toBeFalse();
        expect(await existe('UID-2')).toBeTrue();
      });

      it('no toca las validaciones del analista ni lo que no tiene TAG asociado', async () => {
        await sembrar(UBICACION);
        await repo.guardarSyncValidacion({
          eventoId: 10, pdaId: 1, cargaUid: 'VAL-1', payload: { uuid: 'x' } as never,
        } as never);
        await db.run(`UPDATE sod_sincronizacion SET estado = 'ERROR' WHERE carga_uid = 'VAL-1'`);

        await repo.limpiarEnviosHuerfanos();

        expect(await existe('VAL-1')).toBeTrue();
      });

      it('sin nada que limpiar, no falla', async () => {
        await expectAsync(repo.limpiarEnviosHuerfanos()).toBeResolved();
      });
    });

    describe('listarEnviadosPorSanar', () => {
      it('un envío recibido cuyo TAG sigue FINALIZADO', async () => {
        await envio('UID-1');
        await linea(UBICACION, 'FINALIZADO');
        await repo.marcarEnviado('UID-1', 3);

        expect((await repo.listarEnviadosPorSanar()).map((p) => p.cargaUid)).toEqual(['UID-1']);
      });

      it('si el TAG ya está SINCRONIZADO, no hay nada que sanar', async () => {
        await envio('UID-1');
        await linea(UBICACION, 'SINCRONIZADO');
        await repo.marcarEnviado('UID-1', 3);

        expect(await repo.listarEnviadosPorSanar()).toEqual([]);
      });

      it('un envío que no está recibido (error o duda) no cuenta', async () => {
        await envio('UID-1', 228);
        await linea(228, 'FINALIZADO');
        await repo.marcarError('UID-1', 'x');
        await envio('UID-2', 229);
        await linea(229, 'FINALIZADO');
        await repo.marcarSinRespuesta('UID-2', 'corte');

        expect(await repo.listarEnviadosPorSanar()).toEqual([]);
      });

      it('un TAG en curso (reabierto) no cuenta', async () => {
        await envio('UID-1');
        await linea(UBICACION, 'EN_CURSO');
        await repo.marcarEnviado('UID-1', 3);

        expect(await repo.listarEnviadosPorSanar()).toEqual([]);
      });

      it('no modifica nada', async () => {
        await envio('UID-1');
        await linea(UBICACION, 'FINALIZADO');
        await repo.marcarEnviado('UID-1', 3);

        await repo.listarEnviadosPorSanar();

        expect((await fila('UID-1'))['estado']).toBe('ENVIADO');
      });
    });

    describe('qué se reintenta', () => {
      it('un envío en duda sigue entre los pendientes', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'corte');

        expect((await repo.listarPendientes()).map((p) => p.cargaUid)).toEqual(['UID-1']);
      });

      it('uno recibido no', async () => {
        await envio('UID-1');
        await repo.marcarEnviado('UID-1', 3);

        expect(await repo.listarPendientes()).toEqual([]);
      });

      it('cada intento suma al contador, en duda o con error', async () => {
        await envio('UID-1');
        await repo.marcarSinRespuesta('UID-1', 'a');
        await repo.marcarError('UID-1', 'b');
        await repo.marcarSinRespuesta('UID-1', 'c');

        expect((await fila('UID-1'))['intentos']).toBe(3);
      });
    });
  });
});
