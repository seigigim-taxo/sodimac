import { Injectable } from '@angular/core';
import { SgoSyncRepository, SgoSyncResult, AnalisisSgoResponse } from '../../../domain/sgo/repositories/sgo-sync.repository';

const DELAY_SINCRONIZACION_MS = 2000;
const DELAY_ANALISIS_MS = 1500;

@Injectable({ providedIn: 'root' })
export class MockSgoSyncRepository implements SgoSyncRepository {
  async sincronizarConteo(eventoId: number, datosConteo: unknown): Promise<SgoSyncResult> {
    await this.simularDelay(DELAY_SINCRONIZACION_MS);
    
    const registros = Array.isArray(datosConteo) ? datosConteo.length : 1;
    
    console.log('[MockSgoSync] sincronizarConteo', { eventoId, registros });
    
    return {
      success: true,
      mensaje: 'Conteo sincronizado con el SGO (mock)',
      datosEnviados: registros,
    };
  }

  async obtenerAnalisisReconteo(eventoId: number, iteracionActual: number): Promise<AnalisisSgoResponse> {
    await this.simularDelay(DELAY_ANALISIS_MS);
    
    console.log('[MockSgoSync] obtenerAnalisisReconteo', { eventoId, iteracionActual });
    
    return {
      requiereReconteo: true,
      iteracion: iteracionActual + 1,
      skusARecontar: Math.floor(Math.random() * 10) + 5,
    };
  }

  private simularDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
