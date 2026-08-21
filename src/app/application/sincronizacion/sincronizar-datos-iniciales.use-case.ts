import { Injectable, inject, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PREPARACION_API_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/preparacion-api.repository';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoParaGuardar } from '../../domain/evento/repositories/evento.repository';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { ZONA_REPOSITORY_TOKEN } from '../../domain/zona/repositories/zona.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME, SODIMAC_TABLE_NAMES } from '../../core/database/sodimac.schema';
import { DatosAnalista, DatosPreparacion, EtapaSincronizacion, UsuarioPreparado } from '../../domain/sincronizacion/models/preparacion.model';
import { Evento } from '../../domain/evento/models/evento.model';

type EstadoEvento = Evento['estado'];
import { Session } from '../../domain/auth/models/session.model';
import { partirRut } from '../../domain/auth/utils/rut.utils';

/*
 * Sincronización inicial: descarga los datos del backend y los escribe en
 * SQLite. Las dos etapas van en el mismo caso de uso a propósito — una descarga
 * que no llegó a persistirse no sirve de nada, así que "terminó" significa
 * tablas escritas, no respuesta recibida.
 *
 * `onEtapa` deja que la UI muestre en qué va sin que este caso de uso sepa nada
 * de barras ni porcentajes.
 */
@Injectable({ providedIn: 'root' })
export class SincronizarDatosInicialesUseCase {
  private preparacionApi = inject(PREPARACION_API_REPOSITORY_TOKEN);
  private operadorRepo = inject(OPERADOR_REPOSITORY_TOKEN);
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);
  private muestraDetalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);
  private zonaRepo = inject(ZONA_REPOSITORY_TOKEN);
  private sqlite = inject(SqliteConnectionService);

  async execute(
    session: Session,
    onEtapa?: (etapa: EtapaSincronizacion) => void
  ): Promise<{ usuario: UsuarioPreparado; analista: DatosAnalista | null }> {
    console.time('[Sync] TOTAL');

    console.time('[Sync] 1. fetch+parse preparacion.php');
    onEtapa?.('DESCARGANDO');
    const datos = await this.preparacionApi.preparar({
      correo: session.correo,
      rut: session.rutNormalizado,
    });
    console.timeEnd('[Sync] 1. fetch+parse preparacion.php');
    console.log('[Sync] productos:', datos.muestra?.detalles?.length ?? 0,
      '| codigos totales:', datos.muestra?.detalles?.reduce((acc, d) => acc + d.codigos.length, 0) ?? 0);

    onEtapa?.('GUARDANDO');
    const usuario = datos.usuario;
    const { rut, rutDv } = partirRut(usuario.rutNormalizado);

    console.time('[Sync] 2. guardar perfil operador');
    await this.operadorRepo.guardarPerfil({
      cargo: usuario.cargo,
      rut,
      rutDv,
      nombres: usuario.nombres,
      apellidoPaterno: usuario.apellidoPaterno,
      apellidoMaterno: usuario.apellidoMaterno,
      correo: usuario.login,
    });
    console.timeEnd('[Sync] 2. guardar perfil operador');

    console.time('[Sync] 3. guardar sucursales');
    await this.sucursalRepo.guardarDeUsuario(
      session.operadorId,
      datos.tiendas.map((t) => ({
        codigoTienda: t.codigoTienda,
        nombre: t.nombreTienda,
        zonaOperativa: t.zonaOperativa,
      }))
    );
    console.timeEnd('[Sync] 3. guardar sucursales');

    console.time('[Sync] 4. guardar evento + muestra + detalle');
    await this.guardarEventoYMuestra(datos);
    console.timeEnd('[Sync] 4. guardar evento + muestra + detalle');

    console.time('[Sync] 5. guardar zonas');
    await this.guardarZonas(datos);
    console.timeEnd('[Sync] 5. guardar zonas');

    await this.logDatabase();

    console.timeEnd('[Sync] TOTAL');
    onEtapa?.('LISTO');
    return { usuario, analista: datos.analista };
  }

  /*
   * La cadena es sucursal → evento → muestra, y cada eslabón es FK del
   * siguiente. Si falta alguno de los datos, se corta sin escribir nada: es
   * preferible una tienda sin evento a un evento con fecha inventada.
   */
  /*
   * Qué evento local le corresponde a esta preparación.
   *
   * La identidad es la MUESTRA, no el día: una tienda puede tener varias
   * asignaciones el mismo día y cada operador recibe la suya. Identificando el
   * evento por (sucursal, fecha) —como se hacía antes— la asignación del
   * segundo operador caía sobre el evento del primero: no veía evento para
   * contar, porque el del otro ya estaba EN_ANALISIS, y su muestra sobrescribía
   * la anterior vía el ON CONFLICT de asegurarMuestra.
   *
   * El backend no manda id de evento, así que la identidad se toma del código
   * de muestra, que ya queda guardado en sod_muestra junto a su evento_id. Por
   * eso no hace falta ninguna columna nueva.
   *
   * Sin muestra en la preparación no hay identidad que usar y se conserva el
   * comportamiento anterior.
   */
  private async resolverEvento(
    datos: DatosPreparacion, sucursalId: number, evento: EventoParaGuardar
  ): Promise<number> {
    const codigoMuestra = datos.muestra?.codigoMuestra;
    if (!codigoMuestra) {
      return this.eventoRepo.asegurarEvento(evento);
    }

    const existente = await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalId);
    if (existente !== null) {
      // Misma asignación que ya se había descargado: se reusa, no se duplica.
      return existente;
    }

    return this.eventoRepo.crearEvento(evento);
  }

  private async guardarEventoYMuestra(datos: DatosPreparacion): Promise<void> {
    const tienda = datos.tiendas[0];
    const evento = datos.evento;
    if (!tienda || !evento?.fechaProgramada) return;

    const sucursalId = await this.sucursalRepo.getIdPorCodigo(tienda.codigoTienda);
    if (sucursalId === null) return;

    console.time('[Sync] 4a. resolver evento');
    const eventoId = await this.resolverEvento(datos, sucursalId, {
      sucursalId,
      fechaProgramada: evento.fechaProgramada,
      estado: evento.estado as EstadoEvento,
      nombre: datos.muestra?.nombreMuestra ?? '',
    });
    console.timeEnd('[Sync] 4a. resolver evento');

    console.log('[Sync] Evento ID:', eventoId);
    console.log('[Sync] Detalles a guardar:', datos.muestra?.detalles?.length ?? 0);

    if (!datos.muestra) return;

    console.time('[Sync] 4b. asegurar muestra');
    const muestraId = await this.muestraRepo.asegurarMuestra({
      codigoMuestra: datos.muestra.codigoMuestra,
      eventoId,
      sucursalId,
      nombre: datos.muestra.nombreMuestra,
      iteracion: 1,
      estado: 'ACTIVA',
      idAgenda: datos.muestra.idAgenda,
      numeroAgenda: datos.muestra.numeroAgenda,
    });
    console.timeEnd('[Sync] 4b. asegurar muestra');

    console.log('[Sync] Muestra ID:', muestraId);
    console.log('[Sync] Detalles a guardar:', datos.muestra.detalles.length);

    console.time('[Sync] 4c. reemplazarDetalles (productos+codigos+detalle)');
    await this.muestraDetalleRepo.reemplazarDetalles(muestraId, datos.muestra.detalles);
    console.timeEnd('[Sync] 4c. reemplazarDetalles (productos+codigos+detalle)');

    console.log('[Sync] Detalles guardados exitosamente');
  }

  /*
   * Las zonas vienen como tuplas [codigo, descripcion]. El codigo es el nombre
   * de zona (VENTA, BODEGA, etc.) y la descripcion es su etiqueta para el
   * operador. Se crea la zona ligada a la sucursal.
   */
  private async guardarZonas(datos: DatosPreparacion): Promise<void> {
    const tienda = datos.tiendas[0];
    if (!tienda) return;

    const sucursalId = await this.sucursalRepo.getIdPorCodigo(tienda.codigoTienda);
    if (sucursalId === null) return;

    const zonasParaGuardar = datos.zonas.map(z => ({
      nombre: z.codigo,
      descripcion: z.descripcion,
      tagDesde: z.tagDesde,
      tagHasta: z.tagHasta,
    }));

    await this.zonaRepo.reemplazarDeSucursal(sucursalId, zonasParaGuardar);
  }

  private async logDatabase(): Promise<void> {
    if (!isDevMode() || !this.sqlite.isSupported || Capacitor.isNativePlatform()) return;

    console.log('[DB] === Inicio log completo de base de datos ===');
    try {
      const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
      for (const tabla of SODIMAC_TABLE_NAMES) {
        try {
          const result = await db.query(`SELECT * FROM ${tabla}`);
          const rows = result.values ?? [];
          console.group(`[DB] ${tabla} (${rows.length} filas)`);
          if (rows.length > 0) {
            console.table(rows);
          } else {
            console.log('(vacía)');
          }
          console.groupEnd();
        } catch (err) {
          console.error(`[DB] Error al leer ${tabla}:`, err);
        }
      }
    } catch (err) {
      console.error('[DB] Error al abrir conexión para log:', err);
    }
    console.log('[DB] === Fin log completo de base de datos ===');
  }
}
