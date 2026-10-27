import { Injectable, inject } from '@angular/core';
import { CatalogoZonificacion } from '../../domain/zonificacion/models/catalogo-zonificacion.model';
import { ZONIFICACION_API_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';

export type OrigenDatos = 'SERVIDOR' | 'COPIA' | 'NINGUNO';

export interface CatalogoCargado {
  catalogo: CatalogoZonificacion | null;
  /* SERVIDOR: recién descargado. COPIA: sin red, el último guardado. NINGUNO: sin red y sin copia. */
  origen: OrigenDatos;
  fechaDescarga: string | null;
}

/*
 * El catálogo de zonas (qué banda de TAG es cada zona y los umbrales). Se pide
 * al servidor cada vez que hay red y se guarda; sin red se usa la última copia.
 * Es la única fuente de zonas de este módulo: no se toca la del conteo.
 */
@Injectable({ providedIn: 'root' })
export class CargarCatalogoZonificacionUseCase {
  private api = inject(ZONIFICACION_API_REPOSITORY_TOKEN);
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);

  async execute(): Promise<CatalogoCargado> {
    try {
      const catalogo = await this.api.obtenerCatalogo();
      await this.local.guardarCatalogo(catalogo);
      return { catalogo, origen: 'SERVIDOR', fechaDescarga: null };
    } catch (err) {
      console.error('[Zonificacion] no se pudo descargar el catálogo, se usa la copia:', err);
      const copia = await this.local.obtenerCatalogo();
      return copia
        ? { catalogo: copia.valor, origen: 'COPIA', fechaDescarga: copia.fechaDescarga }
        : { catalogo: null, origen: 'NINGUNO', fechaDescarga: null };
    }
  }
}
