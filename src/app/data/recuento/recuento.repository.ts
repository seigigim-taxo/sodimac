import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import {
  RecuentoParaGuardar,
  RecuentoRepository,
} from '../../domain/recuento/repositories/recuento.repository';
import {
  RecuentoAnalista,
  RecuentoProductoAnalista,
  RecuentoUbicacionAnalista,
} from '../../domain/sincronizacion/models/preparacion.model';

@Injectable({ providedIn: 'root' })
export class SqliteRecuentoRepository implements RecuentoRepository {
  private connection = inject(SqliteConnectionService);

  async reemplazarRecuento(input: RecuentoParaGuardar): Promise<void> {
    return this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {
      // 1. Borrar Recuento previo de esta jornada
      const existente = await db.query(
        `SELECT id FROM sod_recuento_producto WHERE jornada_id = ? LIMIT 1`,
        [input.jornadaId]
      );
      if (existente.values && existente.values.length > 0) {
        await db.run(
          `DELETE FROM sod_recuento_ubicacion WHERE producto_id IN (SELECT id FROM sod_recuento_producto WHERE jornada_id = ?)`,
          [input.jornadaId],
          false
        );
        await db.run(
          `DELETE FROM sod_recuento_producto WHERE jornada_id = ?`,
          [input.jornadaId],
          false
        );
      }

      // 2. Insertar productos
      for (const prod of input.productos) {
        await db.run(
          `INSERT INTO sod_recuento_producto
            (jornada_id, id_producto_backend, sku, descripcion, stock_teorico, valor_unitario,
             fisico_actual, diferencia_unidades, diferencia_en_costo, es_pre_variance, estado_recuento)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.jornadaId,
            prod.idProductoBackend,
            prod.sku,
            prod.descripcion,
            prod.stockTeorico,
            prod.valorUnitario,
            prod.fisicoActual,
            prod.diferenciaUnidades,
            prod.diferenciaEnCosto,
            prod.esPreVariance ? 1 : 0,
            prod.estadoRecuento,
          ],
          false
        );

        const prodRow = await db.query(`SELECT last_insert_rowid() AS id`);
        const prodId = prodRow.values?.[0]?.['id'] as number;

        // 3. Insertar ubicaciones
        for (const ubi of prod.ubicaciones) {
          await db.run(
            `INSERT INTO sod_recuento_ubicacion
              (producto_id, id_tag_backend, numero_tag, zona, cantidad_inventariada, cantidad_recuento)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              prodId,
              ubi.idTagBackend,
              ubi.numeroTag,
              ubi.zona,
              ubi.cantidadInventariada,
              ubi.cantidadRecuento,
            ],
            false
          );
        }
      }
    });
  }

  async getRecuento(): Promise<RecuentoAnalista | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // 1. Obtener última jornada
    const jornadaRow = await db.query(
      `SELECT id FROM sod_validacion_jornada ORDER BY fecha_registro DESC, id DESC LIMIT 1`
    );
    const jornadaId = jornadaRow.values?.[0]?.['id'] as number | undefined;
    if (jornadaId === undefined) return null;

    // 2. Obtener productos Recuento
    const productosRow = await db.query(
      `SELECT id, id_producto_backend, sku, descripcion, stock_teorico, valor_unitario,
              fisico_actual, diferencia_unidades, diferencia_en_costo, es_pre_variance, estado_recuento
       FROM sod_recuento_producto
       WHERE jornada_id = ?`,
      [jornadaId]
    );
    const productosRaw = (productosRow.values ?? []) as Record<string, unknown>[];
    if (productosRaw.length === 0) return null;

    const productos: RecuentoProductoAnalista[] = [];

    for (const pr of productosRaw) {
      const prodId = pr['id'] as number;

      const ubiRow = await db.query(
        `SELECT id_tag_backend, numero_tag, zona, cantidad_inventariada, cantidad_recuento
         FROM sod_recuento_ubicacion
         WHERE producto_id = ?`,
        [prodId]
      );
      const ubicaciones: RecuentoUbicacionAnalista[] = (ubiRow.values ?? []).map(
        (u: Record<string, unknown>) => ({
          idTagBackend: u['id_tag_backend'] as number | null,
          numeroTag: u['numero_tag'] as number | null,
          zona: (u['zona'] as string) ?? '',
          cantidadInventariada: (u['cantidad_inventariada'] as number) ?? 0,
          cantidadRecuento: u['cantidad_recuento'] as number | null,
        })
      );

      productos.push({
        idProductoBackend: pr['id_producto_backend'] as number | null,
        sku: (pr['sku'] as string) ?? '',
        descripcion: pr['descripcion'] as string | null,
        stockTeorico: (pr['stock_teorico'] as number) ?? 0,
        valorUnitario: (pr['valor_unitario'] as number) ?? 0,
        fisicoActual: (pr['fisico_actual'] as number) ?? 0,
        diferenciaUnidades: (pr['diferencia_unidades'] as number) ?? 0,
        diferenciaEnCosto: (pr['diferencia_en_costo'] as number) ?? 0,
        esPreVariance: (pr['es_pre_variance'] as number) === 1,
        estadoRecuento: (pr['estado_recuento'] as string) === 'RECONTADO' ? 'RECONTADO' : 'PENDIENTE',
        ubicaciones,
      });
    }

    // 3. Resumen
    const skuTotal = productos.length;
    const skuPendientes = productos.filter(p => p.estadoRecuento === 'PENDIENTE').length;
    const skuRecontados = productos.filter(p => p.estadoRecuento === 'RECONTADO').length;
    const diferenciaTotal = productos.reduce((sum, p) => sum + p.diferenciaEnCosto, 0);
    const mayor = productos.reduce(
      (max, p) => (Math.abs(p.diferenciaEnCosto) > Math.abs(max.diferenciaEnCosto) ? p : max),
      productos[0]
    );

    return {
      resumen: {
        skuTotal,
        skuPendientes,
        skuRecontados,
        diferenciaTotal,
        mayorDiferenciaValor: mayor.diferenciaEnCosto,
        mayorDiferenciaSku: mayor.sku,
        mayorDiferenciaDescripcion: mayor.descripcion,
      },
      productos,
    };
  }
}
