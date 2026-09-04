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
import { DatosAnalista, DatosPreparacion, EtapaSincronizacion, JornadaPreparada, PreVarianceAnalista, RecuentoAnalista, UsuarioPreparado, ValidacionBloqueAnalista } from '../../domain/sincronizacion/models/preparacion.model';
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
      await this.guardarJornadas(datos);
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
     FLUJO OPERADOR — una jornada por día: evento + muestra + detalle productos
     ======================================================================== */

  private async resolverEvento(
    jornada: JornadaPreparada, sucursalId: number, evento: EventoParaGuardar
  ): Promise<number> {
    const codigoMuestra = jornada.muestra?.codigoMuestra;
    if (!codigoMuestra) {
      return this.eventoRepo.asegurarEvento(evento);
    }

    const existente = await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalId);
    if (existente !== null) {
      return existente;
    }

    return this.eventoRepo.crearEvento(evento);
  }

  /*
   * Se guardan TODAS las jornadas que llegaron, no solo la del día.
   *
   * La preparación es lo único que baja datos, y corre una vez al entrar. Si
   * dejáramos la de mañana sin escribir, el operador que sigue trabajando
   * después de medianoche se quedaría sin muestra y sin nada que contar hasta
   * volver a tener señal. Guardar las dos es lo que hace que la app siga siendo
   * offline al cruzar el día.
   *
   * Escribir las dos NO es lo mismo que trabajar las dos: cuál está activa lo
   * decide la selección del operador, más arriba.
   *
   * En serie y no con Promise.all a propósito: resolverEvento consulta y
   * después escribe, así que dos jornadas en paralelo sobre la misma tienda
   * podrían leer las dos "no existe" y crear dos eventos para la misma fecha.
   */
  private async guardarJornadas(datos: DatosPreparacion): Promise<void> {
    for (const jornada of datos.jornadas) {
      await this.guardarJornada(jornada);
    }
  }

  private async guardarJornada(jornada: JornadaPreparada): Promise<void> {
    const sucursalId = await this.sucursalRepo.getIdPorCodigo(jornada.tienda.codigoTienda);
    if (sucursalId === null) return;

    const eventoId = await this.resolverEvento(jornada, sucursalId, {
      sucursalId,
      fechaProgramada: jornada.evento.fechaProgramada,
      estado: jornada.evento.estado as EstadoEvento,
      nombre: jornada.muestra?.nombreMuestra ?? '',
    });

    console.log('[Sincronizar] Jornada', jornada.evento.fechaProgramada, '— Evento ID:', eventoId);

    if (!jornada.muestra) return;

    const muestraId = await this.muestraRepo.asegurarMuestra({
      codigoMuestra: jornada.muestra.codigoMuestra,
      eventoId,
      sucursalId,
      nombre: jornada.muestra.nombreMuestra,
      iteracion: 1,
      estado: 'ACTIVA',
      idAgenda: jornada.muestra.idAgenda,
      numeroAgenda: jornada.muestra.numeroAgenda,
    });

    await this.muestraDetalleRepo.reemplazarDetalles(muestraId, jornada.muestra.detalles);

    console.log(
      '[Sincronizar] Jornada', jornada.evento.fechaProgramada,
      '— Muestra ID:', muestraId,
      '—', jornada.muestra.detalles.length, 'detalles guardados'
    );
  }

  /* ========================================================================
     FLUJO ANALISTA — preparación liviana: evento + validacion_operacional
     No guarda muestra ni productos completos.
     ======================================================================== */

  private async guardarFlujoAnalista(datos: DatosPreparacion, operadorId: number): Promise<void> {
    /*
     * El analista revisa UNA jornada, la que el backend seleccionó: su
     * preparación es liviana y trae una sola. La ventana de dos días es del
     * operador, que es quien cuenta.
     */
    const jornada = datos.jornadas[0];
    if (!jornada) return;

    const sucursalId = await this.sucursalRepo.getIdPorCodigo(jornada.tienda.codigoTienda);
    if (sucursalId === null) return;

    // Guardar evento liviano
    const eventoId = await this.eventoRepo.asegurarEvento({
      sucursalId,
      fechaProgramada: jornada.evento.fechaProgramada,
      estado: jornada.evento.estado as EstadoEvento,
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

  /*
   * Las zonas se guardan para cada tienda que aparezca en las jornadas.
   *
   * El backend manda UNA lista de zonas para toda la respuesta, pero
   * sod_zona las guarda por sucursal. Mientras las dos jornadas sean de la
   * misma tienda esto escribe una sola vez; si algún día vinieran de tiendas
   * distintas, la segunda jornada tendría zonas en vez de quedarse sin
   * ninguna y sin que nadie se entere.
   *
   * Si no hay jornadas se cae a la tienda del maestro: el operador sin trabajo
   * asignado igual necesita sus zonas cargadas.
   */
  private async guardarZonas(datos: DatosPreparacion): Promise<void> {
    const codigos = new Set(datos.jornadas.map((j) => j.tienda.codigoTienda));
    if (codigos.size === 0 && datos.tiendas[0]) {
      codigos.add(datos.tiendas[0].codigoTienda);
    }

    const zonasParaGuardar = datos.zonas.map(z => ({
      nombre: z.codigo,
      descripcion: z.descripcion,
      tagDesde: z.tagDesde,
      tagHasta: z.tagHasta,
    }));

    for (const codigoTienda of codigos) {
      const sucursalId = await this.sucursalRepo.getIdPorCodigo(codigoTienda);
      if (sucursalId === null) continue;

      await this.zonaRepo.reemplazarDeSucursal(sucursalId, zonasParaGuardar);
    }
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
