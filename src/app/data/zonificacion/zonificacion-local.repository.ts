import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { CatalogoZonificacion } from '../../domain/zonificacion/models/catalogo-zonificacion.model';
import { ErrorZonificacion, esCodigoErrorZonificacion } from '../../domain/zonificacion/models/error-zonificacion.model';
import { EstadoAgenda, ListaAgendas } from '../../domain/zonificacion/models/estado-agenda.model';
import { EstadoEnvio, OperacionEnCola, TipoOperacionZonificacion } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { CopiaLocal, NuevaOperacion, ZonificacionLocalRepository } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { ahoraSql } from '../../shared/utils/fecha.utils';

type Fila = Record<string, unknown>;

const COLUMNAS_COLA = `id, operacion_uid, id_agenda, numero_agenda, tipo, clave_rango, datos_json, operador_login,
  operador_rut, fecha_hora_local, estado, codigo_error, mensaje_error, error_data_json, intentos, fecha_creacion, fecha_ultimo_intento`;

@Injectable({ providedIn: 'root' })
export class SqliteZonificacionRepository implements ZonificacionLocalRepository {
  private connection = inject(SqliteConnectionService);

  private async db() {
    return this.connection.getConnection(SODIMAC_DB_NAME);
  }

  async guardarCatalogo(catalogo: CatalogoZonificacion): Promise<void> {
    const db = await this.db();
    await db.run(
      `INSERT INTO sod_zonificacion_catalogo (id, version, catalogo_json, fecha_descarga) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET version = excluded.version, catalogo_json = excluded.catalogo_json, fecha_descarga = excluded.fecha_descarga`,
      [catalogo.version, JSON.stringify(catalogo), ahoraSql()],
    );
  }

  async obtenerCatalogo(): Promise<CopiaLocal<CatalogoZonificacion> | null> {
    const fila = await this.primera('SELECT catalogo_json, fecha_descarga FROM sod_zonificacion_catalogo WHERE id = 1');
    return fila ? this.copia<CatalogoZonificacion>(fila, 'catalogo_json') : null;
  }

  async guardarListaAgendas(operadorLogin: string, lista: ListaAgendas): Promise<void> {
    const db = await this.db();
    await db.run(
      `INSERT INTO sod_zonificacion_agendas (operador_login, hoy, agendas_json, fecha_descarga) VALUES (?, ?, ?, ?)
       ON CONFLICT (operador_login) DO UPDATE SET hoy = excluded.hoy, agendas_json = excluded.agendas_json, fecha_descarga = excluded.fecha_descarga`,
      [operadorLogin, lista.hoy, JSON.stringify(lista), ahoraSql()],
    );
  }

  async obtenerListaAgendas(operadorLogin: string): Promise<CopiaLocal<ListaAgendas> | null> {
    const fila = await this.primera('SELECT agendas_json, fecha_descarga FROM sod_zonificacion_agendas WHERE operador_login = ?', [operadorLogin]);
    return fila ? this.copia<ListaAgendas>(fila, 'agendas_json') : null;
  }

  async guardarEstado(estado: EstadoAgenda): Promise<void> {
    const db = await this.db();
    await db.run(
      `INSERT INTO sod_zonificacion_estado (id_agenda, numero_agenda, estado_json, fecha_descarga) VALUES (?, ?, ?, ?)
       ON CONFLICT (id_agenda) DO UPDATE SET numero_agenda = excluded.numero_agenda, estado_json = excluded.estado_json, fecha_descarga = excluded.fecha_descarga`,
      [estado.agenda.idAgenda, estado.agenda.numeroAgenda, JSON.stringify(estado), ahoraSql()],
    );
  }

  async obtenerEstado(idAgenda: number): Promise<CopiaLocal<EstadoAgenda> | null> {
    const fila = await this.primera('SELECT estado_json, fecha_descarga FROM sod_zonificacion_estado WHERE id_agenda = ?', [idAgenda]);
    return fila ? this.copia<EstadoAgenda>(fila, 'estado_json') : null;
  }

