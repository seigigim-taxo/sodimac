import { Injectable, inject } from '@angular/core';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { InfoProductoMuestra } from './load-muestra-set.use-case';

export interface CodigoResuelto {
  /* El código que existe en la muestra (puede diferir del escaneado: ver abajo). */
  codigoResuelto: string;
  info: InfoProductoMuestra;
}

/*
 * ¿A qué producto de la muestra corresponde este código escaneado?
 *
 * Busca primero coincidencia exacta. Si no existe y el código empieza con "0",
 * intenta sin ese primer carácter para cubrir el caso de Excel/WS que elimina
 * ceros iniciales (ej: la PDA escanea 079567520375, la muestra tiene
 * 79567520375). La exacta gana siempre sobre la variante sin cero.
 *
 * Las dos variantes se piden en UNA sola consulta.
 */
@Injectable({ providedIn: 'root' })
export class BuscarCodigoMuestraUseCase {
  private detalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);

  async execute(muestraId: number | null, codigoLectura: string): Promise<CodigoResuelto | null> {
    if (muestraId === null) return null;

    const normalizado = codigoLectura.trim().toUpperCase();
    if (!normalizado) return null;

    const candidatos = [normalizado];
    if (normalizado.startsWith('0') && normalizado.length > 1) {
      candidatos.push(normalizado.slice(1));
    }

    const encontrados = await this.detalleRepo.buscarCodigos(muestraId, candidatos);
    if (encontrados.length === 0) return null;

    for (const candidato of candidatos) {
      const fila = encontrados.find((f) => f.codigoLectura === candidato);
      if (fila) {
        return {
          codigoResuelto: candidato,
          info: {
            productoId: fila.productoId,
            descripcion: fila.descripcion,
            sku: fila.sku,
            codigoBarras: fila.codigoBarras,
          },
        };
      }
    }
    return null;
  }
}
