import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { SgoSyncRepository, SgoSyncResult, AnalisisSgoResponse } from '../../domain/sgo/repositories/sgo-sync.repository';

@Injectable({ providedIn: 'root' })
export class HttpSgoSyncRepository implements SgoSyncRepository {
  private api = inject(ApiService);

  async sincronizarConteo(eventoId: number, datosConteo: unknown): Promise<SgoSyncResult> {
    const response = await this.api.post<SgoSyncResult>('sgo/sincronizar-conteo.php', {
      eventoId,
      datos: datosConteo,
    });
    
    return response;
  }

  async obtenerAnalisisReconteo(eventoId: number, iteracionActual: number): Promise<AnalisisSgoResponse> {
    const response = await this.api.post<AnalisisSgoResponse>('sgo/analisis-reconteo.php', {
      eventoId,
      iteracionActual,
    });
    
    return response;
  }
}