  async encolar(op: NuevaOperacion): Promise<OperacionEnCola> {
    const db = await this.db();
    await db.run(
      `INSERT INTO sod_zonificacion_envio (
         operacion_uid, id_agenda, numero_agenda, tipo, clave_rango, datos_json,
         operador_login, operador_rut, fecha_hora_local, fecha_creacion
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [op.operacionUid, op.idAgenda, op.numeroAgenda, op.tipo, op.claveRango, JSON.stringify(op.datos), op.operadorLogin, op.operadorRut, op.fechaHoraLocal, ahoraSql()],
    );
    const fila = await this.primera(`SELECT ${COLUMNAS_COLA} FROM sod_zonificacion_envio WHERE operacion_uid = ?`, [op.operacionUid]);
    return this.operacion(fila as Fila);
  }

  async obtenerOperacion(id: number): Promise<OperacionEnCola | null> {
    const fila = await this.primera(`SELECT ${COLUMNAS_COLA} FROM sod_zonificacion_envio WHERE id = ?`, [id]);
    return fila ? this.operacion(fila) : null;
  }

  listarPendientes(idAgenda?: number): Promise<OperacionEnCola[]> {
    return this.listar('PENDIENTE', idAgenda);
  }

  listarRechazadas(idAgenda?: number): Promise<OperacionEnCola[]> {
    return this.listar('RECHAZADO', idAgenda);
  }

  contarPendientes(): Promise<number> {
    return this.contar('PENDIENTE');
  }

  contarRechazadas(): Promise<number> {
    return this.contar('RECHAZADO');
  }

  async actualizarDatos(id: number, datos: Record<string, unknown>): Promise<void> {
    const db = await this.db();
    await db.run(`UPDATE sod_zonificacion_envio SET datos_json = ? WHERE id = ? AND estado = 'PENDIENTE'`, [JSON.stringify(datos), id]);
  }

  async registrarIntentoFallido(id: number): Promise<void> {
    const db = await this.db();
    await db.run(`UPDATE sod_zonificacion_envio SET intentos = intentos + 1, fecha_ultimo_intento = ? WHERE id = ?`, [ahoraSql(), id]);
  }

  async marcarRechazada(id: number, error: ErrorZonificacion, mensaje: string | null): Promise<void> {
    const db = await this.db();
    await db.run(
      `UPDATE sod_zonificacion_envio
          SET estado = 'RECHAZADO', codigo_error = ?, mensaje_error = ?, error_data_json = ?,
              intentos = intentos + 1, fecha_ultimo_intento = ?
        WHERE id = ?`,
      [error.codigo, mensaje, JSON.stringify(error.data), ahoraSql(), id],
    );
  }

  async eliminar(id: number): Promise<void> {
    const db = await this.db();
    await db.run('DELETE FROM sod_zonificacion_envio WHERE id = ?', [id]);
  }

  private async listar(estado: EstadoEnvio, idAgenda?: number): Promise<OperacionEnCola[]> {
    const db = await this.db();
    const filtraAgenda = idAgenda !== undefined;
    const r = await db.query(
      `SELECT ${COLUMNAS_COLA} FROM sod_zonificacion_envio
        WHERE estado = ? ${filtraAgenda ? 'AND id_agenda = ?' : ''}
        ORDER BY id`,
      filtraAgenda ? [estado, idAgenda] : [estado],
    );
    return (r.values ?? []).map((f) => this.operacion(f));
  }

  private async contar(estado: EstadoEnvio): Promise<number> {
    const fila = await this.primera('SELECT COUNT(*) AS n FROM sod_zonificacion_envio WHERE estado = ?', [estado]);
    return Number(fila?.['n'] ?? 0);
  }

  private async primera(sql: string, valores: unknown[] = []): Promise<Fila | null> {
    const db = await this.db();
    const r = await db.query(sql, valores);
    return (r.values ?? [])[0] ?? null;
  }

  private copia<T>(fila: Fila, columna: string): CopiaLocal<T> {
    return { valor: JSON.parse(String(fila[columna])) as T, fechaDescarga: String(fila['fecha_descarga']) };
  }

  private operacion(f: Fila): OperacionEnCola {
    const codigo = f['codigo_error'];
    return {
      id: Number(f['id']),
      operacionUid: String(f['operacion_uid']),
      idAgenda: Number(f['id_agenda']),
      numeroAgenda: String(f['numero_agenda']),
      tipo: f['tipo'] as TipoOperacionZonificacion,
      claveRango: f['clave_rango'] === null ? null : String(f['clave_rango']),
      datos: JSON.parse(String(f['datos_json'])) as Record<string, unknown>,
      operadorLogin: String(f['operador_login']),
      operadorRut: String(f['operador_rut']),
      fechaHoraLocal: String(f['fecha_hora_local']),
      estado: f['estado'] as EstadoEnvio,
      error: esCodigoErrorZonificacion(codigo)
        ? { codigo, data: f['error_data_json'] === null ? {} : (JSON.parse(String(f['error_data_json'])) as Record<string, unknown>) }
        : null,
      mensajeError: f['mensaje_error'] === null ? null : String(f['mensaje_error']),
      intentos: Number(f['intentos']),
      fechaCreacion: String(f['fecha_creacion']),
      fechaUltimoIntento: f['fecha_ultimo_intento'] === null ? null : String(f['fecha_ultimo_intento']),
    };
  }
}
