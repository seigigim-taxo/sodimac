import { TestBed } from '@angular/core/testing';
import { SqliteUbicacionRepository } from './ubicacion.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';

/*
 * Lo que se prueba acá es la decisión de negocio detrás de escanear un TAG que
 * ya existe: ¿es un objeto nuevo, el mismo que sigue abierto, uno que se cerró
 * y hay que retomar, o uno que ya viajó al SGO y no se puede tocar? Elegir mal
 * cualquiera de los tres primeros pisa datos o pierde el conteo; el cuarto
 * (SINCRONIZADO) además tiene que dejar una referencia de solo lectura para
 * el TAG nuevo que se crea en su lugar.
 */
const CONTEO_ID = 7;
const OPERADOR_ID = 1;
const PDA_ID = 1;
const ZONA_ID = 3;

const SEMILLA = `
  INSERT OR IGNORE INTO sod_rol (id, nombre) VALUES (1, 'Operador');
  INSERT INTO sod_user (id, rol_id, rut, rut_dv, correo) VALUES (${OPERADOR_ID}, 1, 18306696, 'K', 'op@taxo.cl');
  INSERT INTO sod_sucursal (id, codigo_tienda, nombre) VALUES (1, 'T01', 'Maipú');
  INSERT INTO sod_pda (id, codigo) VALUES (${PDA_ID}, 'PDA-01');
  INSERT INTO sod_zona (id, sucursal_id, nombre) VALUES (${ZONA_ID}, 1, 'SALA_VENTAS');
  INSERT INTO sod_evento_inventario (id, sucursal_id, nombre, fecha_programada) VALUES (1, 1, 'Inventario', '2026-08-27');
  INSERT INTO sod_conteo (id, evento_id, iteracion, estado) VALUES (${CONTEO_ID}, 1, 1, 'ABIERTO');
  INSERT INTO sod_producto (id, sku) VALUES (100, 'SKU-100');
`;

