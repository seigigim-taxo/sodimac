export interface Muestra {
    id: number;
    /* Clave del backend; null en muestras creadas antes de que existiera. */
    codigoMuestra: string | null;
    eventoId: number;
    sucursalId: number;
    nombre: string | null;
    nombreArchivo: string | null;
}
