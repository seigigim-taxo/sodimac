/*
 * Cómo se cuenta el próximo SKU.
 *
 *  - 'uno'      → una lectura suma una unidad y el foco vuelve al escáner.
 *  - 'cantidad' → la lectura solo captura el SKU; las unidades se tipean después
 *                 y recién ahí se registra.
 *
 * Es una preferencia de la PDA, no del componente de pantalla: por eso vive en
 * domain y no declarado localmente en counting.page — tanto el almacenamiento
 * (data) como el estado (state) necesitan el mismo tipo.
 */
export type ModoCaptura = 'uno' | 'cantidad';
