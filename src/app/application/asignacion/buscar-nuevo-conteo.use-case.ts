import { Injectable, inject, isDevMode } from '@angular/core';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { SincronizarDatosInicialesUseCase } from '../sincronizacion/sincronizar-datos-iniciales.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { JornadaPreparada } from '../../domain/sincronizacion/models/preparacion.model';

/*
 * "¿Me toca otro conteo?" — lo que pregunta el operador que ya terminó el suyo
 * y quedó a la espera.
 *
 * CÓMO SE AVERIGUA
 *
 * Se llama al MISMO endpoint de preparación que se usa al iniciar sesión y se
 * recorren las jornadas que devuelve —hoy y mañana— mirando si el código de
 * muestra de cada una ya está en la base. La primera que no esté es trabajo que
 * el SGO asignó y la PDA no tiene, y se insertan los datos; si están todas, lo
 * que hay en el servidor es lo mismo que la PDA ya tiene y no se escribe nada.
 *
 * LA TIENDA SALE DE LA RESPUESTA, NO DEL OPERADOR
 *
 * El conteo siguiente puede ser en OTRA tienda: al operador se lo asignan por
 * jornada, no por local. Por eso la sucursal contra la que se compara —y la que
 * se devuelve— sale de la jornada misma, y no de la que el operador tiene
 * abierta en pantalla.
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
export interface ResultadoBusquedaConteo {
  /** Conteo nuevo a tomar, o null si no hay trabajo nuevo que ofrecer. */
  asignacion: AsignacionConteo | null;
  /*
   * Evento local que YA tiene el mismo codigo_muestra que acaba de devolver el
   * SGO para la jornada de HOY, cuando existe. Null en cualquier otro caso
   * (código nuevo, o preparación incompleta).
   *
   * Ya no se usa para decidir si conviene "reabrir" —el conteo dejó de
   * cerrarse a nivel de evento, así que no hay nada que reabrir—, pero se deja
   * expuesto: sigue siendo información válida ("ya tenemos esta muestra") y
   * sacarlo obligaría a repetir la descarga de preparación y la comparación de
   * códigos en cualquier lugar que la necesite en el futuro.
   */
  eventoCoincidenteId: number | null;
}

@Injectable({ providedIn: 'root' })
export class BuscarNuevoConteoUseCase {
  private sincronizar  = inject(SincronizarDatosInicialesUseCase);
  private muestraRepo  = inject(MUESTRA_REPOSITORY_TOKEN);
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);

  async execute(session: Session): Promise<ResultadoBusquedaConteo> {
    const datos = await this.sincronizar.descargar(session);

    let eventoCoincidenteHoy: number | null = null;

    for (const jornada of datos.jornadas) {
      const codigoMuestra = jornada.muestra?.codigoMuestra?.trim();
      const codigoTienda  = jornada.tienda.codigoTienda?.trim();

      /*
       * Sin muestra o sin tienda no hay trabajo que tomar en ESTA jornada.
       * Escribir igual pisaría lo que la PDA ya tiene con una preparación
       * incompleta; se saltea y se sigue buscando en la siguiente.
       */
      if (!codigoMuestra || !codigoTienda) continue;

      const sucursalId = await this.sucursalRepo.getIdPorCodigo(codigoTienda);

      /*
       * Un solo argumento string: el puente de consola de Capacitor no
       * serializa bien un objeto pasado como segundo argumento (queda como
       * "[object Object]" en logcat) — sí lo hace con un string ya armado.
       */
      if (isDevMode()) {
        console.log(`[BuscarNuevoConteo] ${JSON.stringify({ fecha: jornada.evento.fechaProgramada, codigoTienda, sucursalId, codigoMuestraSGO: codigoMuestra })}`);
      }

      /*
       * Si la tienda todavía no existe localmente, la muestra tampoco puede
       * existir: es la primera vez que a esta PDA le toca ese local, o sea
       * trabajo nuevo por definición. Se salta la comparación y se persiste,
       * que es justamente lo que crea la tienda.
       */
      if (sucursalId !== null) {
        const existente = await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalId);
        if (existente !== null) {
          /*
           * Ya la tenemos: el SGO todavía no programó nada nuevo PARA ESTA
           * jornada. Si es la de hoy, se guarda el evento coincidente por si
           * conviene reabrirlo; de cualquier forma se sigue buscando en las
           * jornadas siguientes (mañana podría ser nueva).
           */
          if (jornada === datos.jornadas[0]) eventoCoincidenteHoy = existente;
          continue;
        }
      }

      /*
       * Hay jornada nueva. Se persisten TODAS las jornadas de la respuesta —no
       * solo esta— con el mismo camino que la sincronización de inicio de
       * sesión: si además de la de hoy vino la de mañana, queda bajada y el
       * operador puede cruzar la medianoche sin señal.
       */
      await this.sincronizar.persistir(session, datos);
      return { asignacion: await this.describir(jornada), eventoCoincidenteId: null };
    }

    /*
     * Ninguna jornada trae algo que la PDA no tenga: el resultado normal de
     * esta consulta, no un error — el operador que terminó temprano la va a
     * tocar varias veces antes de que el SGO programe la jornada siguiente.
     */
    if (isDevMode() && eventoCoincidenteHoy === null) console.log('[BuscarNuevoConteo] sin trabajo nuevo');
    return { asignacion: null, eventoCoincidenteId: eventoCoincidenteHoy };
  }

  /*
   * La asignación que se le informa a la pantalla, releída DESPUÉS de
   * persistir: si la tienda era desconocida, recién ahora existe y recién
   * ahora tiene id local.
   *
   * Se informa la asignación aunque no se haya podido releer el evento: el
   * trabajo YA quedó escrito, y devolver null haría que la pantalla dijera
   * "no hay nada nuevo" justo después de haber insertado una jornada.
   */
  private async describir(jornada: JornadaPreparada): Promise<AsignacionConteo> {
    const codigoMuestra = jornada.muestra?.codigoMuestra?.trim() ?? '';

    const sucursalFinal = await this.sucursalRepo.getIdPorCodigo(jornada.tienda.codigoTienda);
    const eventoId = sucursalFinal !== null
      ? await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalFinal)
      : null;

    const nombre = jornada.muestra?.nombreMuestra?.trim();

    return {
      eventoId:        eventoId ?? 0,
      sucursalId:      sucursalFinal ?? 0,
      nombre:          nombre && nombre !== '' ? nombre : `Conteo ${eventoId ?? ''}`.trim(),
      fechaProgramada: jornada.evento.fechaProgramada.slice(0, 10),
    };
  }
}
