import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { DevSeederRepository } from '../../domain/dev/repositories/dev-seeder.repository';

/*
 * Productos dummy: [sku, codigo_barras, descripcion].
 * Formato SKU: AF + correlativo de 9 dígitos, desde AF000037001.
 * Los primeros 10 entran a la muestra; los últimos 3 quedan fuera
 * para probar el rechazo de SKUs en el conteo.
 */
const PRODUCTOS: Array<[string, string, string]> = [
  ['AF000037001', 'AF000037001', 'Taladro percutor 500W'],
  ['AF000037002', 'AF000037002', 'Sierra circular 7 1/4"'],
  ['AF000037003', 'AF000037003', 'Martillo carpintero 16oz'],
  ['AF000037004', 'AF000037004', 'Set destornilladores 6 pzs'],
  ['AF000037005', 'AF000037005', 'Cinta métrica 5m'],
  ['AF000037006', 'AF000037006', 'Pintura látex blanco 1gl'],
  ['AF000037007', 'AF000037007', 'Brocha 2" cerda natural'],
  ['AF000037008', 'AF000037008', 'Alargador eléctrico 5m'],
  ['AF000037009', 'AF000037009', 'Candado bronce 40mm'],
  ['AF000037010', 'AF000037010', 'Silicona transparente 280ml'],
  ['AF000037011', 'AF000037011', 'Escalera aluminio 5 peldaños'],
  ['AF000037012', 'AF000037012', 'Carretilla 65L'],
  ['AF000037013', 'AF000037013', 'Manguera jardín 15m'],
];
const SKUS_EN_MUESTRA = PRODUCTOS.slice(0, 10).map(([sku]) => sku);

@Injectable({ providedIn: 'root' })
export class SqliteDevSeederRepository implements DevSeederRepository {
  private connection = inject(SqliteConnectionService);