describe('SqliteUbicacionRepository', () => {
  let repo: SqliteUbicacionRepository;
  let db: ConexionFalsa;

  /* Deja un TAG existente con una sola línea en el estado indicado. */
  async function ubicacionCon(
    estado: 'EN_CURSO' | 'FINALIZADO' | 'SINCRONIZADO',
    opts: { conteoId?: number; operadorId?: number; pdaId?: number; codigo?: string; tag?: string } = {}
  ): Promise<number> {
    const conteoId   = opts.conteoId   ?? CONTEO_ID;
    const operadorId = opts.operadorId ?? OPERADOR_ID;
    const pdaId       = opts.pdaId      ?? PDA_ID;
    const codigo      = opts.codigo     ?? 'TAG-001';
    const tag         = opts.tag        ?? 'TAG-001';

    await db.run(`INSERT INTO sod_ubicacion (zona_id, codigo, tag) VALUES (?, ?, ?)`, [ZONA_ID, codigo, tag]);
    const r = await db.query(`SELECT id FROM sod_ubicacion ORDER BY id DESC LIMIT 1`);
    const ubicacionId = (r.values?.[0] as Record<string, unknown>)['id'] as number;

    await db.run(
      `INSERT INTO sod_conteo_detalle (conteo_id, ubicacion_id, producto_id, operador_id, pda_id, cantidad_fisica, estado)
       VALUES (?, ?, 100, ?, ?, 1, ?)`,
      [conteoId, ubicacionId, operadorId, pdaId, estado]
    );

    return ubicacionId;
  }

  beforeEach(async () => {
    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL + SEMILLA);

    TestBed.configureTestingModule({
      providers: [SqliteUbicacionRepository, SqliteConnectionService],
    });
    const conexion = TestBed.inject(SqliteConnectionService);
    spyOn(conexion, 'getConnection').and.resolveTo(db as never);
    repo = TestBed.inject(SqliteUbicacionRepository);
  });

  afterEach(() => db?.cerrar());

  describe('sin ninguna coincidencia', () => {
    it('crea una fila nueva', async () => {
      const resultado = await repo.insert(ZONA_ID, 'TAG-NUEVO', 'TAG-NUEVO', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.reabierta).toBeFalse();
      expect(resultado.ubicacionSincronizadaId).toBeNull();
      expect(resultado.ubicacionId).toBeGreaterThan(0);
    });
  });

  describe('coincide con una EN_CURSO', () => {
    it('la reutiliza en vez de crear una fila nueva', async () => {
      const id = await ubicacionCon('EN_CURSO');

      const resultado = await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.ubicacionId).toBe(id);
      expect(resultado.reabierta).toBeFalse();
    });
  });

  /*
   * EL CASO PEDIDO: re-escanear un TAG finalizado (contado, sin sincronizar)
   * lo reabre en vez de crear uno nuevo — mismo efecto que "Editar" desde el
   * resumen (ReabrirTagUseCase), disparado por el escaneo.
   */
  describe('coincide con una FINALIZADA de esta misma ronda', () => {
    it('la reabre: EN_CURSO de nuevo, y devuelve su id', async () => {
      const id = await ubicacionCon('FINALIZADO');

      const resultado = await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.ubicacionId).toBe(id);
      expect(resultado.reabierta).toBeTrue();
      expect(resultado.ubicacionSincronizadaId).toBeNull();

      const detalle = await db.query(`SELECT estado FROM sod_conteo_detalle WHERE ubicacion_id = ?`, [id]);
      expect((detalle.values?.[0] as Record<string, unknown>)['estado']).toBe('EN_CURSO');
    });

    // Acotado a la ronda: una finalizada de una iteración anterior no es "el mismo TAG de ahora".
    it('NO la reabre si la finalizada es de otra ronda', async () => {
      await db.run(`INSERT INTO sod_conteo (id, evento_id, iteracion, estado) VALUES (99, 1, 2, 'ABIERTO')`);
      const idVieja = await ubicacionCon('FINALIZADO', { conteoId: 99 });

      const resultado = await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.ubicacionId).not.toBe(idVieja);
      expect(resultado.reabierta).toBeFalse();

      // La vieja sigue FINALIZADA, no se tocó.
      const detalle = await db.query(`SELECT estado FROM sod_conteo_detalle WHERE ubicacion_id = ?`, [idVieja]);
      expect((detalle.values?.[0] as Record<string, unknown>)['estado']).toBe('FINALIZADO');
    });
  });

  /*
   * EL SEGUNDO CASO PEDIDO: un TAG ya SINCRONIZADO es inmutable — no se
   * reabre — pero la fila nueva que se crea en su lugar viene con la
   * referencia de la vieja, para mostrarla de solo lectura.
   */
  describe('coincide con una SINCRONIZADA de esta misma ronda', () => {
    it('crea una fila NUEVA, no la reabre', async () => {
      const idVieja = await ubicacionCon('SINCRONIZADO');

      const resultado = await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.ubicacionId).not.toBe(idVieja);
      expect(resultado.reabierta).toBeFalse();
    });

    it('informa el id de la vieja como referencia', async () => {
      const idVieja = await ubicacionCon('SINCRONIZADO');

      const resultado = await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.ubicacionSincronizadaId).toBe(idVieja);
    });

    it('no toca la línea sincronizada vieja', async () => {
      const idVieja = await ubicacionCon('SINCRONIZADO');

      await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      const detalle = await db.query(`SELECT estado FROM sod_conteo_detalle WHERE ubicacion_id = ?`, [idVieja]);
      expect((detalle.values?.[0] as Record<string, unknown>)['estado']).toBe('SINCRONIZADO');
    });

    // Acotado igual que el caso FINALIZADO: una sincronizada de otra ronda no es referencia útil.
    it('no ofrece referencia si la sincronizada es de otra ronda', async () => {
      await db.run(`INSERT INTO sod_conteo (id, evento_id, iteracion, estado) VALUES (99, 1, 2, 'ABIERTO')`);
      await ubicacionCon('SINCRONIZADO', { conteoId: 99 });

      const resultado = await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.ubicacionSincronizadaId).toBeNull();
    });

    // Con más de una coincidencia, la más reciente es la que probablemente le importa al operador.
    it('con dos sincronizadas coincidentes, toma la más reciente', async () => {
      await ubicacionCon('SINCRONIZADO');
      const masReciente = await ubicacionCon('SINCRONIZADO');

      const resultado = await repo.insert(ZONA_ID, 'TAG-001', 'TAG-001', CONTEO_ID, OPERADOR_ID, PDA_ID);

      expect(resultado.ubicacionSincronizadaId).toBe(masReciente);
    });
  });
});
