import { Injectable, inject, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PREPARACION_API_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/preparacion-api.repository';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoParaGuardar } from '../../domain/evento/repositories/evento.repository';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { ZONA_REPOSITORY_TOKEN } from '../../domain/zona/repositories/zona.repository';
import { VALIDACION_REPOSITORY_TOKEN } from '../../domain/validacion/repositories/validacion.repository';
import { PRE_VARIANCE_REPOSITORY_TOKEN } from '../../domain/pre-variance/repositories/pre-variance.repository';
import { RECUENTO_REPOSITORY_TOKEN } from '../../domain/recuento/repositories/recuento.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME, SODIMAC_TABLE_NAMES } from '../../core/database/sodimac.schema';
import { DatosAnalista, DatosPreparacion, EtapaSincronizacion, PreVarianceAnalista, RecuentoAnalista, UsuarioPreparado, ValidacionBloqueAnalista } from '../../domain/sincronizacion/models/preparacion.model';
import { Evento } from '../../domain/evento/models/evento.model';

type EstadoEvento = Evento['estado'];
import { Session } from '../../domain/auth/models/session.model';
import { CLAVE_ULTIMA_PREPARACION, META_REPOSITORY_TOKEN } from '../../domain/meta/repositories/meta.repository';
import { hoySql } from '../../shared/utils/fecha.utils';
import {
  JornadaValidacionParaGuardar,
  BloqueValidacionParaGuardar,
} from '../../domain/validacion/repositories/validacion.repository';
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
  private validacionRepo = inject(VALIDACION_REPOSITORY_TOKEN);
  private preVarianceRepo = inject(PRE_VARIANCE_REPOSITORY_TOKEN);
  private recuentoRepo = inject(RECUENTO_REPOSITORY_TOKEN);
  private sqlite = inject(SqliteConnectionService);
  private metaRepo = inject(META_REPOSITORY_TOKEN);

  async execute(
    session: Session,
    onEtapa?: (etapa: EtapaSincronizacion) => void
  ): Promise<{ usuario: UsuarioPreparado; analista: DatosAnalista | null }> {
    onEtapa?.('DESCARGANDO');
    const datos = await this.descargar(session);

    return this.persistir(session, datos, onEtapa);
  }

  /*
   * La descarga, sola.
   *
   * Se expone aparte porque BuscarNuevoConteoUseCase necesita mirar la
   * respuesta —comparar la agenda— ANTES de decidir si vale la pena escribir
   * nada. Si tuviera que llamar a execute(), la preparación se bajaría dos
   * veces sólo para averiguar que no había trabajo nuevo.
   */
  async descargar(session: Session): Promise<DatosPreparacion> {
    return this.preparacionApi.preparar({
      correo: session.correo,
      rut: session.rutNormalizado,
    });
  }

  /*
   * La escritura, sola. Recibe datos ya descargados.
   *
   * Que "terminó" signifique tablas escritas y no respuesta recibida sigue
   * valiendo: es este método el que decide que la preparación fue exitosa.
   */
  async persistir(
    session: Session,
    datos: DatosPreparacion,
    onEtapa?: (etapa: EtapaSincronizacion) => void
  ): Promise<{ usuario: UsuarioPreparado; analista: DatosAnalista | null }> {
    onEtapa?.('GUARDANDO');
    const usuario = datos.usuario;
    const { rut, rutDv } = partirRut(usuario.rutNormalizado);

    await this.operadorRepo.guardarPerfil({
      cargo: usuario.cargo,
      rut,
      rutDv,
      nombres: usuario.nombres,
      apellidoPaterno: usuario.apellidoPaterno,
      apellidoMaterno: usuario.apellidoMaterno,
      correo: usuario.login,
      tipoUsuario: usuario.tipoUsuario,
    });

    await this.sucursalRepo.guardarDeUsuario(
      session.operadorId,
      datos.tiendas.map((t) => ({
        codigoTienda: t.codigoTienda,
        nombre: t.nombreTienda,
        zonaOperativa: t.zonaOperativa,
      }))
    );

    if (usuario.tipoUsuario === 'ANALISTA_CLIENTE' && datos.analista) {
      await this.guardarFlujoAnalista(datos, session.operadorId);
    } else {
      await this.guardarEventoYMuestra(datos);
    }

    await this.guardarZonas(datos);
    await this.logDatabase();

    /*
     * Se deja registrado el DÍA de esta preparación, y recién acá: si algo
     * falló antes, no hubo preparación que anotar.
     *
     * Es lo que responde después "¿los datos que tengo son de hoy?", de donde
     * cuelgan la sincronización forzada al entrar y el cierre de sesión cuando
     * el día cambia con la app abierta.
     */
    await this.metaRepo.guardar(CLAVE_ULTIMA_PREPARACION, hoySql());

    onEtapa?.('LISTO');
    return { usuario, analista: datos.analista };
  }

  /* ========================================================================
     FLUJO OPERADOR — se mantiene igual: evento + muestra + detalle productos
     ======================================================================== */

  private async resolverEvento(
    datos: DatosPreparacion, sucursalId: number, evento: EventoParaGuardar
  ): Promise<number> {
    const codigoMuestra = datos.muestra?.codigoMuestra;
    if (!codigoMuestra) {
      return this.eventoRepo.asegurarEvento(evento);
    }

    const existente = await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalId);
    if (existente !== null) {
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

    const eventoId = await this.resolverEvento(datos, sucursalId, {
      sucursalId,
      fechaProgramada: evento.fechaProgramada,
      estado: evento.estado as EstadoEvento,
      nombre: datos.muestra?.nombreMuestra ?? '',
    });

    console.log('[Sincronizar] Evento ID:', eventoId);
    console.log('[Sincronizar] Detalles a guardar:', datos.muestra?.detalles?.length ?? 0);

    if (!datos.muestra) return;

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

    console.log('[Sincronizar] Muestra ID:', muestraId);
    console.log('[Sincronizar] Detalles a guardar:', datos.muestra.detalles.length);

    await this.muestraDetalleRepo.reemplazarDetalles(muestraId, datos.muestra.detalles);
    
    console.log('[Sincronizar] Detalles guardados exitosamente');
  }

  /* ========================================================================
     FLUJO ANALISTA — preparación liviana: evento + validacion_operacional
     No guarda muestra ni productos completos.
     ======================================================================== */

  private async guardarFlujoAnalista(datos: DatosPreparacion, operadorId: number): Promise<void> {
    const tienda = datos.tiendas[0];
    const evento = datos.evento;
    if (!tienda || !evento?.fechaProgramada) return;

    const sucursalId = await this.sucursalRepo.getIdPorCodigo(tienda.codigoTienda);
    if (sucursalId === null) return;

    // Guardar evento liviano
    const eventoId = await this.eventoRepo.asegurarEvento({
      sucursalId,
      fechaProgramada: evento.fechaProgramada,
      estado: evento.estado as EstadoEvento,
      nombre: datos.analista?.contexto?.nombreMuestra ?? '',
    });

    console.log('[SincronizarAnalista] Evento ID:', eventoId);

    // Guardar validacion_operacional (altillos + punto_venta) en sod_validacion_*
    if (datos.analista?.validacionOperacional) {
      const va = datos.analista.validacionOperacional;
      const ctx = datos.analista.contexto;

      const bloques: BloqueValidacionParaGuardar[] = [];
      if (va.altillos) {
        bloques.push(this.mapearBloque('ALTILLOS', va.altillos));
      }
      if (va.puntoVenta) {
        bloques.push(this.mapearBloque('PUNTO_VENTA', va.puntoVenta));
      }

      if (bloques.length > 0) {
        const input: JornadaValidacionParaGuardar = {
          eventoId,
          sucursalId,
          idAgenda: ctx.idAgenda,
          numeroAgenda: ctx.numeroAgenda,
          codigoMuestra: ctx.codigoMuestra,
          nombreMuestra: ctx.nombreMuestra,
          fechaJornada: ctx.fechaJornada,
          bloques,
        };

        const jornadaId = await this.validacionRepo.reemplazarJornada(input);
        console.log('[SincronizarAnalista] Jornada validacion ID:', jornadaId);

        // Persistir Pre Variance en tablas propias
        if (va.preVariance && va.preVariance.productos.length > 0) {
          await this.preVarianceRepo.reemplazarPreVariance({
            jornadaId,
            productos: va.preVariance.productos.map(p => ({
              idProductoBackend: p.idProductoBackend,
              sku: p.sku,
              descripcion: p.descripcion,
              stockTeorico: p.stockTeorico,
              valorUnitario: p.valorUnitario,
              inventariadoAntesPreVariance: p.inventariadoAntesPreVariance,
              fisicoVigente: p.fisicoVigente,
              diferenciaUnidades: p.diferenciaUnidades,
              diferenciaEnCosto: p.diferenciaEnCosto,
              estadoPreVariance: p.estadoPreVariance,
              ubicaciones: p.ubicaciones.map(u => ({
                idTagBackend: u.idTagBackend,
                numeroTag: u.numeroTag,
                zona: u.zona,
                cantidadInventariada: u.cantidadInventariada,
                cantidadPreVariance: u.cantidadPreVariance,
              })),
            })),
          });
          console.log('[SincronizarAnalista] Pre Variance guardado:', va.preVariance.productos.length, 'SKUs');
        }

        // Persistir Recuento en tablas propias
        if (va.recuento && va.recuento.productos.length > 0) {
          await this.recuentoRepo.reemplazarRecuento({
            jornadaId,
            productos: va.recuento.productos.map(p => ({
              idProductoBackend: p.idProductoBackend,
              sku: p.sku,
              descripcion: p.descripcion,
              stockTeorico: p.stockTeorico,
              valorUnitario: p.valorUnitario,
              fisicoActual: p.fisicoActual,
              diferenciaUnidades: p.diferenciaUnidades,
              diferenciaEnCosto: p.diferenciaEnCosto,
              esPreVariance: p.esPreVariance,
              estadoRecuento: p.estadoRecuento,
              ubicaciones: p.ubicaciones.map(u => ({
                idTagBackend: u.idTagBackend,
                numeroTag: u.numeroTag,
                zona: u.zona,
                cantidadInventariada: u.cantidadInventariada,
                cantidadRecuento: u.cantidadRecuento,
              })),
            })),
          });
          console.log('[SincronizarAnalista] Recuento guardado:', va.recuento.productos.length, 'SKUs');
        }
      }
    }
  }

  private mapearBloque(tipoValidacion: string, bloque: ValidacionBloqueAnalista): BloqueValidacionParaGuardar {
    return {
      tipoValidacion,
      codigoZona: bloque.resumen.codigoZona,
      nombreZona: bloque.resumen.nombreZona,
      objetivoPorcentaje: bloque.resumen.objetivoPorcentaje,
      tagsUsados: bloque.resumen.tagsUsados,
      tagsConfirmados: bloque.resumen.tagsConfirmados,
      tagsPendientes: bloque.resumen.tagsPendientes,
      porcentaje: bloque.resumen.porcentaje,
      cumple: bloque.resumen.cumple,
      tags: bloque.tags.map(t => ({
        idTagBackend: t.idTagBackend,
        numeroTag: t.numeroTag,
        codigoZona: t.codigoZona,
        nombreZona: t.nombreZona,
        productosTotal: t.productosTotal,
        productosConfirmados: t.productosConfirmados,
        estadoValidacion: t.estadoValidacion,
      })),
      productos: bloque.productos.map(p => ({
        idTagBackend: p.idTagBackend,
        numeroTag: p.numeroTag,
        idProductoBackend: p.idProductoBackend,
        sku: p.sku,
        descripcion: p.descripcion,
        cantidadInventariada: p.cantidadInventariada,
        cantidadAnalista: p.cantidadAnalista,
        estadoValidacion: p.estadoValidacion,
        flIncorporado: p.flIncorporado,
      })),
    };
  }

  /* ========================================================================
     COMÚN
     ======================================================================== */

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
