import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { PlanMuestraRepository } from '../../domain/muestra/repositories/plan-muestra.repository';
import { MUESTRA_REPOSITORY_TOKEN, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN, MuestraDetalleRepository, LineaMuestraParaGuardar } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';

/*
 * Implementación local de PlanMuestraRepository para Fase 7.
 *
 * La muestra de reconteo se genera a partir de los SKUs ya contados en la
 * iteración anterior: toma los primeros 2 SKUs distintos (ordenados por
 * primera fecha de conteo) y los materializa en sod_muestra + sod_muestra_detalle
 * para la iteración nueva.
 */
@Injectable({ providedIn: 'root' })
export class SqlitePlanMuestraRepository implements PlanMuestraRepository {
  private connection = inject(SqliteConnectionService);
  private muestraRepo    = inject(MUESTRA_REPOSITORY_TOKEN);
  private detalleRepo    = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);
  private eventoRepo     = inject(EVENTO_REPOSITORY_TOKEN);

  async prepararMuestraDeIteracion(eventoId: number, iteracion: number): Promise<number | null> {
    const existente = await this.muestraRepo.getByEventoIteracion(eventoId, iteracion);
    if (existente) return existente.id;

    const iteracionAnterior = iteracion - 1;

    const skus = await this.getPrimerosSKUsContados(eventoId, iteracionAnterior);
    if (skus.length === 0) return null;

    const evento = await this.eventoRepo.getById(eventoId);
    if (!evento) return null;

    const muestraId = await this.muestraRepo.asegurarMuestra({
      codigoMuestra: `RECONTEO-${eventoId}-ITER${iteracion}`,
      eventoId,
      sucursalId: evento.sucursalId,
      nombre: `Reconteo iteración ${iteracion}`,
      iteracion,
      estado: 'ACTIVA',
    });

    const lineas = await this.buildLineas(muestraId, skus, eventoId, iteracionAnterior);
    await this.detalleRepo.reemplazarDetalles(muestraId, lineas);

    return muestraId;
  }

  private async getPrimerosSKUsContados(
    eventoId: number,
    iteracionAnterior: number
  ): Promise<string[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT DISTINCT p.sku
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c ON c.id = d.conteo_id
       JOIN sod_producto p ON p.id = d.producto_id
       WHERE c.evento_id = ? AND c.iteracion = ?
       ORDER BY MIN(d.fecha_hora) ASC
       LIMIT 2`,
      [eventoId, iteracionAnterior]
    );
    return (result.values ?? [])
      .map((r) => (r as Record<string, unknown>)['sku'] as string)
      .filter((sku): sku is string => !!sku);
  }

  private async buildLineas(
    muestraId: number,
    skus: string[],
    eventoId: number,
    iteracionAnterior: number
  ): Promise<LineaMuestraParaGuardar[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const lineas: LineaMuestraParaGuardar[] = [];

    for (const sku of skus) {
      const prodRow = await db.query(
        `SELECT id, sku, codigo_barras, descripcion FROM sod_producto WHERE sku = ?`,
        [sku]
      );
      const prod = prodRow.values?.[0] as Record<string, unknown> | undefined;
      if (!prod) continue;

      const stock = await this.getStockSistemaAnterior(
        eventoId, iteracionAnterior, prod['id'] as number
      );

      lineas.push({
        idMuestraDet: 0,
        sku: prod['sku'] as string,
        codigoBarras: prod['codigo_barras'] as string | null,
        descripcion:  prod['descripcion']  as string | null,
        stockSistema: stock,
      });
    }

    return lineas;
  }

  private async getStockSistemaAnterior(
    eventoId: number,
    iteracionAnterior: number,
    productoId: number
  ): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT md.stock_sistema
       FROM sod_muestra_detalle md
       JOIN sod_muestra m ON m.id = md.muestra_id
       WHERE m.evento_id = ? AND m.iteracion = ? AND md.producto_id = ?
       LIMIT 1`,
      [eventoId, iteracionAnterior, productoId]
    );
    return (result.values?.[0] as Record<string, unknown>)?.['stock_sistema'] as number ?? 0;
  }
}
