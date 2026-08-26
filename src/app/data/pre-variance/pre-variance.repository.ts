import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import {
  PreVarianceParaGuardar,
  PreVarianceRepository,
} from '../../domain/pre-variance/repositories/pre-variance.repository';
import {
  PreVarianceAnalista,
  PreVarianceProductoAnalista,
  PreVarianceUbicacionAnalista,
} from '../../domain/sincronizacion/models/preparacion.model';

@Injectable({ providedIn: 'root' })
export class SqlitePreVarianceRepository implements PreVarianceRepository {
  private connection = inject(SqliteConnectionService);

  async reemplazarPreVariance(input: PreVarianceParaGuardar): Promise<void> {
    return this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {
      // 1. Borrar Pre Variance previo de esta jornada
      const existente = await db.query(
        `SELECT id FROM sod_pre_variance_producto WHERE jornada_id = ? LIMIT 1`,
        [input.jornadaId]
      );
      if (existente.values && existente.values.length > 0) {
        await db.run(
          `DELETE FROM sod_pre_variance_ubicacion WHERE producto_id IN (SELECT id FROM sod_pre_variance_producto WHERE jornada_id = ?)`,
          [input.jornadaId],
          false
        );
        await db.run(
          `DELETE FROM sod_pre_variance_producto WHERE jornada_id = ?`,
          [input.jornadaId],
          false
        );
      }

      // 2. Insertar productos
      for (const prod of input.productos) {
        await db.run(
          `INSERT INTO sod_pre_variance_producto
            (jornada_id, id_producto_backend, sku, descripcion, stock_teorico, valor_unitario,
             inventariado_antes_pre_variance, fisico_vigente, diferencia_unidades,
             diferencia_en_costo, estado_pre_variance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.jornadaId,
            prod.idProductoBackend,
            prod.sku,
            prod.descripcion,
            prod.stockTeorico,
            prod.valorUnitario,
            prod.inventariadoAntesPreVariance,
            prod.fisicoVigente,
            prod.diferenciaUnidades,
            prod.diferenciaEnCosto,
            prod.estadoPreVariance,
          ],
          false
        );

        const prodRow = await db.query(`SELECT last_insert_rowid() AS id`);
        const prodId = prodRow.values?.[0]?.['id'] as number;

        // 3. Insertar ubicaciones
        for (const ubi of prod.ubicaciones) {
          await db.run(
            `INSERT INTO sod_pre_variance_ubicacion
              (producto_id, id_tag_backend, numero_tag, zona, cantidad_inventariada, cantidad_pre_variance)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              prodId,
              ubi.idTagBackend,
              ubi.numeroTag,
              ubi.zona,
              ubi.cantidadInventariada,
              ubi.cantidadPreVariance,
            ],
            false
          );
        }
      }
    });
  }

  async getPreVariance(): Promise<PreVarianceAnalista | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // 1. Obtener última jornada
    const jornadaRow = await db.query(
      `SELECT id FROM sod_validacion_jornada ORDER BY fecha_registro DESC, id DESC LIMIT 1`
    );
    const jornadaId = jornadaRow.values?.[0]?.['id'] as number | undefined;
    if (jornadaId === undefined) return null;

    // 2. Obtener productos Pre Variance
    const productosRow = await db.query(
      `SELECT id, id_producto_backend, sku, descripcion, stock_teorico, valor_unitario,
              inventariado_antes_pre_variance, fisico_vigente, diferencia_unidades,
              diferencia_en_costo, estado_pre_variance
       FROM sod_pre_variance_producto
       WHERE jornada_id = ?`,
      [jornadaId]
    );
    const productosRaw = (productosRow.values ?? []) as Record<string, unknown>[];
    if (productosRaw.length === 0) return null;

    const productos: PreVarianceProductoAnalista[] = [];

    for (const pr of productosRaw) {
      const prodId = pr['id'] as number;

      // 3. Obtener ubicaciones
      const ubiRow = await db.query(
        `SELECT id_tag_backend, numero_tag, zona, cantidad_inventariada, cantidad_pre_variance
         FROM sod_pre_variance_ubicacion
         WHERE producto_id = ?`,
        [prodId]
      );
      const ubicaciones: PreVarianceUbicacionAnalista[] = (ubiRow.values ?? []).map(
        (u: Record<string, unknown>) => ({
          idTagBackend: u['id_tag_backend'] as number | null,
          numeroTag: u['numero_tag'] as number | null,
          zona: (u['zona'] as string) ?? '',
          cantidadInventariada: (u['cantidad_inventariada'] as number) ?? 0,
          cantidadPreVariance: u['cantidad_pre_variance'] as number | null,
        })
      );

      productos.push({
        idProductoBackend: pr['id_producto_backend'] as number | null,
        sku: (pr['sku'] as string) ?? '',
        descripcion: pr['descripcion'] as string | null,
        stockTeorico: (pr['stock_teorico'] as number) ?? 0,
        valorUnitario: (pr['valor_unitario'] as number) ?? 0,
        inventariadoAntesPreVariance: (pr['inventariado_antes_pre_variance'] as number) ?? 0,
        fisicoVigente: (pr['fisico_vigente'] as number) ?? 0,
        diferenciaUnidades: (pr['diferencia_unidades'] as number) ?? 0,
        diferenciaEnCosto: (pr['diferencia_en_costo'] as number) ?? 0,
        estadoPreVariance: (pr['estado_pre_variance'] as string) === 'REVISADO' ? 'REVISADO' : 'PENDIENTE',
        ubicaciones,
      });
    }

    // 4. Construir resumen
    const skuTotal = productos.length;
    const skuPendientes = productos.filter(p => p.estadoPreVariance === 'PENDIENTE').length;
    const skuRevisados = productos.filter(p => p.estadoPreVariance === 'REVISADO').length;
    const diferenciaTotal = productos.reduce((sum, p) => sum + p.diferenciaEnCosto, 0);
    const mayor = productos.reduce(
      (max, p) => (Math.abs(p.diferenciaEnCosto) > Math.abs(max.diferenciaEnCosto) ? p : max),
      productos[0]
    );

    return {
      resumen: {
        skuTotal,
        skuPendientes,
        skuRevisados,
        diferenciaTotal,
        mayorDiferenciaValor: mayor.diferenciaEnCosto,
        mayorDiferenciaSku: mayor.sku,
        mayorDiferenciaDescripcion: mayor.descripcion,
      },
      productos,
    };
  }
}
