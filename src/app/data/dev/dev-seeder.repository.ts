import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { DevSeederRepository } from '../../domain/dev/repositories/dev-seeder.repository';

@Injectable({ providedIn: 'root' })
export class SqliteDevSeederRepository implements DevSeederRepository {
  private connection = inject(SqliteConnectionService);

  async seed(operadorId: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // 1. Sucursales
    await db.run(`INSERT OR IGNORE INTO sod_sucursal (codigo_tienda, nombre, zona_operativa, activo) VALUES (?, ?, ?, ?)`, ['LC01', 'Sodimac Las Condes', 'RM', 1]);
    await db.run(`INSERT OR IGNORE INTO sod_sucursal (codigo_tienda, nombre, zona_operativa, activo) VALUES (?, ?, ?, ?)`, ['MP01', 'Sodimac Maipú',      'RM', 1]);

    const sucRows = await db.query(`SELECT id, codigo_tienda FROM sod_sucursal WHERE codigo_tienda IN ('LC01','MP01')`);
    const sucMap  = new Map((sucRows.values ?? []).map((r: Record<string, unknown>) => [r['codigo_tienda'] as string, r['id'] as number]));
    const lc01Id  = sucMap.get('LC01');
    const mp01Id  = sucMap.get('MP01');
    if (!lc01Id || !mp01Id) return;

    // 2. Vincular sucursales al operador
    await db.run(`INSERT OR IGNORE INTO sod_user_sucursal (user_id, sucursal_id) VALUES (?, ?)`, [operadorId, lc01Id]);
    await db.run(`INSERT OR IGNORE INTO sod_user_sucursal (user_id, sucursal_id) VALUES (?, ?)`, [operadorId, mp01Id]);

    // 3. Zona tipos
    await db.run(`INSERT OR IGNORE INTO sod_zona_tipo (nombre, descripcion) VALUES (?, ?)`, ['Venta',   'Piso de venta']);
    await db.run(`INSERT OR IGNORE INTO sod_zona_tipo (nombre, descripcion) VALUES (?, ?)`, ['Altillo', 'Zona de altillo']);

    const tipoRows = await db.query(`SELECT id, nombre FROM sod_zona_tipo WHERE nombre IN ('Venta','Altillo')`);
    const tipoMap  = new Map((tipoRows.values ?? []).map((r: Record<string, unknown>) => [r['nombre'] as string, r['id'] as number]));
    const ventaId   = tipoMap.get('Venta');
    const altilloId = tipoMap.get('Altillo');
    if (!ventaId || !altilloId) return;

    // 4. Zonas
    await db.run(`INSERT OR IGNORE INTO sod_zona (sucursal_id, zona_tipo_id, codigo, nombre) VALUES (?, ?, ?, ?)`, [lc01Id, ventaId,   'LC01-V01', 'Venta Principal']);
    await db.run(`INSERT OR IGNORE INTO sod_zona (sucursal_id, zona_tipo_id, codigo, nombre) VALUES (?, ?, ?, ?)`, [lc01Id, altilloId, 'LC01-A01', 'Altillo Norte']);
    await db.run(`INSERT OR IGNORE INTO sod_zona (sucursal_id, zona_tipo_id, codigo, nombre) VALUES (?, ?, ?, ?)`, [mp01Id, ventaId,   'MP01-V01', 'Venta Principal']);
    await db.run(`INSERT OR IGNORE INTO sod_zona (sucursal_id, zona_tipo_id, codigo, nombre) VALUES (?, ?, ?, ?)`, [mp01Id, altilloId, 'MP01-A01', 'Altillo Sur']);

    const zonaRows = await db.query(`SELECT id, codigo FROM sod_zona WHERE codigo IN ('LC01-V01','LC01-A01','MP01-V01','MP01-A01')`);
    const zonaMap  = new Map((zonaRows.values ?? []).map((r: Record<string, unknown>) => [r['codigo'] as string, r['id'] as number]));

    // 5. Eventos — upsert para que operador_id se actualice si cambia el operador
    const hoy = new Date().toISOString().slice(0, 10);
    await db.run(
      `INSERT INTO sod_evento_inventario (sucursal_id, operador_id, folio, fecha_programada, estado)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(folio) DO UPDATE SET operador_id = excluded.operador_id`,
      [lc01Id, operadorId, 'F-LC01-001', hoy, 'ABIERTO']
    );
    await db.run(
      `INSERT INTO sod_evento_inventario (sucursal_id, operador_id, folio, fecha_programada, estado)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(folio) DO UPDATE SET operador_id = excluded.operador_id`,
      [mp01Id, operadorId, 'F-MP01-001', hoy, 'ABIERTO']
    );

    // 6. Asignaciones zona → evento
    const eventoRows = await db.query(`SELECT id, sucursal_id FROM sod_evento_inventario WHERE folio IN ('F-LC01-001','F-MP01-001')`);
    for (const evento of (eventoRows.values ?? []) as Record<string, unknown>[]) {
      const eventoId = evento['id']         as number;
      const sucId    = evento['sucursal_id'] as number;
      const codigos  = sucId === lc01Id ? ['LC01-V01', 'LC01-A01'] : ['MP01-V01', 'MP01-A01'];
      for (const codigo of codigos) {
        const zonaId = zonaMap.get(codigo);
        if (zonaId !== undefined) {
          await db.run(`INSERT OR IGNORE INTO sod_asignacion_zona (evento_id, zona_id, operador_id) VALUES (?, ?, ?)`, [eventoId, zonaId, operadorId]);
        }
      }
    }
  }
}
