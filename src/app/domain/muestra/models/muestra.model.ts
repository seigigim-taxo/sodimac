export interface Muestra {
    id: number;
    /* Clave del backend; null en muestras creadas antes de que existiera. */
    codigoMuestra: string | null;
    idAgenda: number | null;
    eventoId: number;
    sucursalId: number;
    iteracion: number;
    estado: string;
    nombre: string | null;
    nombreArchivo: string | null;
}
