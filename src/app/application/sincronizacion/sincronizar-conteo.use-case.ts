import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';

// Simula el round-trip al WS mientras no exista el endpoint real de sincronización.
// Reemplazar por la llamada HTTP cuando esté disponible — la firma del use case no cambia.
const DELAY_SIMULADO_MS = 1500;

@Injectable({ providedIn: 'root' })
export class SincronizarConteoUseCase {
  private conteoRepo         = inject(CONTEO_REPOSITORY_TOKEN);
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);

  async execute(conteo: ConteoResumen): Promise<void> {
    if (conteo.estado !== 'FINALIZADO') {
      throw new Error('Solo un conteo finalizado se puede sincronizar');
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_SIMULADO_MS));

    await this.conteoRepo.marcarSincronizado(
      conteo.eventoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId
    );
    await this.sincronizacionRepo.registrarCarga(
      conteo.eventoId, conteo.pdaId, conteo.totalProductos
    );
  }
}
