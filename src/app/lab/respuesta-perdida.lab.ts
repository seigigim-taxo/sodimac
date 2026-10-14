import { TestBed } from '@angular/core/testing';
import { SqliteConnectionService } from '../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../core/database/sodimac.schema';
import { ConexionFalsa, crearConexionEnMemoria } from '../../testing/sqlite-en-memoria';
import { ApiService } from '../core/http/api.service';
import { SqliteConteoRepository } from '../data/conteo/conteo.repository';
import { SqliteSincronizacionRepository } from '../data/sincronizacion/sincronizacion.repository';
import { SqliteUbicacionRepository } from '../data/ubicacion/ubicacion.repository';
import { EstadoCargasApiService } from '../data/sincronizacion/estado-cargas-api.service';
import { CONTEO_REPOSITORY_TOKEN } from '../domain/conteo/repositories/conteo.repository';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../domain/sincronizacion/repositories/sincronizacion.repository';
import { ESTADO_CARGAS_API_REPOSITORY_TOKEN } from '../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { UBICACION_REPOSITORY_TOKEN } from '../domain/ubicacion/repositories/ubicacion.repository';
import { ConteoResumen } from '../domain/conteo/models/conteo-resumen.model';
import { EnvioFallidoError } from '../domain/shared/errors/envio-fallido.error';
import { SincronizarConteoUseCase } from '../application/sincronizacion/sincronizar-conteo.use-case';
import { EnviarPendientesUseCase } from '../application/sincronizacion/enviar-pendientes.use-case';
import { ReabrirTagUseCase } from '../application/conteo/reabrir-tag.use-case';
import { DeleteConteoSesionUseCase } from '../application/conteo/delete-conteo-sesion.use-case';
import { hoySql } from '../shared/utils/fecha.utils';

/*
 * LABORATORIO — la app real contra el servidor real, con respuestas perdidas.
 *
 * No corre con `npm run test:ci`: necesita el laboratorio arriba (ver
 * tools/lab/README.md) y se salta solo si no lo encuentra. Se lanza con:
 *
 *   npx ng test --configuration=ci --include=src/app/lab/*.lab.ts
 *
 * Usa los casos de uso y repositorios REALES, una SQLite real en memoria y red
 * real hacia el proxy del laboratorio. Lo único que se reemplaza es de dónde
 * saca la conexión SQLite y a dónde apunta ApiService.
 *
 * ⚠ ApiService apunta por defecto al servidor de PRODUCCIÓN (environment.apiUrl).
 * Cada prueba lo redirige al proxy y ABORTA si no lo logró: un TAG de prueba
 * jamás debe llegar a producción.
 */
const PROXY = 'http://127.0.0.1:8081';
const API_LAB = `${PROXY}/api`;

const CONTEO = 1, OPERADOR = 1, PDA = 1, PRODUCTO = 1, ZONA = 1;
const TAG = '7001';

const SEMILLA = `
  INSERT OR IGNORE INTO sod_rol (id, nombre) VALUES (1, 'Operador');
  INSERT INTO sod_user (id, rol_id, rut, rut_dv, correo) VALUES (${OPERADOR}, 1, 19756709, '0', '197567090');
  INSERT INTO sod_sucursal (id, codigo_tienda, nombre) VALUES (1, '4093', 'Tienda de prueba');
  INSERT INTO sod_evento_inventario (id, sucursal_id, nombre, fecha_programada) VALUES (1, 1, 'Inventario', '${hoySql()}');
  INSERT INTO sod_muestra (id, evento_id, sucursal_id, iteracion, codigo_muestra, id_agenda, numero_agenda)
    VALUES (1, 1, 1, 1, 'MUE-1', 2714, 'AG-LAB-4093-01');
  INSERT INTO sod_producto (id, sku, codigo_barras, descripcion) VALUES (${PRODUCTO}, '672289', '2000000672281', 'TAPA CAMARA');
  INSERT INTO sod_pda (id, codigo) VALUES (${PDA}, 'PDA-LAB');
  INSERT INTO sod_zona (id, sucursal_id, nombre, descripcion, tag_desde, tag_hasta) VALUES (${ZONA}, 1, 'OTRO', 'Pto. vta. otros', 7000, 7999);
  INSERT INTO sod_conteo (id, evento_id, iteracion, estado) VALUES (${CONTEO}, 1, 1, 'ABIERTO');
`;

