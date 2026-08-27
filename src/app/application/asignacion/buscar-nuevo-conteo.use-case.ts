import { Injectable, inject, isDevMode } from '@angular/core';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { SincronizarDatosInicialesUseCase } from '../sincronizacion/sincronizar-datos-iniciales.use-case';
import { Session } from '../../domain/auth/models/session.model';

/*
 * "¿Me toca otro conteo?" — lo que pregunta el operador que ya terminó el suyo
 * y quedó a la espera.
 *
 * CÓMO SE AVERIGUA
 *
 * Se llama al MISMO endpoint de preparación que se usa al iniciar sesión y se
 * mira si el código de muestra que devuelve ya está en la base. Si no está, el
 * SGO asignó una jornada nueva y se insertan los datos; si está, lo que hay en
 * el servidor es lo mismo que la PDA ya tiene y no se escribe nada.
 *
 * LA TIENDA SALE DE LA RESPUESTA, NO DEL OPERADOR
 *
 * El conteo siguiente puede ser en OTRA tienda: al operador se lo asignan por
 * jornada, no por local. Por eso la sucursal contra la que se compara —y la que
 * se devuelve— se resuelve del código de tienda que trae la preparación, y no
 * de la que el operador tiene abierta en pantalla.
 *
 * Comparar contra la tienda abierta daba dos fallas juntas: la muestra ya
 * conocida de otra tienda se veía como nueva y se reinsertaba en cada consulta,
 * y la pantalla recargaba los eventos del local viejo, así que el conteo recién
 * creado no aparecía — el aviso lo nombraba y no había tarjeta que seleccionar.
 *
 * POR QUÉ EL CÓDIGO DE MUESTRA Y NO id_agenda
 *
 * Porque es la identidad que el sistema YA usa: resolverEvento, en la
 * sincronización de inicio de sesión, decide con esa misma consulta si cuelga
 * la muestra de un evento existente o crea uno. Dos claves decidiendo lo mismo
 * terminan en desacuerdo, y el desacuerdo acá significa avisarle al operador de
 * un conteo que después queda colgado del evento viejo.
 *
 * Además el riesgo apunta para el lado seguro. Si una agenda llegara a tener
 * más de una muestra, comparar por agenda diría "no hay nada nuevo" habiendo
 * trabajo nuevo y el operador se quedaría esperando. Y codigo_muestra es
 * obligatorio en la respuesta, mientras que id_agenda puede venir nulo.
 *
 * LO QUE ESTO NO ARREGLA
 *
 * Se baja la preparación completa —productos, muestra, zonas— para averiguar si
 * hay algo nuevo. Es lo que el endpoint liviano venía a evitar; se pidió y no
 * existe. Cuando exista, lo único que cambia es de dónde sale el código.
 *
 * No reabre nada de lo anterior: un conteo finalizado está cerrado y sus líneas
 * dejaron de ser editables. Lo que viene es trabajo nuevo, con su propia
 * muestra, y puede ser de otra jornada.
 */
@Injectable({ providedIn: 'root' })
export class BuscarNuevoConteoUseCase {
  private sincronizar  = inject(SincronizarDatosInicialesUseCase);
  private muestraRepo  = inject(MUESTRA_REPOSITORY_TOKEN);
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);

  async execute(session: Session): Promise<AsignacionConteo | null> {
    const datos = await this.sincronizar.descargar(session);

    const codigoMuestra = datos.muestra?.codigoMuestra?.trim();
    const codigoTienda  = datos.tiendas?.[0]?.codigoTienda?.trim();

    /*
     * Sin muestra o sin tienda no hay trabajo que tomar. Escribir igual pisaría
     * lo que la PDA ya tiene con una preparación incompleta, y el operador
     * puede volver a consultar pero no puede deshacer eso.
     */
    if (!codigoMuestra || !codigoTienda) {
      if (isDevMode()) console.log('[BuscarNuevoConteo] preparación sin muestra o sin tienda');
      return null;
    }

    const sucursalId = await this.sucursalRepo.getIdPorCodigo(codigoTienda);
    if (isDevMode()) console.log('[BuscarNuevoConteo]', { codigoTienda, sucursalId, codigoMuestra });

    /*
     * Si la tienda todavía no existe localmente, la muestra tampoco puede
     * existir: es la primera vez que a esta PDA le toca ese local, o sea
     * trabajo nuevo por definición. Se salta la comparación y se persiste,
     * que es justamente lo que crea la tienda.
     */
    if (sucursalId !== null) {
      const existente = await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalId);
      /*
       * Ya la tenemos: el SGO todavía no programó nada nuevo. Es el resultado
       * normal de esta consulta, no un error — el operador que terminó temprano
       * la va a tocar varias veces antes de que aparezca la jornada siguiente.
       */
      if (existente !== null) return null;
    }

    /*
     * Hay jornada nueva. Se persiste con el mismo camino que la sincronización
     * de inicio de sesión —evento, muestra, detalles y zonas— en vez de una
     * inserción propia: dos rutas de escritura sobre las mismas tablas se
     * separan en cuanto una de las dos cambie.
     */
    await this.sincronizar.persistir(session, datos);

    /*
     * Se relee la tienda DESPUÉS de persistir: si era desconocida, recién ahora
     * existe y recién ahora tiene id local.
     */
    const sucursalFinal = await this.sucursalRepo.getIdPorCodigo(codigoTienda);
    const eventoId = sucursalFinal !== null
      ? await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalFinal)
      : null;

    const nombre = datos.muestra?.nombreMuestra?.trim();

    /*
     * Se informa la asignación aunque no se haya podido releer el evento: el
     * trabajo YA quedó escrito, y devolver null haría que la pantalla dijera
     * "no hay nada nuevo" justo después de haber insertado una jornada.
     */
    return {
      eventoId:        eventoId ?? 0,
      sucursalId:      sucursalFinal ?? 0,
      nombre:          nombre && nombre !== '' ? nombre : `Conteo ${eventoId ?? ''}`.trim(),
      fechaProgramada: (datos.evento?.fechaProgramada ?? '').slice(0, 10),
    };
  }
}
