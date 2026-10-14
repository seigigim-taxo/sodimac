import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { SincronizarConteoUseCase } from './sincronizar-conteo.use-case';

/*
 * Marca como SINCRONIZADOS los TAGs que el servidor ya tiene pero que la PDA
 * todavía muestra FINALIZADOS: la cola dice ENVIADO y la marca del TAG se perdió
 * (el caso del TAG 7001, o la app cerrada entre las dos escrituras).
 *
 * No habla con el servidor. Usa el mismo camino que el botón "Sincronizar", que
 * para un envío ya recibido solo compara el contenido: si el TAG no cambió desde
 * que se envió, lo marca; si cambió, NO lo marca (lo nuevo no viajó) y lo deja
 * como está con el aviso de siempre.
 */
@Injectable({ providedIn: 'root' })
export class SanarTagsEnviadosUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private sincronizarConteo = inject(SincronizarConteoUseCase);

  /* Devuelve cuántos TAGs quedaron marcados. */
  async execute(): Promise<number> {
    const filas = await this.sincronizacionRepo.listarEnviadosPorSanar();
    if (filas.length === 0) return 0;

    // Un operador + PDA tiene varios TAGs: se piden sus resúmenes una sola vez.
    const resumenes = new Map<string, ConteoResumen[]>();
    let sanados = 0;

    for (const fila of filas) {
      if (!fila.operadorId || !fila.pdaId || !fila.conteoId || !fila.ubicacionId) continue;

      try {
        const clave = `${fila.operadorId}-${fila.pdaId}`;
        let delOperador = resumenes.get(clave);
        if (!delOperador) {
          delOperador = await this.conteoRepo.getResumenes(fila.operadorId, fila.pdaId);
          resumenes.set(clave, delOperador);
        }

        const resumen = delOperador.find((r) =>
          r.conteoId === fila.conteoId && r.ubicacionId === fila.ubicacionId && r.estado === 'FINALIZADO');
        if (!resumen) continue;

        await this.sincronizarConteo.execute(resumen);
        sanados++;
      } catch (err) {
        // Típicamente: el TAG cambió después de enviarse. Se deja como está.
        console.warn('[SanarTagsEnviados] no se pudo marcar', fila.cargaUid, err);
      }
    }

    return sanados;
  }
}