  /*
   * El schema v13 solo tiene UNIQUE en sod_sucursal(codigo_tienda),
   * sod_zona_tipo(nombre) y sod_producto(sku). Para el resto de tablas,
   * INSERT OR IGNORE no evita duplicados — la idempotencia se logra con
   * INSERT ... SELECT ... WHERE NOT EXISTS.
   */
  async seed(operadorId: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // 1. Sucursales (codigo_tienda es UNIQUE — OR IGNORE es suficiente)
    await db.run(`INSERT OR IGNORE INTO sod_sucursal (codigo_tienda, nombre, zona_operativa, activo) VALUES (?, ?, ?, ?)`, ['LC01', 'Sodimac Las Condes', 'RM', 1]);
    await db.run(`INSERT OR IGNORE INTO sod_sucursal (codigo_tienda, nombre, zona_operativa, activo) VALUES (?, ?, ?, ?)`, ['MP01', 'Sodimac Maipú',      'RM', 1]);

    const sucRows = await db.query(`SELECT id, codigo_tienda FROM sod_sucursal WHERE codigo_tienda IN ('LC01','MP01')`);
    const sucMap  = new Map((sucRows.values ?? []).map((r: Record<string, unknown>) => [r['codigo_tienda'] as string, r['id'] as number]));
    const lc01Id  = sucMap.get('LC01');
    const mp01Id  = sucMap.get('MP01');
    if (!lc01Id || !mp01Id) return;

    // 2. Vincular sucursales al operador (sin UNIQUE — WHERE NOT EXISTS)
    for (const sucId of [lc01Id, mp01Id]) {
      await db.run(
        `INSERT INTO sod_user_sucursal (user_id, sucursal_id)
         SELECT ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM sod_user_sucursal WHERE user_id = ? AND sucursal_id = ?)`,
        [operadorId, sucId, operadorId, sucId]
      );
    }

    // 3. Zona tipos (nombre es UNIQUE — OR IGNORE es suficiente)
    await db.run(`INSERT OR IGNORE INTO sod_zona_tipo (nombre, descripcion) VALUES (?, ?)`, ['Venta',   'Piso de venta']);
    await db.run(`INSERT OR IGNORE INTO sod_zona_tipo (nombre, descripcion) VALUES (?, ?)`, ['Altillo', 'Zona de altillo']);

    const tipoRows = await db.query(`SELECT id, nombre FROM sod_zona_tipo WHERE nombre IN ('Venta','Altillo')`);
    const tipoMap  = new Map((tipoRows.values ?? []).map((r: Record<string, unknown>) => [r['nombre'] as string, r['id'] as number]));
    const ventaId   = tipoMap.get('Venta');
    const altilloId = tipoMap.get('Altillo');
    if (!ventaId || !altilloId) return;

    // 4. Zonas (sin UNIQUE — WHERE NOT EXISTS por sucursal + codigo)
    const zonas: Array<[number, number, string, string]> = [
      [lc01Id, ventaId,   'LC01-V01', 'Venta Principal'],
      [lc01Id, altilloId, 'LC01-A01', 'Altillo Norte'],
      [mp01Id, ventaId,   'MP01-V01', 'Venta Principal'],
      [mp01Id, altilloId, 'MP01-A01', 'Altillo Sur'],
    ];
    for (const [sucId, tipoId, codigo, nombre] of zonas) {
      await db.run(
        `INSERT INTO sod_zona (sucursal_id, zona_tipo_id, codigo, nombre)
         SELECT ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM sod_zona WHERE sucursal_id = ? AND codigo = ?)`,
        [sucId, tipoId, codigo, nombre, sucId, codigo]
      );
    }

    const zonaRows = await db.query(`SELECT id, codigo FROM sod_zona WHERE codigo IN ('LC01-V01','LC01-A01','MP01-V01','MP01-A01')`);
    const zonaMap  = new Map((zonaRows.values ?? []).map((r: Record<string, unknown>) => [r['codigo'] as string, r['id'] as number]));

    // 5. Eventos — uno ABIERTO por sucursal; el vínculo con el operador vive en sod_asignacion_zona
    const hoy = new Date().toISOString().slice(0, 10);
    for (const sucId of [lc01Id, mp01Id]) {
      await db.run(
        `INSERT INTO sod_evento_inventario (sucursal_id, fecha_programada, estado)
         SELECT ?, ?, 'ABIERTO'
         WHERE NOT EXISTS (SELECT 1 FROM sod_evento_inventario WHERE sucursal_id = ? AND estado = 'ABIERTO')`,
        [sucId, hoy, sucId]
      );
    }

    const eventoRows = await db.query(
      `SELECT id, sucursal_id FROM sod_evento_inventario WHERE sucursal_id IN (?, ?) AND estado = 'ABIERTO'`,
      [lc01Id, mp01Id]
    );
    const eventos = (eventoRows.values ?? []) as Record<string, unknown>[];

    // 6. Asignaciones zona → evento → operador (sin UNIQUE — WHERE NOT EXISTS)
    for (const evento of eventos) {
      const eventoId = evento['id']          as number;
      const sucId    = evento['sucursal_id'] as number;
      const codigos  = sucId === lc01Id ? ['LC01-V01', 'LC01-A01'] : ['MP01-V01', 'MP01-A01'];
      for (const codigo of codigos) {
        const zonaId = zonaMap.get(codigo);
        if (zonaId === undefined) continue;
        await db.run(
          `INSERT INTO sod_asignacion_zona (evento_id, zona_id, operador_id)
           SELECT ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM sod_asignacion_zona WHERE evento_id = ? AND zona_id = ? AND operador_id = ?)`,
          [eventoId, zonaId, operadorId, eventoId, zonaId, operadorId]
        );
      }
    }

    // 7. Productos (sku es UNIQUE — OR IGNORE es suficiente)
    for (const [sku, codigoBarras, descripcion] of PRODUCTOS) {
      await db.run(
        `INSERT OR IGNORE INTO sod_producto (sku, codigo_barras, descripcion) VALUES (?, ?, ?)`,
        [sku, codigoBarras, descripcion]
      );
    }

    // 8. Muestra — una por evento (sin UNIQUE — WHERE NOT EXISTS por evento)
    for (const evento of eventos) {
      const eventoId = evento['id']          as number;
      const sucId    = evento['sucursal_id'] as number;
      await db.run(
        `INSERT INTO sod_muestra (evento_id, sucursal_id, nombre_archivo)
         SELECT ?, ?, 'muestra_dev.csv'
         WHERE NOT EXISTS (SELECT 1 FROM sod_muestra WHERE evento_id = ?)`,
        [eventoId, sucId, eventoId]
      );
    }

    // 9. Detalle de muestra — 10 productos por muestra (sin UNIQUE — WHERE NOT EXISTS)
    for (const evento of eventos) {
      const eventoId   = evento['id'] as number;
      const muestraRow = await db.query(`SELECT id FROM sod_muestra WHERE evento_id = ?`, [eventoId]);
      const muestraId  = (muestraRow.values?.[0] as Record<string, unknown> | undefined)?.['id'] as number | undefined;
      if (muestraId === undefined) continue;

      for (const sku of SKUS_EN_MUESTRA) {
        await db.run(
          `INSERT INTO sod_muestra_detalle (muestra_id, producto_id, stock_sistema)
           SELECT ?, p.id, 10
           FROM sod_producto p
           WHERE p.sku = ?
             AND NOT EXISTS (
               SELECT 1 FROM sod_muestra_detalle md
               WHERE md.muestra_id = ? AND md.producto_id = p.id
             )`,
          [muestraId, sku, muestraId]
        );
      }
    }

    if (isDevMode()) {
      const counts = await db.query(
        `SELECT
           (SELECT COUNT(*) FROM sod_evento_inventario) AS eventos,
           (SELECT COUNT(*) FROM sod_zona)              AS zonas,
           (SELECT COUNT(*) FROM sod_asignacion_zona)   AS asignaciones,
           (SELECT COUNT(*) FROM sod_producto)          AS productos,
           (SELECT COUNT(*) FROM sod_muestra)           AS muestras,
           (SELECT COUNT(*) FROM sod_muestra_detalle)   AS detalle`
      );
      console.log('[DevSeeder] seed completado', counts.values?.[0]);
    }
  }
}
