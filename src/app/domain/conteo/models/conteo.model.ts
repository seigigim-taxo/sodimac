/*
 * Estado de la RONDA (sod_conteo), distinto del estado de una línea:
 * la ronda se abre vacía, se finaliza al terminar de contar y se marca
 * sincronizada cuando sube al servidor.
 */
export type EstadoRonda = 'ABIERTO' | 'FINALIZADO' | 'SINCRONIZADO';

/*
 * Una ronda de conteo = una iteración del evento.
 *
 * Existe desde que se abre, aunque no tenga una sola línea contada. Ese es el
 * punto: permite distinguir "la ronda 2 está abierta y vacía" de "la ronda 1
 * está cerrada", que antes era imposible porque la iteración se derivaba de
 * MAX() sobre las propias líneas.
 */
export interface Conteo {
  id: number;
  eventoId: number;
  iteracion: number;
  estado: EstadoRonda;
  fechaApertura: string;
  fechaCierre: string | null;
}
