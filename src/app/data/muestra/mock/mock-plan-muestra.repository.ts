import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../../core/database/sodimac.schema';
import { PlanMuestraRepository } from '../../../domain/muestra/repositories/plan-muestra.repository';
import { AnalisisIteracion } from '../../../domain/muestra/models/analisis-iteracion.model';
import { LineaMuestraParaGuardar } from '../../../domain/muestra/repositories/muestra-detalle.repository';
import { SKUS_NUEVOS_POR_ITERACION } from './analisis-sgo.mock-data';

/* Lo contado en una ronda, cruzado contra lo que la muestra esperaba. */
interface FilaContada {
  sku: string;
  codigoBarras: string | null;
  descripcion: string | null;
  stockSistema: number;
  contado: number;
}

/*
 * SIMULACIÓN del análisis del SGO. Reemplaza al endpoint que todavía no existe.
 *
 * Consulta SQLite directo en vez de pasar por los repositorios: está haciendo de
 * backend, y un backend ve toda la base de una vez. Pedirle a los repositorios
 * de dominio que expongan consultas que solo este mock necesita ensuciaría el
 * dominio con una dependencia de algo que va a desaparecer.
 *
 * Criterio de qué recontar: los SKUs cuya cantidad contada no coincide con el
 * stock del sistema, más los SKUs nuevos del dataset fijo. NO es el criterio
 * real —ese lo define el SGO—; es uno determinista que produce una muestra
 * acotada creíble y repetible.
 */
@Injectable({ providedIn: 'root' })
export class MockPlanMuestraRepository implements PlanMuestraRepository {
  private connection = inject(SqliteConnectionService);

  async obtenerAnalisis(eventoId: number, iteracionActual: number): Promise<AnalisisIteracion | null> {
    const siguiente = iteracionActual + 1;

    const diferencias = await this.skusConDiferencia(eventoId);
    const nuevos      = SKUS_NUEVOS_POR_ITERACION[siguiente] ?? [];

    /*
     * Nada que recontar y nada que agregar = el SGO da por terminado el ciclo.
     * Es la rama que hace alcanzable el fin del flujo; sin ella el reconteo
     * sería un bucle infinito.
     */
    if (diferencias.length === 0 && nuevos.length === 0) {
      return null;
    }

    const skusARecontar: LineaMuestraParaGuardar[] = [
      ...diferencias.map((f) => ({
        sku:          f.sku,
        codigoBarras: f.codigoBarras,
        descripcion:  f.descripcion,
        stockSistema: f.stockSistema,
      })),
      ...nuevos,
    ].map((linea, i) => ({ ...linea, idMuestraDet: i + 1 }));

    const fechaProgramada = await this.fechaDelEvento(eventoId);

    return {
      iteracion:     siguiente,
      fechaProgramada,
      estado:        'RECONTEO',
      codigoMuestra: `MOCK-E${eventoId}-IT${siguiente}`,
      nombreMuestra: `Reconteo iteración ${siguiente}`,
      skusARecontar,
    };
  }

  /*
   * Lo contado en el evento contra lo que su muestra esperaba. El LEFT JOIN
   * sobre la muestra es a propósito: un SKU contado que no está en la muestra
   * —no debería pasar, la pantalla los rechaza— igual aparece, con stock 0, y
   * por lo tanto como diferencia.
   *
   * Trae codigo_barras y descripcion desde sod_producto para devolverlos tal
   * cual: al materializar la muestra, reemplazarDetalles reescribe esas columnas
   * con lo que reciba, y mandarlas en null borraría datos ya cargados.
   */
  private async skusConDiferencia(eventoId: number): Promise<FilaContada[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT p.sku                                  AS sku,
              p.codigo_barras                        AS codigo_barras,
              p.descripcion                          AS descripcion,
              COALESCE(md.stock_sistema, 0)          AS stock_sistema,
              COALESCE(SUM(d.cantidad_fisica), 0)    AS contado
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c ON c.id = d.conteo_id
       JOIN sod_producto p ON p.id = d.producto_id
       LEFT JOIN sod_muestra         m  ON m.evento_id  = c.evento_id
       LEFT JOIN sod_muestra_detalle md ON md.muestra_id = m.id
                                       AND md.producto_id = p.id
       WHERE c.evento_id = ?
       GROUP BY p.id
       ORDER BY p.sku`,
      [eventoId]
    );

    return (result.values ?? [])
      .map((row: Record<string, unknown>) => ({
        sku:          row['sku']            as string,
        codigoBarras: row['codigo_barras']  as string | null,
        descripcion:  row['descripcion']    as string | null,
        stockSistema: row['stock_sistema']  as number,
        contado:      row['contado']        as number,
      }))
      .filter((f) => f.contado !== f.stockSistema);
  }

  /*
   * El evento nuevo hereda la fecha del anterior: en terreno un reconteo ocurre
   * el mismo día. Es justamente el caso que hace necesario crearEvento en vez de
   * asegurarEvento, que con la fecha repetida devolvería el evento viejo.
   */
  private async fechaDelEvento(eventoId: number): Promise<string> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT fecha_programada FROM sod_evento_inventario WHERE id = ?`,
      [eventoId]
    );
    const fecha = result.values?.[0]?.['fecha_programada'] as string | undefined;
    return fecha ?? new Date().toISOString().slice(0, 10);
  }
}