let laboratorio = false;

async function control(ruta: string, metodo = 'POST'): Promise<any> {
  const r = await fetch(`${PROXY}/__lab/${ruta}`, { method: metodo });
  return r.json();
}

const modo = (m: string) => control(`modo/${m}`);
const registro = async (): Promise<{ metodo: string; ruta: string; modo: string; estado: unknown }[]> =>
  control('log', 'GET');
const envios = async () => (await registro()).filter((e) => e.metodo === 'POST' && /tag-finalizado/.test(e.ruta));
const consultasEstado = async () => (await registro()).filter((e) => /estado-cargas/.test(e.ruta));

describe('LAB · la app real contra el servidor, con respuestas perdidas', () => {
  let db: ConexionFalsa;
  let conteoRepo: SqliteConteoRepository;
  let sincRepo: SqliteSincronizacionRepository;
  let ubicacionRepo: SqliteUbicacionRepository;
  let sincronizarConteo: SincronizarConteoUseCase;
  let enviarPendientes: EnviarPendientesUseCase;
  let reabrir: ReabrirTagUseCase;
  let borrar: DeleteConteoSesionUseCase;
  let ubicacionId: number;

  beforeAll(async () => {
    laboratorio = await fetch(`${PROXY}/__lab/modo`).then((r) => r.ok).catch(() => false);
    if (!laboratorio) console.warn('[LAB] el laboratorio no está arriba: se saltan las pruebas.');
  });

  beforeEach(async () => {
    if (!laboratorio) return;
    await control('reset');

    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL + SEMILLA);
    await db.run(`INSERT INTO sod_ubicacion (id, zona_id, codigo, tag) VALUES (1, ${ZONA}, '${TAG}', '${TAG}')`);
    ubicacionId = 1;

    TestBed.configureTestingModule({
      providers: [
        SqliteConnectionService,
        { provide: CONTEO_REPOSITORY_TOKEN, useClass: SqliteConteoRepository },
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useClass: SqliteSincronizacionRepository },
        { provide: UBICACION_REPOSITORY_TOKEN, useClass: SqliteUbicacionRepository },
        { provide: ESTADO_CARGAS_API_REPOSITORY_TOKEN, useClass: EstadoCargasApiService },
      ],
    });
    spyOn(TestBed.inject(SqliteConnectionService), 'getConnection').and.resolveTo(db as never);

    // Nunca producción: se redirige y se verifica ANTES de enviar nada.
    const api = TestBed.inject(ApiService);
    (api as unknown as { baseUrl: string }).baseUrl = API_LAB;
    if ((api as unknown as { baseUrl: string }).baseUrl !== API_LAB) {
      throw new Error('ApiService no quedó apuntando al laboratorio: se aborta para no tocar producción.');
    }

    conteoRepo = TestBed.inject(CONTEO_REPOSITORY_TOKEN) as SqliteConteoRepository;
    sincRepo = TestBed.inject(SINCRONIZACION_REPOSITORY_TOKEN) as SqliteSincronizacionRepository;
    ubicacionRepo = TestBed.inject(UBICACION_REPOSITORY_TOKEN) as SqliteUbicacionRepository;
    sincronizarConteo = TestBed.inject(SincronizarConteoUseCase);
    enviarPendientes = TestBed.inject(EnviarPendientesUseCase);
    reabrir = TestBed.inject(ReabrirTagUseCase);
    borrar = TestBed.inject(DeleteConteoSesionUseCase);
  });

  afterEach(async () => {
    if (!laboratorio) return;
    await control('modo/normal').catch(() => undefined);
    db?.cerrar();
  });

  /* Cuenta un TAG como lo haría el operador y lo deja finalizado. */
  async function contarYFinalizar(cantidades: number[] = [1, 1, 1], ubicacion = ubicacionId): Promise<ConteoResumen> {
    for (const c of cantidades) {
      await conteoRepo.upsert(CONTEO, ubicacion, PRODUCTO, OPERADOR, PDA, c, '2000000672281', 'ESCANER');
    }
    await conteoRepo.cerrarTag(CONTEO, ubicacion, OPERADOR);
    return (await conteoRepo.getResumenes(OPERADOR, PDA)).find((r) => r.ubicacionId === ubicacion)!;
  }

  const estadoDelTag = async (u = ubicacionId) => (await sincRepo.estadoEnvioTag(CONTEO, u)).estado;
  const estadoLineas = async () =>
    (await db.query(`SELECT estado FROM sod_conteo_detalle WHERE ubicacion_id = ${ubicacionId}`)).values?.[0]?.['estado'];

  async function falla(): Promise<EnvioFallidoError> {
    const resumen = (await conteoRepo.getResumenes(OPERADOR, PDA)).find((r) => r.estado === 'FINALIZADO')!;
    try {
      await sincronizarConteo.execute(resumen);
    } catch (e) {
      return e as EnvioFallidoError;
    }
    throw new Error('Se esperaba que el envío fallara');
  }

  const saltar = () => !laboratorio && pending('el laboratorio no está arriba');

  // ---------------------------------------------------------------------------
  it('camino feliz: finaliza con red y queda sincronizado', async () => {
    if (saltar()) return;
    const resumen = await contarYFinalizar();

    await sincronizarConteo.execute(resumen);

    expect(await estadoDelTag()).toBe('ENVIADO');
    expect(await estadoLineas()).toBe('SINCRONIZADO');
    expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Lo que arregla el cambio: aunque se pierda la respuesta, la PDA pregunta y se entera
  // ---------------------------------------------------------------------------
  it('la respuesta se pierde pero la conexión sigue: la PDA se entera ENSEGUIDA preguntando, sin reenviar', async () => {
    if (saltar()) return;
    await modo('perder-respuesta');
    const resumen = await contarYFinalizar();

    await sincronizarConteo.execute(resumen); // no lanza: el servidor confirmó que lo tiene

    expect(await estadoDelTag()).toBe('ENVIADO');
    expect(await estadoLineas()).toBe('SINCRONIZADO');
    expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(1); // un solo envío
    expect((await consultasEstado()).length).toBeGreaterThan(0); // y una consulta
  });

  it('solo la primera respuesta se pierde: igual queda sincronizado, con un solo envío', async () => {
    if (saltar()) return;
    await modo('perder-respuesta-una');
    const resumen = await contarYFinalizar();

    await sincronizarConteo.execute(resumen);

    expect(await estadoLineas()).toBe('SINCRONIZADO');
    expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // EL CASO DEL TAG 7001: ni la respuesta ni la consulta pudieron volver
  // ---------------------------------------------------------------------------
  describe('el servidor recibe el TAG y la respuesta se pierde, y la conexión se cae', () => {
    beforeEach(async () => { if (laboratorio) await modo('perder-respuesta-y-caer'); });

    it('la PDA no se entera: lo deja EN DUDA, no lo marca enviado, y lo dice', async () => {
      if (saltar()) return;
      await contarYFinalizar();

      const error = await falla();

      expect(error.enDuda).toBeTrue();
      expect(await estadoDelTag()).toBe('EN_DUDA');
      expect(await estadoLineas()).toBe('FINALIZADO');
    });

    it('NO se puede editar, borrar ni reabrir mientras está en duda', async () => {
      if (saltar()) return;
      const resumen = await contarYFinalizar();
      await falla();

      await expectAsync(reabrir.execute(resumen)).toBeRejectedWithError(/No pudimos confirmar/);
      await expectAsync(borrar.execute(CONTEO, ubicacionId, OPERADOR, PDA, 'FINALIZADO')).toBeRejectedWithError(/No pudimos confirmar/);
    });

    it('al volver la red, la PDA SE ENTERA sin reenviar el TAG y lo marca sincronizado', async () => {
      if (saltar()) return;
      await contarYFinalizar();
      await falla();
      await modo('normal');
      const enviosAntes = (await envios()).length;

      const r = await enviarPendientes.execute({ cortarAlFalloDeRed: true });

      expect(r.confirmadosTags).toEqual([TAG]);
      expect(await estadoDelTag()).toBe('ENVIADO');
      expect(await estadoLineas()).toBe('SINCRONIZADO');
      // Se enteró PREGUNTANDO: no volvió a subir el TAG entero.
      expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(enviosAntes);
      expect((await consultasEstado()).length).toBeGreaterThan(0);
    });

    it('el servidor queda con UNA sola carga: nada se duplicó', async () => {
      if (saltar()) return;
      await contarYFinalizar();
      await falla();
      await modo('normal');
      await enviarPendientes.execute();

      const r = await fetch(`${PROXY}/api/sincronizaciones/estado-cargas.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carga_uids: [(await sincRepo.estadoEnvioTag(CONTEO, ubicacionId)).cargaUid] }),
      }).then((x) => x.json());

      expect(r.data.cargas[0].existe).toBeTrue();
      expect(r.data.cargas[0].total_lecturas).toBe(3);
    });

    it('si el operador toca Sincronizar a mano estando en duda, también se resuelve sin duplicar', async () => {
      if (saltar()) return;
      const resumen = await contarYFinalizar();
      await falla();
      await modo('normal');
      const enviosAntes = (await envios()).length;

      await sincronizarConteo.execute(resumen);

      expect(await estadoLineas()).toBe('SINCRONIZADO');
      expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(enviosAntes);
    });

    it('re-escanear ese número de TAG NO lo reabre: abre uno nuevo con el anterior de referencia', async () => {
      if (saltar()) return;
      await contarYFinalizar();
      await falla();

      const r = await ubicacionRepo.insert(ZONA, TAG, TAG, CONTEO, OPERADOR, PDA);

      expect(r.ubicacionId).not.toBe(ubicacionId);
      expect(r.ubicacionSincronizadaId).toBe(ubicacionId);
      expect(r.referenciaBloqueada).toBe('EN_DUDA');
      expect(await estadoLineas()).toBe('FINALIZADO');
    });
  });

  // ---------------------------------------------------------------------------
  it('sin saber nada (todo caído): sigue en duda, no se edita, y prueba UNA sola vez antes de cortar', async () => {
    if (saltar()) return;
    await modo('perder-respuesta-y-caer');
    const resumen = await contarYFinalizar();
    await falla();
    await modo('caido');
    const enviosAntes = (await envios()).length;

    const r = await enviarPendientes.execute({ cortarAlFalloDeRed: true });

    expect(r.confirmadosTags).toEqual([]);
    expect(await estadoDelTag()).toBe('EN_DUDA');
    await expectAsync(reabrir.execute(resumen)).toBeRejected();
    // Reenviar el mismo contenido es seguro (mismo identificador); lo que no se hace es insistir.
    expect((await envios()).length - enviosAntes).toBeLessThanOrEqual(1);
  });

  it('el pedido se corta con la señal intermitente: queda en duda y se aclara solo al volver la red', async () => {
    if (saltar()) return;
    await modo('cortar-antes');
    await contarYFinalizar();

    const error = await falla();

    // Aunque ahora el servidor diga "no lo tengo", el reenvío también se cortó
    // y pudo haber llegado: lo prudente es seguir en duda.
    expect(error.enDuda).toBeTrue();
    expect(await estadoDelTag()).toBe('EN_DUDA');

    await modo('normal');
    const r = await enviarPendientes.execute({ cortarAlFalloDeRed: true });

    expect(r.confirmadosTags).toEqual([TAG]);
    expect(await estadoLineas()).toBe('SINCRONIZADO');
  });

  it('sin red de verdad (el sistema lo sabe): no llegó, el TAG sigue editable, y sale al volver la red', async () => {
    if (saltar()) return;
    const onLine = spyOnProperty(Navigator.prototype, 'onLine', 'get').and.returnValue(false);
    await modo('cortar-antes');
    const resumen = await contarYFinalizar();

    const error = await falla();

    expect(error.enDuda).toBeFalse();
    expect(await estadoDelTag()).toBe('NO_RECIBIDO');
    await reabrir.execute(resumen); // editable

    onLine.and.returnValue(true);
    await modo('normal');
    await conteoRepo.cerrarTag(CONTEO, ubicacionId, OPERADOR);
    const r = await enviarPendientes.execute();

    expect(r.confirmadosTags).toEqual([TAG]);
    expect(await estadoLineas()).toBe('SINCRONIZADO');
  });

  it('el servidor rechaza (503): no llegó, editable, y no se queda reintentando en bucle', async () => {
    if (saltar()) return;
    await modo('rechazar');
    await contarYFinalizar();

    await falla();

    expect(await estadoDelTag()).toBe('NO_RECIBIDO');
    expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Batería: cuántas llamadas hace de más
  // ---------------------------------------------------------------------------
  describe('batería: no llama de más', () => {
    it('sin nada pendiente no hace NINGUNA llamada a la red', async () => {
      if (saltar()) return;

      const r = await enviarPendientes.execute({ cortarAlFalloDeRed: true });

      expect(r.total).toBe(0);
      expect((await registro()).length).toBe(0);
    });

    it('con la red caída, prueba con un solo TAG y corta la tanda', async () => {
      if (saltar()) return;
      // Tres TAGs pendientes (ubicaciones distintas) y el servidor sin atender.
      for (const u of [10, 11, 12]) {
        await db.run(`INSERT INTO sod_ubicacion (id, zona_id, codigo, tag) VALUES (${u}, ${ZONA}, '${7100 + u}', '${7100 + u}')`);
      }
      await modo('cortar-antes');
      for (const u of [10, 11, 12]) {
        const resumen = await contarYFinalizar([2], u);
        await sincronizarConteo.execute(resumen).catch(() => undefined);
      }
      await control('reset');
      await modo('cortar-antes');

      const r = await enviarPendientes.execute({ cortarAlFalloDeRed: true });

      expect(r.cortadoPorRed).toBeTrue();
      expect((await envios()).length).toBeLessThanOrEqual(2); // un envío + a lo sumo su reenvío tras consultar
      expect(r.reintentables).toBe(3);
    });

    it('un TAG descartado deja de enviarse: no queda en la cola', async () => {
      if (saltar()) return;
      const onLine = spyOnProperty(Navigator.prototype, 'onLine', 'get').and.returnValue(false);
      await modo('cortar-antes');
      const resumen = await contarYFinalizar();
      await falla();
      expect(await estadoDelTag()).toBe('NO_RECIBIDO');

      await borrar.execute(CONTEO, ubicacionId, OPERADOR, PDA, 'FINALIZADO');
      onLine.and.returnValue(true);
      await modo('normal');
      await control('reset');
      const r = await enviarPendientes.execute();

      expect(r.total).toBe(0);
      expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(0);
      expect(resumen.tag).toBe(TAG);
    });
  });

  // ---------------------------------------------------------------------------
  it('declarar 0 sobre un SKU con unidades: el envío llega y el servidor no lo rechaza', async () => {
    if (saltar()) return;
    await conteoRepo.upsert(CONTEO, ubicacionId, PRODUCTO, OPERADOR, PDA, 5, '2000000672281', 'ESCANER');
    const resumen = await contarYFinalizar([0]);

    await sincronizarConteo.execute(resumen);

    expect(await estadoLineas()).toBe('SINCRONIZADO');
    expect((await envios()).length).withContext(JSON.stringify(await registro())).toBe(1);
  });
});
