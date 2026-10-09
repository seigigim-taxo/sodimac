import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { EstadoCargaServidor, EstadoCargasApiRepository } from '../../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { environment } from '../../../environments/environment';

/*
 * Corto a propósito: es una pregunta chica. Si el servidor no contesta en este
 * tiempo, esperar más no la responde mejor — se vuelve a intentar en el
 * próximo disparador.
 */
const CONSULTA_TIMEOUT_MS = 10_000;

/*
 * El servidor limita cuántos identificadores acepta por consulta. Se parte en
 * tandas para que una cola larga no la haga fallar entera.
 */
const MAXIMO_POR_CONSULTA = 100;

interface CargaCruda {
  carga_uid?: unknown;
  existe?: unknown;
  estado?: unknown;
  total_lecturas?: unknown;
  total_unidades?: unknown;
  codigo_tienda?: unknown;
  tag_codigo?: unknown;
  iteracion?: unknown;
  numero_agenda?: unknown;
}

interface RespuestaCruda {
  cargas?: unknown;
}

const ESTADOS = ['RECIBIDO', 'PROCESADO', 'ERROR'] as const;

@Injectable({ providedIn: 'root' })
export class EstadoCargasApiService implements EstadoCargasApiRepository {
  private api = inject(ApiService);

  async consultar(cargaUids: readonly string[]): Promise<EstadoCargaServidor[]> {
    const unicos = [...new Set(cargaUids.filter((uid) => uid.trim() !== ''))];
    const resultado: EstadoCargaServidor[] = [];

    for (let i = 0; i < unicos.length; i += MAXIMO_POR_CONSULTA) {
      const tanda = unicos.slice(i, i + MAXIMO_POR_CONSULTA);
      const respuesta = await this.api.post<RespuestaCruda>(
        environment.estadoCargasEndpoint,
        { carga_uids: tanda },
        { timeoutMs: CONSULTA_TIMEOUT_MS },
      );
      resultado.push(...this.leer(respuesta, tanda));
    }

    return resultado;
  }

  /*
   * Lo que el servidor no menciona se trata como "no se pudo saber", NO como "no
   * existe": omitirlo de la respuesta y devolverlo como inexistente son dos
   * afirmaciones muy distintas, y de la segunda depende que un TAG vuelva a ser
   * editable. Por eso solo se devuelve lo que vino explícito.
   */
  private leer(respuesta: RespuestaCruda, pedidos: readonly string[]): EstadoCargaServidor[] {
    const cargas = Array.isArray(respuesta?.cargas) ? (respuesta.cargas as CargaCruda[]) : [];
    const salida: EstadoCargaServidor[] = [];

    for (const c of cargas) {
      const uid = typeof c?.carga_uid === 'string' ? c.carga_uid : '';
      if (!uid || !pedidos.includes(uid) || typeof c.existe !== 'boolean') continue;

      const estado = ESTADOS.find((e) => e === c.estado) ?? null;
      salida.push({
        cargaUid: uid,
        existe: c.existe,
        estado: c.existe ? estado : null,
        totalLecturas: c.existe ? this.numero(c.total_lecturas) : null,
        totalUnidades: c.existe ? this.numero(c.total_unidades) : null,
        codigoTienda: c.existe ? this.texto(c.codigo_tienda) : null,
        tagCodigo: c.existe ? this.texto(c.tag_codigo) : null,
        iteracion: c.existe ? this.numero(c.iteracion) : null,
        numeroAgenda: c.existe ? this.texto(c.numero_agenda) : null,
      });
    }

    return salida;
  }

  private texto(valor: unknown): string | null {
    if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
    return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
  }

  private numero(valor: unknown): number | null {
    const n = typeof valor === 'string' ? Number(valor) : valor;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }
}
