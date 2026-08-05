import { Injectable, inject } from '@angular/core';
import { PREPARACION_API_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/preparacion-api.repository';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { DatosPreparacion, EtapaSincronizacion } from '../../domain/sincronizacion/models/preparacion.model';
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

  async execute(
    session: Session,
    onEtapa?: (etapa: EtapaSincronizacion) => void
  ): Promise<void> {
    onEtapa?.('DESCARGANDO');
    const datos = await this.preparacionApi.preparar({
      correo: session.correo,
      rut: session.rutNormalizado,
    });

    onEtapa?.('GUARDANDO');
    const usuario = datos.usuario;
    const { rut, rutDv } = partirRut(usuario.rutNormalizado);

    /*
     * El operador ya existe desde el login (sin nombre ni cargo): esto completa
     * el perfil con lo que el login no devuelve.
     */
    await this.operadorRepo.guardarPerfil({
      cargo: usuario.cargo,
      rut,
      rutDv,
      nombres: usuario.nombres,
      apellidoPaterno: usuario.apellidoPaterno,
      apellidoMaterno: usuario.apellidoMaterno,
      correo: usuario.login,
    });

    /*
     * Las tiendas van después del perfil porque el vínculo en sod_user_sucursal
     * apunta al operador: si el usuario no está, la FK falla.
     */
    await this.sucursalRepo.guardarDeUsuario(
      session.operadorId,
      datos.tiendas.map((t) => ({
        codigoTienda: t.codigoTienda,
        nombre: t.nombreTienda,
      }))
    );

    await this.guardarEventoYMuestra(datos);

    onEtapa?.('LISTO');
  }

  /*
   * La cadena es sucursal → evento → muestra, y cada eslabón es FK del
   * siguiente. Si falta alguno de los datos, se corta sin escribir nada: es
   * preferible una tienda sin evento a un evento con fecha inventada.
   */
  private async guardarEventoYMuestra(datos: DatosPreparacion): Promise<void> {
    const tienda = datos.tiendas[0];
    const evento = datos.evento;
    if (!tienda || !evento?.fechaProgramada) return;

    /*
     * El `sucursal_id` que manda el backend es suyo (48). El id local sale de
     * traducir el código de tienda, que es la identidad compartida.
     */
    const sucursalId = await this.sucursalRepo.getIdPorCodigo(tienda.codigoTienda);
    if (sucursalId === null) return;

    const eventoId = await this.eventoRepo.asegurarEvento({
      sucursalId,
      fechaProgramada: evento.fechaProgramada,
      estado: evento.estado as EstadoEvento,
      nombre: datos.muestra?.nombreMuestra ?? '',
    });

    if (!datos.muestra) return;

    const muestraId = await this.muestraRepo.asegurarMuestra({
      codigoMuestra: datos.muestra.codigoMuestra,
      eventoId,
      sucursalId,
      nombre: datos.muestra.nombreMuestra,
    });

    await this.muestraDetalleRepo.reemplazarDetalles(muestraId, datos.muestra.detalles);
  }
}
