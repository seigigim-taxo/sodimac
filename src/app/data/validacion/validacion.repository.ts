import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import {
  JornadaValidacionParaGuardar,
  ValidacionRepository,
} from '../../domain/validacion/repositories/validacion.repository';
import {
  ValidacionBloqueAnalista,
  ValidacionTagAnalista,
  ValidacionProductoAnalista,
} from '../../domain/sincronizacion/models/preparacion.model';

@Injectable({ providedIn: 'root' })
export class SqliteValidacionRepository implements ValidacionRepository {
  private connection = inject(SqliteConnectionService);

  async reemplazarJornada(input: JornadaValidacionParaGuardar): Promise<number> {
    return this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {
      // 1. Borrar jornada previa por id_agenda si existe
      if (input.idAgenda !== null) {
        const jornadaExistente = await db.query(
          `SELECT id FROM sod_validacion_jornada WHERE id_agenda = ? LIMIT 1`,
          [input.idAgenda]
        );
        const jornadaId = jornadaExistente.values?.[0]?.['id'] as number | undefined;
        if (jornadaId !== undefined) {
          await db.run(`DELETE FROM sod_validacion_producto WHERE tag_id IN (SELECT id FROM sod_validacion_tag WHERE bloque_id IN (SELECT id FROM sod_validacion_bloque WHERE jornada_id = ?))`, [jornadaId], false);
          await db.run(`DELETE FROM sod_validacion_tag WHERE bloque_id IN (SELECT id FROM sod_validacion_bloque WHERE jornada_id = ?)`, [jornadaId], false);
          await db.run(`DELETE FROM sod_validacion_bloque WHERE jornada_id = ?`, [jornadaId], false);
          await db.run(`DELETE FROM sod_validacion_jornada WHERE id = ?`, [jornadaId], false);
        }
      }

      // 2. Insertar jornada
      await db.run(
        `INSERT INTO sod_validacion_jornada (evento_id, sucursal_id, id_agenda, numero_agenda, codigo_muestra, nombre_muestra, fecha_jornada)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.eventoId,
          input.sucursalId,
          input.idAgenda,
          input.numeroAgenda,
          input.codigoMuestra,
          input.nombreMuestra,
          input.fechaJornada,
        ],
        false
      );

      const jornadaRow = await db.query(`SELECT last_insert_rowid() AS id`);
      const jornadaId = jornadaRow.values?.[0]?.['id'] as number;

      // 3. Insertar bloques, tags y productos
      for (const bloque of input.bloques) {
        await db.run(
          `INSERT INTO sod_validacion_bloque
            (jornada_id, tipo_validacion, codigo_zona, nombre_zona, objetivo_porcentaje,
             tags_usados, tags_confirmados, tags_pendientes, porcentaje, cumple)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            jornadaId,
            bloque.tipoValidacion,
            bloque.codigoZona,
            bloque.nombreZona,
            bloque.objetivoPorcentaje,
            bloque.tagsUsados,
            bloque.tagsConfirmados,
            bloque.tagsPendientes,
            bloque.porcentaje,
            bloque.cumple ? 1 : 0,
          ],
          false
        );

        const bloqueRow = await db.query(`SELECT last_insert_rowid() AS id`);
        const bloqueId = bloqueRow.values?.[0]?.['id'] as number;

        // Tags
        for (const tag of bloque.tags) {
          await db.run(
            `INSERT INTO sod_validacion_tag
              (bloque_id, id_tag_backend, numero_tag, codigo_zona, nombre_zona,
               productos_total, productos_confirmados, estado_validacion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              bloqueId,
              tag.idTagBackend,
              tag.numeroTag,
              tag.codigoZona,
              tag.nombreZona,
              tag.productosTotal,
              tag.productosConfirmados,
              tag.estadoValidacion,
            ],
            false
          );

          const tagRow = await db.query(`SELECT last_insert_rowid() AS id`);
          const tagId = tagRow.values?.[0]?.['id'] as number;

          // Productos de este tag
          const productosDelTag = bloque.productos.filter(
            (p) => p.numeroTag === tag.numeroTag
          );
          for (const prod of productosDelTag) {
            await db.run(
              `INSERT INTO sod_validacion_producto
                (tag_id, id_tag_backend, numero_tag, id_producto_backend, sku, descripcion,
                 cantidad_inventariada, cantidad_analista, estado_validacion, fl_incorporado)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                tagId,
                prod.idTagBackend,
                prod.numeroTag,
                prod.idProductoBackend,
                prod.sku,
                prod.descripcion,
                prod.cantidadInventariada,
                prod.cantidadAnalista,
                prod.estadoValidacion,
                prod.flIncorporado,
              ],
              false
            );
          }
        }
      }

      return jornadaId;
    });
  }

  async getBloqueActivoPorTipo(tipoValidacion: string): Promise<ValidacionBloqueAnalista | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // 1. Última jornada
    const jornadaRow = await db.query(
      `SELECT id FROM sod_validacion_jornada ORDER BY fecha_registro DESC, id DESC LIMIT 1`
    );
    const jornadaId = jornadaRow.values?.[0]?.['id'] as number | undefined;
    if (jornadaId === undefined) return null;

    // 2. Bloque por tipo
    const bloqueRow = await db.query(
      `SELECT id, codigo_zona, nombre_zona, objetivo_porcentaje,
              tags_usados, tags_confirmados, tags_pendientes, porcentaje, cumple
       FROM sod_validacion_bloque
       WHERE jornada_id = ? AND tipo_validacion = ?
       LIMIT 1`,
      [jornadaId, tipoValidacion]
    );
    const bloque = bloqueRow.values?.[0] as Record<string, unknown> | undefined;
    if (!bloque) return null;

    const bloqueId = bloque['id'] as number;

    // 3. Tags
    const tagsRow = await db.query(
      `SELECT id_tag_backend, numero_tag, codigo_zona, nombre_zona,
              productos_total, productos_confirmados, estado_validacion
       FROM sod_validacion_tag
       WHERE bloque_id = ?`,
      [bloqueId]
    );
    const tags: ValidacionTagAnalista[] = (tagsRow.values ?? []).map((r: Record<string, unknown>) => ({
      idTagBackend: r['id_tag_backend'] as number | null,
      numeroTag: r['numero_tag'] as number | null,
      codigoZona: (r['codigo_zona'] as string) ?? '',
      nombreZona: (r['nombre_zona'] as string) ?? '',
      productosTotal: (r['productos_total'] as number) ?? 0,
      productosConfirmados: (r['productos_confirmados'] as number) ?? 0,
      estadoValidacion: (r['estado_validacion'] as string) === 'CONFIRMADO' ? 'CONFIRMADO' : 'PENDIENTE',
    }));

    // 4. Productos
    const productosRow = await db.query(
      `SELECT vp.id_tag_backend, vp.numero_tag, vp.id_producto_backend, vp.sku,
              vp.descripcion, vp.cantidad_inventariada, vp.cantidad_analista,
              vp.estado_validacion, vp.fl_incorporado
       FROM sod_validacion_producto vp
       INNER JOIN sod_validacion_tag vt ON vt.id = vp.tag_id
       WHERE vt.bloque_id = ?`,
      [bloqueId]
    );
    const productos: ValidacionProductoAnalista[] = (productosRow.values ?? []).map((r: Record<string, unknown>) => ({
      idTagBackend: r['id_tag_backend'] as number | null,
      numeroTag: r['numero_tag'] as number | null,
      idProductoBackend: r['id_producto_backend'] as number | null,
      sku: (r['sku'] as string) ?? '',
      descripcion: r['descripcion'] as string | null,
      cantidadInventariada: (r['cantidad_inventariada'] as number) ?? 0,
      cantidadAnalista: r['cantidad_analista'] as number | null,
      estadoValidacion: (r['estado_validacion'] as string) === 'CONFIRMADO' ? 'CONFIRMADO' : 'PENDIENTE',
      flIncorporado: (r['fl_incorporado'] as string) === 'S' ? 'S' : 'N',
    }));

    return {
      resumen: {
        codigoZona: (bloque['codigo_zona'] as string) ?? '',
        nombreZona: (bloque['nombre_zona'] as string) ?? '',
        objetivoPorcentaje: (bloque['objetivo_porcentaje'] as number) ?? 0,
        tagsUsados: (bloque['tags_usados'] as number) ?? 0,
        tagsConfirmados: (bloque['tags_confirmados'] as number) ?? 0,
        tagsPendientes: (bloque['tags_pendientes'] as number) ?? 0,
        porcentaje: (bloque['porcentaje'] as number) ?? 0,
        cumple: (bloque['cumple'] as number) === 1,
      },
      tags,
      productos,
    };
  }
}
