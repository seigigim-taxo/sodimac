import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { environment } from '../../../environments/environment';
import { CatalogoZonificacion } from '../../domain/zonificacion/models/catalogo-zonificacion.model';
import { EstadoAgenda, ListaAgendas } from '../../domain/zonificacion/models/estado-agenda.model';
import { IdentidadOperador, ResultadoOperacion, SolicitudOperacion, TipoOperacionZonificacion } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { ZonificacionApiRepository } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { parsearCatalogo, parsearListaAgendas, parsearRespuestaEstado, parsearResultadoOperacion } from './zonificacion.parser';

/* Archivo de cada operación en la carpeta de zonificación del WS (sin sufijo ni .php). */
const ARCHIVO_POR_OPERACION: Record<TipoOperacionZonificacion, string> = {
  GUARDAR_RANGO: 'rango-guardar',
  ELIMINAR_RANGO: 'rango-eliminar',
  ANULAR_TAG: 'tag-anular',
  CONFIRMAR: 'confirmar',
  REABRIR: 'reabrir',
};

/*
 * Lecturas: unos pocos segundos (≈245 ms por consulta a la base). Las
 * escrituras tardan ~5 s; el timeout por defecto de ApiService (30 s) alcanza
 * para ambas, así que solo la lista de agendas y el catálogo, que son chicas,
 * se acortan.
 */
const LECTURA_CORTA_TIMEOUT_MS = 20_000;

@Injectable({ providedIn: 'root' })
export class ZonificacionApiService implements ZonificacionApiRepository {
  private api = inject(ApiService);

  /*
   * El endpoint depende del entorno: desarrollo usa las copias `_dev`
   * (`rango-guardar_dev.php`) y producción las originales. Ambos escriben en la
   * misma base: se prueba solo en agendas de HC TAXO.
   */
  private ruta(archivo: string): string {
    return `${environment.zonificacionPath}/${archivo}${environment.zonificacionSufijo}.php`;
  }

  async obtenerCatalogo(): Promise<CatalogoZonificacion> {
    const data = await this.api.get<unknown>(this.ruta('catalogo'), undefined, { timeoutMs: LECTURA_CORTA_TIMEOUT_MS });
    return parsearCatalogo(data);
  }

  async listarAgendas(identidad: IdentidadOperador): Promise<ListaAgendas> {
    const data = await this.api.post<unknown>(this.ruta('agendas'), this.identidad(identidad), { timeoutMs: LECTURA_CORTA_TIMEOUT_MS });
    return parsearListaAgendas(data);
  }

  async obtenerEstado(identidad: IdentidadOperador, idAgenda: number, numeroAgenda: string): Promise<EstadoAgenda> {
    const data = await this.api.post<unknown>(this.ruta('estado'), {
      ...this.identidad(identidad),
      numero_agenda: numeroAgenda,
      id_agenda: idAgenda,
    });
    return parsearRespuestaEstado(data);
  }

  async enviar(solicitud: SolicitudOperacion): Promise<ResultadoOperacion> {
    const data = await this.api.post<unknown>(this.ruta(ARCHIVO_POR_OPERACION[solicitud.tipo]), {
      operacion_uid: solicitud.operacionUid,
      numero_agenda: solicitud.numeroAgenda,
      id_agenda: solicitud.idAgenda,
      ...this.identidad(solicitud.identidad),
      fecha_hora_local: solicitud.fechaHoraLocal,
      datos: solicitud.datos,
    });
    return parsearResultadoOperacion(data);
  }

  private identidad(i: IdentidadOperador): Record<string, string> {
    return {
      operador_login: i.operadorLogin,
      operador_rut: i.operadorRut,
      pda_codigo: i.pdaCodigo,
      version_app: i.versionApp,
    };
  }
}
