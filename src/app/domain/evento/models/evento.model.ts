export interface Evento {
    id: number;
    agendaId: number | null;
    sucursalId: number;
    fechaProgramada: string;
    fechaEjecucion: string | null;
    estado: 'ABIERTO' | 'CERRADO' | 'EN_PROCESO' | 'CANCELADO';
    fechaRegistro: string;
}
