import { CatalogoZonificacion } from '../models/catalogo-zonificacion.model';

/* Catálogo del contrato v1 (sodimac-ws/tests/zonificacion/contrato/v1/catalogo.respuesta.json). Solo para specs. */
export const CATALOGO_V1: CatalogoZonificacion = {
  version: '2026-10-21',
  zonas: [
    { idRegla: 1, codigoZona: 'ALTILLO', nombre: 'ALTILLO', tagDesde: 1000, tagHasta: 2999, orden: 10, codigoTipoUbicacion: 'ALTILLO', idTipoUbicacion: 2 },
    { idRegla: 2, codigoZona: 'PUNTO_VENTA', nombre: 'PUNTO DE VENTA', tagDesde: 3000, tagHasta: 4999, orden: 20, codigoTipoUbicacion: 'PUNTO_VENTA', idTipoUbicacion: 1 },
    { idRegla: 3, codigoZona: 'BODEGA_TRASTIENDA', nombre: 'ZONAS DE REMATE / BODEGAS / TRASTIENDA', tagDesde: 5000, tagHasta: 5999, orden: 30, codigoTipoUbicacion: 'BODEGA', idTipoUbicacion: 4 },
    { idRegla: 4, codigoZona: 'EXHIBICIONES', nombre: 'EXHIBICIONES', tagDesde: 6000, tagHasta: 6999, orden: 40, codigoTipoUbicacion: 'EXHIBICION', idTipoUbicacion: 7 },
    { idRegla: 5, codigoZona: 'VENTAS_ADICIONALES', nombre: 'ZONAS DE VENTAS ADICIONALES', tagDesde: 7000, tagHasta: 8000, orden: 50, codigoTipoUbicacion: 'OTRO', idTipoUbicacion: 9 },
  ],
  parametros: { cantidadAdvertencia: null, cantidadMaxima: null, motivoLargoMinimo: 10, referenciaLargoMaximo: 250 },
};
