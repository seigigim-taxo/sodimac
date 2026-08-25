import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { AsignacionApiRepository } from '../../domain/asignacion/repositories/asignacion-api.repository';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';
import { hoySql } from '../../shared/utils/fecha.utils';

const TAG = '[AsignacionSimulada]';

/* Los conteos simulados se numeran desde el segundo: el primero es el real. */
const PREFIJO_CONTEO_PRUEBA = 'Conteo de prueba';

/*
 * TEMPORAL — sustituye al endpoint de asignación mientras el SGO no lo expone.
 *
 * Sirve para maquetar y probar en terreno: el operador termina un conteo y
 * puede empezar otro sin esperar a que le asignen trabajo nuevo.
 *
 * Prioriza lo real: si la tienda tiene otro evento ABIERTO —porque la
 * preparación lo trajo—, se asigna ese. Solo cuando no hay ninguno se clona el
 * conteo recién terminado.
 *
 * Clonar es copiar la muestra a un evento nuevo. No se borra ni se reinicia
 * nada: el conteo anterior queda íntegro con su historial. Tampoco se duplican
 * productos, zonas ni ubicaciones, que ya están en la base y se reutilizan.
 *
 * PARA RETIRARLO: borrar este archivo y devolver el provider de
 * ASIGNACION_API_REPOSITORY_TOKEN en main.ts a la implementación HTTP real.
 */
@Injectable({ providedIn: 'root' })
export class AsignacionSimuladaRepository implements AsignacionApiRepository {
  private connection = inject(SqliteConnectionService);
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  async consultarNuevaAsignacion(
    sucursalId: number,
    eventoFinalizadoId: number | null,
  ): Promise<AsignacionConteo | null> {
    const eventos = await this.eventoRepo.getBySucursal(sucursalId);

    const real = eventos.find((e) => e.estado === 'ABIERTO' && e.id !== eventoFinalizadoId);
    if (real) {
      if (isDevMode()) console.log(`${TAG} asigna el evento abierto ${real.id}`);
      return this.aAsignacion(real);
    }

    // Sin conteo terminado no hay muestra que copiar.
    if (!eventoFinalizadoId) return null;

    return this.clonarConteo(sucursalId, eventoFinalizadoId, eventos);
  }

  private aAsignacion(evento: Evento): AsignacionConteo {
    return {
      eventoId:        evento.id,
      nombre:          evento.nombre,
      fechaProgramada: evento.fechaProgramada,
    };
  }

  /*
   * Todo en una transacción: un evento sin su muestra sería un conteo
   * imposible de empezar, y el operador no tendría cómo salir de ahí.
   */
  private async clonarConteo(
    sucursalId: number,
    eventoOrigenId: number,
    eventos: Evento[],
  ): Promise<AsignacionConteo | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    /*
     * Se copia la muestra de la iteración 1: es la del conteo completo. Las
     * posteriores son recortes de reconteo y no sirven para empezar de nuevo.
     */
    const origen = await db.query(
      `SELECT id, nombre, nombre_archivo, codigo_muestra, id_agenda, numero_agenda
       FROM sod_muestra
       WHERE evento_id = ? AND iteracion = 1
       LIMIT 1`,
      [eventoOrigenId]
    );
    const muestra = origen.values?.[0] as Record<string, unknown> | undefined;
    if (!muestra) {
      if (isDevMode()) console.log(`${TAG} el evento ${eventoOrigenId} no tiene muestra que copiar`);
      return null;
    }

    const numero = eventos.filter((e) => e.nombre.startsWith(PREFIJO_CONTEO_PRUEBA)).length + 2;
    const nombre = `${PREFIJO_CONTEO_PRUEBA} ${numero}`;
    // Fecha de hoy: un evento con fecha anterior no se puede seleccionar en Home.
    const fechaProgramada = hoySql();

    const eventoNuevoId = await this.connection.enTransaccion(SODIMAC_DB_NAME, async (tx) => {
      const evento = await tx.run(
        `INSERT INTO sod_evento_inventario (sucursal_id, nombre, fecha_programada, estado)
         VALUES (?, ?, ?, 'ABIERTO')`,
        [sucursalId, nombre, fechaProgramada],
        false,
      );
      const eventoId = evento.changes?.lastId;
      if (!eventoId) throw new Error('No se pudo crear el evento del conteo simulado');

      /*
       * codigo_muestra, id_agenda y numero_agenda se copian tal cual: son la
       * identidad con la que el TAG finalizado viaja al SP, y sin ellos el
       * conteo simulado no se podría sincronizar.
       */
      const muestraNueva = await tx.run(
        `INSERT INTO sod_muestra
           (evento_id, sucursal_id, iteracion, estado, nombre, nombre_archivo, codigo_muestra, id_agenda, numero_agenda)
         VALUES (?, ?, 1, 'ACTIVA', ?, ?, ?, ?, ?)`,
        [
          eventoId,
          sucursalId,
          muestra['nombre'] ?? null,
          muestra['nombre_archivo'] ?? null,
          muestra['codigo_muestra'] ?? null,
          muestra['id_agenda'] ?? null,
          muestra['numero_agenda'] ?? null,
        ],
        false,
      );
      const muestraNuevaId = muestraNueva.changes?.lastId;
      if (!muestraNuevaId) throw new Error('No se pudo crear la muestra del conteo simulado');

      // Copia en bloque: las líneas pueden ser miles y no hay razón para ir una a una.
      await tx.run(
        `INSERT INTO sod_muestra_detalle (muestra_id, producto_id, stock_sistema, ubicacion_esperada)
         SELECT ?, producto_id, stock_sistema, ubicacion_esperada
         FROM sod_muestra_detalle
         WHERE muestra_id = ?`,
        [muestraNuevaId, muestra['id']],
        false,
      );

      return eventoId;
    });

    if (isDevMode()) console.log(`${TAG} clonó el evento ${eventoOrigenId} en ${eventoNuevoId} — "${nombre}"`);

    return { eventoId: eventoNuevoId, nombre, fechaProgramada };
  }
}
